const sequelize = require('../../config/db');
const { Op } = require('sequelize');
const {
  Warehouse,
  ReverseLogisticsEntry,
  ReverseLogisticsItem,
  ReverseLogisticsExit,
  ReverseLogisticsExitItem,
} = require('../models');
const asyncHandler = require('../utils/asyncHandler');
const { created, fail } = require('../utils/response');
const { assertWarehouseAccess } = require('../utils/warehouseAccess');
const { money, qty } = require('../utils/number');

function parseSerials(value) {
  if (Array.isArray(value)) return value.map((serial) => String(serial || '').trim()).filter(Boolean);
  return String(value || '').split(/[\r\n\t,;]+/).map((serial) => serial.trim()).filter(Boolean);
}

function operationReference(prefix) {
  const now = new Date();
  const stamp = [
    now.getFullYear(),
    String(now.getMonth() + 1).padStart(2, '0'),
    String(now.getDate()).padStart(2, '0'),
    '-',
    String(now.getHours()).padStart(2, '0'),
    String(now.getMinutes()).padStart(2, '0'),
    String(now.getSeconds()).padStart(2, '0'),
    '-',
    String(now.getMilliseconds()).padStart(3, '0'),
  ].join('');
  return `${prefix}-${stamp}`;
}

async function loadReverseWarehouse(req, res) {
  const warehouse = await Warehouse.findByPk(req.params.id);
  if (!warehouse) {
    fail(res, 404, 'Estoque não encontrado.');
    return null;
  }
  if (!warehouse.isReverseLogistics) {
    fail(res, 400, 'Esta operação é exclusiva de estoque de logística reversa.');
    return null;
  }
  if (warehouse.status !== 'ativo') {
    fail(res, 400, 'O estoque de logística reversa precisa estar ativo.');
    return null;
  }
  try {
    assertWarehouseAccess(req.user, warehouse.id);
  } catch (error) {
    fail(res, error.statusCode || 403, error.message);
    return null;
  }
  return warehouse;
}

function normalizeEntryItems(items) {
  const normalized = [];
  const serialsInRequest = new Set();

  for (const [index, raw] of items.entries()) {
    const code = String(raw.code || '').trim().toUpperCase();
    const description = String(raw.description || '').trim();
    const serialNumbers = parseSerials(raw.serialNumbers ?? raw.serialsText);
    const unit = String(raw.unit || 'un').trim() || 'un';
    const unitCost = money(raw.unitCost || 0);
    const condition = String(raw.condition || 'usado').trim() || 'usado';
    const notes = String(raw.notes || raw.itemNotes || '').trim() || null;

    if (!code) throw new Error(`Item ${index + 1}: informe o código do material/equipamento.`);
    if (!description) throw new Error(`Item ${index + 1}: informe a descrição.`);
    if (unitCost < 0) throw new Error(`Item ${index + 1}: o valor unitário não pode ser negativo.`);

    if (serialNumbers.length) {
      for (const serialNumber of serialNumbers) {
        const key = serialNumber.toUpperCase();
        if (serialsInRequest.has(key)) throw new Error(`Serial repetido na entrada: ${serialNumber}.`);
        serialsInRequest.add(key);
      }
      normalized.push({ code, description, serialNumbers, quantity: serialNumbers.length, unit: 'un', unitCost, condition, notes, requiresSerial: true });
    } else {
      const quantity = qty(raw.quantity);
      if (quantity <= 0) throw new Error(`Item ${index + 1}: informe uma quantidade válida ou ao menos um serial.`);
      normalized.push({ code, description, serialNumbers: [], quantity, unit, unitCost, condition, notes, requiresSerial: false });
    }
  }

  return normalized;
}

exports.entry = asyncHandler(async (req, res) => {
  const warehouse = await loadReverseWarehouse(req, res);
  if (!warehouse) return;

  const items = Array.isArray(req.body.items) ? req.body.items : [];
  if (!items.length) return fail(res, 400, 'Adicione ao menos um item à entrada de logística reversa.');

  let normalizedItems;
  try {
    normalizedItems = normalizeEntryItems(items);
  } catch (error) {
    return fail(res, 400, error.message);
  }

  const reference = String(req.body.receiptNumber || req.body.reference || '').trim() || operationReference('LR-ENTRADA');
  const receivedAt = String(req.body.receivedAt || '').trim();
  if (!receivedAt) return fail(res, 400, 'Informe a data de recebimento.');

  const result = await sequelize.transaction(async (transaction) => {
    const duplicateReference = await ReverseLogisticsEntry.findOne({ where: { reference }, transaction, lock: transaction.LOCK.UPDATE });
    if (duplicateReference) throw new Error(`Já existe uma entrada de logística reversa com a referência ${reference}.`);

    const requestedSerials = normalizedItems.flatMap((item) => item.serialNumbers);
    if (requestedSerials.length) {
      const activeDuplicates = await ReverseLogisticsItem.findAll({
        where: {
          status: 'em_estoque',
          quantity: { [Op.gt]: 0 },
          [Op.or]: requestedSerials.map((serialNumber) => ({ serialNumber: { [Op.iLike]: serialNumber } })),
        },
        attributes: ['serialNumber'],
        transaction,
        lock: transaction.LOCK.UPDATE,
      });
      if (activeDuplicates.length) {
        throw new Error(`Serial já disponível em estoque de logística reversa: ${activeDuplicates.map((row) => row.serialNumber).join(', ')}.`);
      }
    }

    const totalQuantity = qty(normalizedItems.reduce((sum, item) => sum + Number(item.quantity || 0), 0));
    const totalValue = money(normalizedItems.reduce((sum, item) => sum + Number(item.quantity || 0) * Number(item.unitCost || 0), 0));

    const entry = await ReverseLogisticsEntry.create({
      reference,
      sourceCompany: String(req.body.sourceCompany || '').trim() || null,
      receivedAt,
      documentType: String(req.body.fiscalDocumentType || req.body.documentType || '').trim() || null,
      documentNumber: String(req.body.fiscalDocumentNumber || req.body.documentNumber || req.body.invoiceAccessKey || '').trim() || null,
      documentDate: req.body.fiscalDocumentDate || req.body.documentDate || null,
      receivedByName: String(req.body.receivedByName || req.user.name || '').trim() || null,
      proofAttachmentName: req.body.proofAttachmentName || null,
      proofAttachmentData: req.body.proofAttachmentData || null,
      notes: String(req.body.notes || '').trim() || null,
      totalQuantity,
      totalValue,
      warehouseId: warehouse.id,
      createdById: req.user.id,
    }, { transaction });

    let createdRows = 0;
    for (const item of normalizedItems) {
      if (item.requiresSerial) {
        for (const serialNumber of item.serialNumbers) {
          await ReverseLogisticsItem.create({
            code: item.code,
            description: item.description,
            serialNumber,
            quantity: 1,
            unit: 'un',
            unitCost: item.unitCost,
            condition: item.condition,
            status: 'em_estoque',
            notes: item.notes,
            receivedAt,
            warehouseId: warehouse.id,
            entryId: entry.id,
          }, { transaction });
          createdRows += 1;
        }
      } else {
        await ReverseLogisticsItem.create({
          code: item.code,
          description: item.description,
          serialNumber: null,
          quantity: item.quantity,
          unit: item.unit,
          unitCost: item.unitCost,
          condition: item.condition,
          status: 'em_estoque',
          notes: item.notes,
          receivedAt,
          warehouseId: warehouse.id,
          entryId: entry.id,
        }, { transaction });
        createdRows += 1;
      }
    }

    return { entry, createdRows, totalQuantity, totalValue };
  });

  return created(res, {
    id: result.entry.id,
    reference: result.entry.reference,
    warehouseId: warehouse.id,
    warehouseName: warehouse.name,
    totalQuantity: result.totalQuantity,
    totalValue: result.totalValue,
    inventoryRowsCreated: result.createdRows,
    isolatedReverseLogistics: true,
  }, 'Entrada registrada exclusivamente no estoque de logística reversa.');
});

exports.exit = asyncHandler(async (req, res) => {
  const warehouse = await loadReverseWarehouse(req, res);
  if (!warehouse) return;

  const items = Array.isArray(req.body.items) ? req.body.items : [];
  const supplierName = String(req.body.supplierName || '').trim();
  const documentNumber = String(req.body.documentNumber || '').trim();
  const notes = String(req.body.notes || '').trim() || null;
  const reference = String(req.body.reference || '').trim() || operationReference('LR-SAIDA');

  if (!supplierName) return fail(res, 400, 'Informe a empresa fornecedora que receberá o material.');
  if (!documentNumber) return fail(res, 400, 'Informe o número do romaneio, protocolo ou documento de entrega.');
  if (!items.length) return fail(res, 400, 'Adicione ao menos um item à saída de logística reversa.');

  const result = await sequelize.transaction(async (transaction) => {
    const duplicateReference = await ReverseLogisticsExit.findOne({ where: { reference }, transaction, lock: transaction.LOCK.UPDATE });
    if (duplicateReference) throw new Error(`Já existe uma saída de logística reversa com a referência ${reference}.`);

    const exit = await ReverseLogisticsExit.create({
      reference,
      supplierName,
      documentNumber,
      notes,
      totalQuantity: 0,
      totalValue: 0,
      warehouseId: warehouse.id,
      createdById: req.user.id,
    }, { transaction });

    let totalQuantity = 0;
    let totalValue = 0;
    const usedSerials = new Set();

    for (const [index, raw] of items.entries()) {
      const code = String(raw.code || '').trim().toUpperCase();
      const description = String(raw.description || '').trim();
      const serialNumbers = parseSerials(raw.serialNumbers);
      if (!code) throw new Error(`Item ${index + 1}: código não informado.`);
      if (!description) throw new Error(`Item ${index + 1}: descrição não informada.`);

      if (serialNumbers.length) {
        for (const serialNumber of serialNumbers) {
          const serialKey = serialNumber.toUpperCase();
          if (usedSerials.has(serialKey)) throw new Error(`Serial repetido na saída: ${serialNumber}.`);
          usedSerials.add(serialKey);

          const inventoryItem = await ReverseLogisticsItem.findOne({
            where: {
              warehouseId: warehouse.id,
              status: 'em_estoque',
              quantity: { [Op.gt]: 0 },
              serialNumber: { [Op.iLike]: serialNumber },
            },
            transaction,
            lock: transaction.LOCK.UPDATE,
          });
          if (!inventoryItem) throw new Error(`Serial ${serialNumber} não está disponível neste estoque de logística reversa.`);
          if (String(inventoryItem.code).toUpperCase() !== code) throw new Error(`O serial ${serialNumber} pertence ao código ${inventoryItem.code}, não ao código ${code}.`);

          inventoryItem.status = 'entregue_fornecedor';
          inventoryItem.exitedAt = new Date();
          await inventoryItem.save({ transaction });

          const lineValue = money(Number(inventoryItem.unitCost || 0));
          await ReverseLogisticsExitItem.create({
            code: inventoryItem.code,
            description: inventoryItem.description,
            serialNumber: inventoryItem.serialNumber,
            quantity: 1,
            unit: inventoryItem.unit || 'un',
            unitCost: inventoryItem.unitCost || 0,
            totalCost: lineValue,
            reverseItemId: inventoryItem.id,
            exitId: exit.id,
          }, { transaction });
          totalQuantity += 1;
          totalValue += lineValue;
        }
      } else {
        let remaining = qty(raw.quantity);
        if (remaining <= 0) throw new Error(`Item ${index + 1}: informe uma quantidade válida.`);

        const inventoryRows = await ReverseLogisticsItem.findAll({
          where: {
            warehouseId: warehouse.id,
            status: 'em_estoque',
            serialNumber: null,
            code,
            description,
            quantity: { [Op.gt]: 0 },
          },
          order: [['receivedAt', 'ASC'], ['id', 'ASC']],
          transaction,
          lock: transaction.LOCK.UPDATE,
        });
        const available = inventoryRows.reduce((sum, row) => sum + Number(row.quantity || 0), 0);
        if (available < remaining) throw new Error(`Saldo insuficiente para ${description}. Disponível: ${qty(available)}.`);

        for (const inventoryItem of inventoryRows) {
          if (remaining <= 0) break;
          const availableRow = Number(inventoryItem.quantity || 0);
          const consumed = Math.min(availableRow, remaining);
          const lineValue = money(consumed * Number(inventoryItem.unitCost || 0));

          inventoryItem.quantity = qty(availableRow - consumed);
          if (Number(inventoryItem.quantity || 0) <= 0) {
            inventoryItem.status = 'entregue_fornecedor';
            inventoryItem.exitedAt = new Date();
          }
          await inventoryItem.save({ transaction });

          await ReverseLogisticsExitItem.create({
            code: inventoryItem.code,
            description: inventoryItem.description,
            serialNumber: null,
            quantity: consumed,
            unit: inventoryItem.unit || 'un',
            unitCost: inventoryItem.unitCost || 0,
            totalCost: lineValue,
            reverseItemId: inventoryItem.id,
            exitId: exit.id,
          }, { transaction });

          remaining = qty(remaining - consumed);
          totalQuantity += consumed;
          totalValue += lineValue;
        }
      }
    }

    exit.totalQuantity = qty(totalQuantity);
    exit.totalValue = money(totalValue);
    await exit.save({ transaction });

    return { exit, totalQuantity: exit.totalQuantity, totalValue: exit.totalValue };
  });

  return created(res, {
    id: result.exit.id,
    reference: result.exit.reference,
    supplierName,
    documentNumber,
    totalQuantity: result.totalQuantity,
    totalValue: result.totalValue,
    warehouseId: warehouse.id,
    warehouseName: warehouse.name,
    isolatedReverseLogistics: true,
  }, 'Saída registrada exclusivamente no estoque de logística reversa.');
});
