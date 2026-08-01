const sequelize = require('../../config/db');
const { Op } = require('sequelize');
const {
  Technician,
  TechnicianTool,
  TechnicianToolDocument,
  User,
  Material,
  Warehouse,
  StockBalance,
  StockMovement,
  Transfer,
  TransferItem,
} = require('../models');
const asyncHandler = require('../utils/asyncHandler');
const { ok, created, fail } = require('../utils/response');
const { writeAudit } = require('../services/auditService');
const { money, qty, daysBetween } = require('../utils/number');
const { adjustBalance } = require('../services/stockService');
const { assertWarehouseAccess } = require('../utils/warehouseAccess');

const toolInclude = [
  Material,
  { model: Warehouse, as: 'sourceWarehouse' },
  { model: User, as: 'createdBy', attributes: ['id', 'name', 'email'] },
  { model: User, as: 'removedBy', attributes: ['id', 'name', 'email'] },
];

const REMOVAL_STATUSES = ['substituida', 'perdida', 'desgaste', 'devolvida'];
const ALLOWED_DOCUMENT_MIMES = ['application/pdf', 'image/jpeg', 'image/png', 'image/webp'];
const MAX_DOCUMENT_BYTES = 12 * 1024 * 1024;



function documentMime(dataUrl) {
  const match = String(dataUrl || '').match(/^data:([^;,]+)[;,]/i);
  return String(match?.[1] || '').toLowerCase();
}

function estimatedDataUrlBytes(dataUrl) {
  const value = String(dataUrl || '');
  const payload = value.includes(',') ? value.slice(value.indexOf(',') + 1) : value;
  return Math.ceil(payload.length * 0.75);
}

function publicDocument(document, includeData = false) {
  if (!document) return null;
  const payload = document.toJSON();
  if (!includeData) delete payload.documentData;
  return payload;
}

async function activeSerialExists(serialNumber, excludeId = null) {
  const where = { serialNumber, status: 'com_tecnico' };
  if (excludeId) where.id = { [Op.ne]: excludeId };
  return TechnicianTool.findOne({ where });
}

async function loadTechnicianOrFail(res, technicianId) {
  const technician = await Technician.findByPk(technicianId);
  if (!technician) {
    fail(res, 404, 'Técnico não encontrado.');
    return null;
  }
  return technician;
}

function nextStockToolTransferNumber() {
  const now = new Date();
  const stamp = `${now.getFullYear()}${String(now.getMonth() + 1).padStart(2, '0')}${String(now.getDate()).padStart(2, '0')}-${String(now.getHours()).padStart(2, '0')}${String(now.getMinutes()).padStart(2, '0')}${String(now.getSeconds()).padStart(2, '0')}`;
  const suffix = Math.random().toString(36).slice(2, 6).toUpperCase();
  return `FERRAMENTA-${stamp}-${suffix}`;
}

function internalToolSerial(material, index) {
  const sku = String(material?.sku || material?.id || 'ITEM').replace(/[^A-Z0-9_-]/gi, '').toUpperCase().slice(0, 32) || 'ITEM';
  const stamp = Date.now().toString(36).toUpperCase();
  const suffix = Math.random().toString(36).slice(2, 7).toUpperCase();
  return `ESTQ-${sku}-${stamp}-${String(index + 1).padStart(3, '0')}-${suffix}`.slice(0, 140);
}

exports.list = asyncHandler(async (req, res) => {
  const technician = await loadTechnicianOrFail(res, req.params.technicianId);
  if (!technician) return;
  if (req.user?.role === 'tecnico' && Number(req.user.technicianId) !== Number(technician.id)) {
    return fail(res, 403, 'Você só pode acessar as ferramentas do próprio cadastro.');
  }

  const tools = await TechnicianTool.findAll({
    where: { technicianId: technician.id },
    include: toolInclude,
    order: [['status', 'ASC'], ['deliveredAt', 'ASC']],
  });

  const active = tools.filter((tool) => tool.status === 'com_tecnico');
  const documentCount = await TechnicianToolDocument.count({ where: { technicianId: technician.id } }).catch(() => 0);
  return ok(res, {
    technician,
    tools: tools.map((tool) => ({ ...tool.toJSON(), custodyDays: daysBetween(tool.deliveredAt) })),
    summary: {
      activeCount: active.length,
      activeValue: money(active.reduce((sum, tool) => sum + Number(tool.referenceValue || 0), 0)),
      removedCount: tools.length - active.length,
      documentCount,
    },
  });
});

exports.availableStock = asyncHandler(async (req, res) => {
  const technician = await loadTechnicianOrFail(res, req.params.technicianId);
  if (!technician) return;

  const warehouseId = Number(req.query.warehouseId || technician.defaultWarehouseId || 0);
  if (!warehouseId) {
    return fail(res, 400, 'Vincule um estoque padrão ao técnico para selecionar ferramentas disponíveis.');
  }
  try {
    assertWarehouseAccess(req.user, warehouseId, 'Você não tem acesso ao estoque vinculado ao técnico.');
  } catch (error) {
    return fail(res, error.statusCode || 403, error.message);
  }

  const warehouse = await Warehouse.findByPk(warehouseId);
  if (!warehouse || warehouse.status !== 'ativo' || warehouse.isReverseLogistics) {
    return fail(res, 400, 'O estoque vinculado ao técnico não está disponível para entrega de ferramentas.');
  }

  const balances = await StockBalance.findAll({
    where: {
      ownerType: 'estoque',
      technicianId: null,
      warehouseId,
      quantity: { [Op.gt]: 0 },
    },
    include: [{
      model: Material,
      where: { category: 'ferramenta', active: true, requiresSerial: false },
      required: true,
    }],
    order: [[Material, 'name', 'ASC']],
  });

  const materialIds = balances.map((row) => Number(row.materialId));
  const enteredMaterialIds = new Set();
  if (materialIds.length) {
    const entryRows = await StockMovement.findAll({
      where: {
        type: 'entrada',
        materialId: { [Op.in]: materialIds },
        toWarehouseId: warehouseId,
      },
      attributes: ['materialId'],
      group: ['materialId'],
      raw: true,
    });
    entryRows.forEach((row) => enteredMaterialIds.add(Number(row.materialId)));
  }

  const tools = balances
    .filter((row) => enteredMaterialIds.has(Number(row.materialId)))
    .map((row) => ({
      materialId: row.materialId,
      name: row.Material?.name || 'Ferramenta',
      sku: row.Material?.sku || '',
      brand: row.Material?.brand || row.Material?.manufacturer || '',
      unit: row.Material?.unit || 'un',
      unitCost: money(row.Material?.unitCost || 0),
      availableQuantity: qty(row.quantity || 0),
      warehouseId,
      warehouseName: warehouse.name,
    }));

  return ok(res, { technician, warehouse, tools });
});

exports.create = asyncHandler(async (req, res) => {
  const technician = await loadTechnicianOrFail(res, req.params.technicianId);
  if (!technician) return;

  const requestedItems = Array.isArray(req.body.items) ? req.body.items : [];
  if (requestedItems.length) {
    const warehouseId = Number(req.body.warehouseId || technician.defaultWarehouseId || 0);
    if (!warehouseId) return fail(res, 400, 'Vincule um estoque padrão ao técnico antes de adicionar ferramentas.');

    const groupedItems = new Map();
    for (const rawItem of requestedItems) {
      const materialId = Number(rawItem?.materialId || 0);
      const quantity = Number(rawItem?.quantity || 0);
      if (!Number.isInteger(materialId) || materialId <= 0) {
        return fail(res, 400, 'A lista contém uma ferramenta inválida.');
      }
      if (!Number.isInteger(quantity) || quantity <= 0) {
        return fail(res, 400, 'Todas as quantidades devem ser números inteiros maiores que zero.');
      }
      groupedItems.set(materialId, (groupedItems.get(materialId) || 0) + quantity);
    }

    const normalizedItems = [...groupedItems.entries()].map(([materialId, quantity]) => ({ materialId, quantity }));
    if (!normalizedItems.length) return fail(res, 400, 'Informe ao menos uma ferramenta para a transferência.');

    try {
      assertWarehouseAccess(req.user, warehouseId, 'Você não tem acesso ao estoque de origem das ferramentas.');
    } catch (error) {
      return fail(res, error.statusCode || 403, error.message);
    }

    const result = await sequelize.transaction(async (transaction) => {
      const warehouse = await Warehouse.findByPk(warehouseId, { transaction });
      if (!warehouse || warehouse.status !== 'ativo' || warehouse.isReverseLogistics) {
        throw Object.assign(new Error('O estoque de origem não está disponível para entrega de ferramentas.'), { statusCode: 400 });
      }

      const materialIds = normalizedItems.map((item) => item.materialId);
      const materials = await Material.findAll({
        where: { id: { [Op.in]: materialIds } },
        transaction,
      });
      const materialMap = new Map(materials.map((material) => [Number(material.id), material]));

      const preparedItems = [];
      let totalQuantity = 0;
      let totalValue = 0;

      for (const item of normalizedItems) {
        const material = materialMap.get(item.materialId);
        if (!material || material.category !== 'ferramenta' || !material.active) {
          throw Object.assign(new Error(`Ferramenta de ID ${item.materialId} não encontrada no catálogo ativo.`), { statusCode: 404 });
        }
        if (material.requiresSerial) {
          throw Object.assign(new Error(`${material.name} exige serial e não pode usar o fluxo de ferramenta controlada por quantidade.`), { statusCode: 400 });
        }

        const balance = await StockBalance.findOne({
          where: {
            materialId: item.materialId,
            ownerType: 'estoque',
            technicianId: null,
            warehouseId,
          },
          transaction,
          lock: transaction.LOCK.UPDATE,
        });
        const available = qty(balance?.quantity || 0);
        if (available < item.quantity) {
          throw Object.assign(new Error(`Saldo insuficiente para ${material.name}. Disponível: ${available} ${material.unit || 'un'}.`), { statusCode: 409 });
        }

        const entryExists = await StockMovement.findOne({
          where: { type: 'entrada', materialId: item.materialId, toWarehouseId: warehouseId },
          transaction,
        });
        if (!entryExists) {
          throw Object.assign(new Error(`${material.name} ainda não possui entrada registrada no estoque selecionado.`), { statusCode: 400 });
        }

        const unitCost = money(material.unitCost || 0);
        const itemTotal = money(item.quantity * unitCost);
        totalQuantity += item.quantity;
        totalValue += Number(itemTotal);
        preparedItems.push({ ...item, material, unitCost, itemTotal });
      }

      const transferNumber = nextStockToolTransferNumber();
      const deliveredAt = req.body.deliveredAt || new Date();
      const notes = String(req.body.notes || '').trim() || `Entrega de ${totalQuantity} ferramenta(s) para a ficha de ${technician.name}.`;
      const transfer = await Transfer.create({
        transferNumber,
        transferType: 'ferramenta',
        technicianId: technician.id,
        warehouseId,
        deliveredAt,
        totalQuantity,
        totalValue: money(totalValue),
        notes,
        stampText: 'Declaro que as ferramentas relacionadas foram conferidas e entregues ao técnico indicado, permanecendo sob sua responsabilidade até devolução ou baixa formal.',
        createdById: req.user?.id || null,
      }, { transaction });

      const createdTools = [];
      const auditItems = [];

      for (const item of preparedItems) {
        await adjustBalance({
          materialId: item.materialId,
          ownerType: 'estoque',
          technicianId: null,
          warehouseId,
          delta: -item.quantity,
          transaction,
        });

        await TransferItem.create({
          transferId: transfer.id,
          materialId: item.materialId,
          itemType: 'ferramenta',
          itemDescription: item.material.name,
          quantity: item.quantity,
          unitCost: item.unitCost,
          totalCost: item.itemTotal,
        }, { transaction });

        const rows = Array.from({ length: item.quantity }, (_, index) => ({
          technicianId: technician.id,
          materialId: item.materialId,
          sourceWarehouseId: warehouseId,
          name: item.material.name,
          serialNumber: internalToolSerial(item.material, index),
          brand: item.material.brand || item.material.manufacturer || null,
          referenceValue: item.unitCost,
          deliveredAt,
          notes: [
            notes,
            `Entregue pelo estoque ${warehouse.name} na guia ${transferNumber}. Controle por quantidade.`,
          ].filter(Boolean).join(' | '),
          status: 'com_tecnico',
          createdById: req.user?.id || null,
        }));
        const tools = await TechnicianTool.bulkCreate(rows, { transaction, returning: true });
        createdTools.push(...tools);

        await StockMovement.create({
          type: 'transferencia_tecnico',
          materialId: item.materialId,
          quantity: item.quantity,
          fromOwnerType: 'estoque',
          toOwnerType: 'ficha_tecnico',
          fromWarehouseId: warehouseId,
          toTechnicianId: technician.id,
          reference: transferNumber,
          notes: 'Ferramenta destinada exclusivamente à ficha do técnico; não compõe a caixa de materiais consumíveis.',
          createdById: req.user?.id || null,
        }, { transaction });

        auditItems.push({
          materialId: item.materialId,
          materialName: item.material.name,
          quantity: item.quantity,
          unitCost: item.unitCost,
          totalValue: item.itemTotal,
          toolIds: tools.map((tool) => tool.id),
        });
      }

      await writeAudit({
        req,
        action: 'assign_stock_tools_batch',
        entity: 'Transfer',
        entityId: transfer.id,
        message: `${totalQuantity} ferramenta(s), em ${preparedItems.length} item(ns), transferida(s) do estoque ${warehouse.name} para a ficha de ${technician.name} na guia ${transferNumber}.`,
        afterData: {
          transferId: transfer.id,
          transferNumber,
          technicianId: technician.id,
          warehouseId,
          totalQuantity,
          totalValue: money(totalValue),
          items: auditItems,
        },
        transaction,
      });

      return { transfer, tools: createdTools };
    });

    return created(res, result, 'Ferramentas transferidas em uma única guia para a ficha do técnico.');
  }

  const materialId = Number(req.body.materialId || 0);
  if (materialId) {
    const quantity = Number(req.body.quantity || 0);
    const warehouseId = Number(req.body.warehouseId || technician.defaultWarehouseId || 0);
    if (!Number.isInteger(quantity) || quantity <= 0) return fail(res, 400, 'Informe uma quantidade inteira maior que zero.');
    if (!warehouseId) return fail(res, 400, 'Vincule um estoque padrão ao técnico antes de adicionar ferramentas.');
    try {
      assertWarehouseAccess(req.user, warehouseId, 'Você não tem acesso ao estoque de origem da ferramenta.');
    } catch (error) {
      return fail(res, error.statusCode || 403, error.message);
    }

    const [material, warehouse] = await Promise.all([
      Material.findByPk(materialId),
      Warehouse.findByPk(warehouseId),
    ]);
    if (!material || material.category !== 'ferramenta' || !material.active) return fail(res, 404, 'Ferramenta não encontrada no catálogo ativo.');
    if (material.requiresSerial) return fail(res, 400, 'Esta ferramenta exige serial. Para este fluxo, cadastre-a como controlada por quantidade.');
    if (!warehouse || warehouse.status !== 'ativo' || warehouse.isReverseLogistics) return fail(res, 400, 'O estoque de origem não está disponível para entrega de ferramentas.');

    const result = await sequelize.transaction(async (transaction) => {
      const balance = await StockBalance.findOne({
        where: { materialId, ownerType: 'estoque', technicianId: null, warehouseId },
        transaction,
        lock: transaction.LOCK.UPDATE,
      });
      const available = qty(balance?.quantity || 0);
      if (available < quantity) throw Object.assign(new Error(`Saldo insuficiente para ${material.name}. Disponível: ${available} ${material.unit || 'un'}.`), { statusCode: 409 });

      const entryExists = await StockMovement.findOne({
        where: { type: 'entrada', materialId, toWarehouseId: warehouseId },
        transaction,
      });
      if (!entryExists) throw Object.assign(new Error('Esta ferramenta ainda não possui entrada registrada no estoque selecionado.'), { statusCode: 400 });

      await adjustBalance({ materialId, ownerType: 'estoque', technicianId: null, warehouseId, delta: -quantity, transaction });

      const transferNumber = nextStockToolTransferNumber();
      const unitCost = money(material.unitCost || 0);
      const totalValue = money(quantity * unitCost);
      const transfer = await Transfer.create({
        transferNumber,
        transferType: 'ferramenta',
        technicianId: technician.id,
        warehouseId,
        deliveredAt: req.body.deliveredAt || new Date(),
        totalQuantity: quantity,
        totalValue,
        notes: String(req.body.notes || '').trim() || `Entrega de ${quantity} ${material.unit || 'un'} de ${material.name} para a ficha de ${technician.name}.`,
        stampText: 'Declaro que as ferramentas relacionadas foram conferidas e entregues ao técnico indicado, permanecendo sob sua responsabilidade até devolução ou baixa formal.',
        createdById: req.user?.id || null,
      }, { transaction });

      await TransferItem.create({
        transferId: transfer.id,
        materialId,
        itemType: 'ferramenta',
        itemDescription: material.name,
        quantity,
        unitCost,
        totalCost: totalValue,
      }, { transaction });

      const rows = Array.from({ length: quantity }, (_, index) => ({
        technicianId: technician.id,
        materialId,
        sourceWarehouseId: warehouseId,
        name: material.name,
        serialNumber: internalToolSerial(material, index),
        brand: material.brand || material.manufacturer || null,
        referenceValue: unitCost,
        deliveredAt: req.body.deliveredAt || new Date(),
        notes: [
          String(req.body.notes || '').trim() || null,
          `Entregue pelo estoque ${warehouse.name} na guia ${transferNumber}. Controle por quantidade.`,
        ].filter(Boolean).join(' | '),
        status: 'com_tecnico',
        createdById: req.user?.id || null,
      }));
      const tools = await TechnicianTool.bulkCreate(rows, { transaction, returning: true });

      await StockMovement.create({
        type: 'transferencia_tecnico',
        materialId,
        quantity,
        fromOwnerType: 'estoque',
        toOwnerType: 'ficha_tecnico',
        fromWarehouseId: warehouseId,
        toTechnicianId: technician.id,
        reference: transferNumber,
        notes: `Ferramenta destinada exclusivamente à ficha do técnico; não compõe a caixa de materiais consumíveis.`,
        createdById: req.user?.id || null,
      }, { transaction });

      await writeAudit({
        req,
        action: 'assign_stock_tool',
        entity: 'TechnicianTool',
        entityId: tools[0]?.id || transfer.id,
        message: `${quantity} ${material.unit || 'un'} de ${material.name} transferida(s) do estoque ${warehouse.name} para a ficha de ${technician.name}.`,
        afterData: {
          transferId: transfer.id,
          transferNumber,
          technicianId: technician.id,
          materialId,
          warehouseId,
          quantity,
          totalValue,
          toolIds: tools.map((tool) => tool.id),
        },
        transaction,
      });

      return { transfer, tools };
    });

    return created(res, result, 'Ferramenta transferida do estoque para a ficha do técnico.');
  }

  // Compatibilidade com ferramentas antigas cadastradas manualmente.
  const name = String(req.body.name || '').trim();
  const serialNumber = String(req.body.serialNumber || '').trim();
  if (!name) return fail(res, 400, 'Informe o nome/descrição da ferramenta.');
  if (!serialNumber) return fail(res, 400, 'Informe o número de patrimônio/série da ferramenta.');
  if (await activeSerialExists(serialNumber)) return fail(res, 409, 'Já existe uma ferramenta ativa com este número de patrimônio/série.');

  const tool = await TechnicianTool.create({
    technicianId: technician.id,
    name,
    serialNumber,
    brand: req.body.brand ? String(req.body.brand).trim() : null,
    referenceValue: money(req.body.referenceValue || 0),
    deliveredAt: req.body.deliveredAt || new Date(),
    notes: req.body.notes ? String(req.body.notes).trim() : null,
    status: 'com_tecnico',
    createdById: req.user?.id || null,
  });

  const withIncludes = await TechnicianTool.findByPk(tool.id, { include: toolInclude });
  await writeAudit({
    req,
    action: 'create',
    entity: 'TechnicianTool',
    entityId: tool.id,
    message: `Ferramenta "${name}" (série ${serialNumber}) registrada em nome de ${technician.name}.`,
    afterData: withIncludes.toJSON(),
  });
  return created(res, withIncludes, 'Ferramenta registrada na ficha do técnico.');
});


exports.consolidateTransfers = asyncHandler(async (req, res) => {
  const technician = await loadTechnicianOrFail(res, req.params.technicianId);
  if (!technician) return;

  const marker = String(req.body.marker || '').trim();
  const warehouseId = Number(req.body.warehouseId || 0);
  const expectedTransferCount = Number(req.body.expectedTransferCount || 0);
  const expectedTotalQuantity = Number(req.body.expectedTotalQuantity || 0);
  const deliveredAt = req.body.deliveredAt || null;

  if (marker.length < 12) return fail(res, 400, 'Informe o identificador exato da importação que será consolidada.');
  if (!Number.isInteger(warehouseId) || warehouseId <= 0) return fail(res, 400, 'Informe o estoque de origem das ferramentas.');
  if (expectedTransferCount && (!Number.isInteger(expectedTransferCount) || expectedTransferCount <= 1)) {
    return fail(res, 400, 'A quantidade esperada de transferências precisa ser um inteiro maior que um.');
  }
  if (expectedTotalQuantity && (!Number.isInteger(expectedTotalQuantity) || expectedTotalQuantity <= 0)) {
    return fail(res, 400, 'A quantidade total esperada precisa ser um inteiro maior que zero.');
  }

  try {
    assertWarehouseAccess(req.user, warehouseId, 'Você não tem acesso ao estoque de origem das ferramentas.');
  } catch (error) {
    return fail(res, error.statusCode || 403, error.message);
  }

  const warehouse = await Warehouse.findByPk(warehouseId);
  if (!warehouse) return fail(res, 404, 'Estoque de origem não encontrado.');

  const consolidationFlag = 'CONSOLIDADA-UMA-GUIA';
  const result = await sequelize.transaction(async (transaction) => {
    const transfers = await Transfer.findAll({
      where: {
        technicianId: technician.id,
        warehouseId,
        transferType: 'ferramenta',
        notes: { [Op.iLike]: `%${marker}%` },
      },
      order: [['id', 'ASC']],
      transaction,
      lock: transaction.LOCK.UPDATE,
    });

    if (!transfers.length) {
      throw Object.assign(new Error('Nenhuma transferência de ferramenta foi encontrada com o identificador informado.'), { statusCode: 404 });
    }

    const consolidatedTransfers = transfers.filter((transfer) => String(transfer.notes || '').includes(consolidationFlag));
    if (transfers.length === 1 && consolidatedTransfers.length === 1) {
      return { transferId: transfers[0].id, alreadyConsolidated: true };
    }
    if (consolidatedTransfers.length) {
      throw Object.assign(new Error('Foi encontrada uma guia já consolidada junto com guias antigas. A operação foi interrompida para evitar duplicidade.'), { statusCode: 409 });
    }

    if (expectedTransferCount && transfers.length !== expectedTransferCount) {
      throw Object.assign(new Error(`Foram encontradas ${transfers.length} transferências, mas eram esperadas exatamente ${expectedTransferCount}. Nenhum registro foi alterado.`), { statusCode: 409 });
    }

    const unsafeTransfers = transfers.filter((transfer) => (
      transfer.status === 'assinado'
      || transfer.signedAt
      || transfer.attachmentData
      || transfer.attachmentName
    ));
    if (unsafeTransfers.length) {
      const numbers = unsafeTransfers.map((transfer) => transfer.transferNumber).join(', ');
      throw Object.assign(new Error(`Existem guias assinadas ou com anexos (${numbers}). A consolidação automática foi bloqueada para preservar os documentos.`), { statusCode: 409 });
    }

    const oldTransferIds = transfers.map((transfer) => Number(transfer.id));
    const oldTransferNumbers = transfers.map((transfer) => String(transfer.transferNumber));
    const transferItems = await TransferItem.findAll({
      where: { transferId: { [Op.in]: oldTransferIds } },
      include: [Material],
      order: [['id', 'ASC']],
      transaction,
      lock: transaction.LOCK.UPDATE,
    });

    if (!transferItems.length) {
      throw Object.assign(new Error('As transferências antigas não possuem itens. Nenhum registro foi alterado.'), { statusCode: 409 });
    }

    const totalQuantity = transferItems.reduce((sum, item) => sum + Number(item.quantity || 0), 0);
    const totalValue = transferItems.reduce((sum, item) => sum + Number(item.totalCost || 0), 0);
    if (expectedTotalQuantity && Number(totalQuantity) !== expectedTotalQuantity) {
      throw Object.assign(new Error(`As guias somam ${totalQuantity} unidades, mas eram esperadas exatamente ${expectedTotalQuantity}. Nenhum registro foi alterado.`), { statusCode: 409 });
    }

    const tools = await TechnicianTool.findAll({
      where: {
        technicianId: technician.id,
        sourceWarehouseId: warehouseId,
        status: 'com_tecnico',
        notes: { [Op.iLike]: `%${marker}%` },
      },
      order: [['id', 'ASC']],
      transaction,
      lock: transaction.LOCK.UPDATE,
    });
    if (tools.length !== Number(totalQuantity)) {
      throw Object.assign(new Error(`A ficha possui ${tools.length} ferramentas ligadas à importação, mas as guias somam ${totalQuantity}. Nenhum registro foi alterado.`), { statusCode: 409 });
    }

    const movements = await StockMovement.findAll({
      where: {
        type: 'transferencia_tecnico',
        fromWarehouseId: warehouseId,
        toTechnicianId: technician.id,
        reference: { [Op.in]: oldTransferNumbers },
      },
      order: [['id', 'ASC']],
      transaction,
      lock: transaction.LOCK.UPDATE,
    });
    const movementQuantity = movements.reduce((sum, movement) => sum + Number(movement.quantity || 0), 0);
    if (Number(movementQuantity) !== Number(totalQuantity)) {
      throw Object.assign(new Error(`As movimentações de estoque somam ${movementQuantity} unidades, mas as guias somam ${totalQuantity}. Nenhum registro foi alterado.`), { statusCode: 409 });
    }

    const transferNumber = nextStockToolTransferNumber();
    const consolidatedNotes = [
      marker,
      consolidationFlag,
      `Consolidação administrativa de ${transfers.length} guias anteriores em uma única transferência.`,
      `Técnico: ${technician.name}.`,
      `Estoque: ${warehouse.name}.`,
    ].join(' | ');

    const consolidated = await Transfer.create({
      transferNumber,
      transferType: 'ferramenta',
      technicianId: technician.id,
      warehouseId,
      deliveredAt: deliveredAt || transfers[0].deliveredAt || new Date(),
      totalQuantity: qty(totalQuantity),
      totalValue: money(totalValue),
      notes: consolidatedNotes,
      stampText: 'Declaro que todas as ferramentas relacionadas nesta guia única foram conferidas e entregues ao técnico indicado, permanecendo sob sua responsabilidade até devolução ou baixa formal.',
      createdById: req.user?.id || null,
    }, { transaction });

    await TransferItem.update(
      { transferId: consolidated.id },
      { where: { transferId: { [Op.in]: oldTransferIds } }, transaction },
    );

    for (const movement of movements) {
      const previousReference = String(movement.reference || '');
      movement.reference = transferNumber;
      movement.notes = [
        String(movement.notes || '').trim() || null,
        `Movimentação vinculada à guia consolidada ${transferNumber}; referência anterior: ${previousReference}.`,
      ].filter(Boolean).join(' | ');
      await movement.save({ transaction });
    }

    for (const tool of tools) {
      let notes = String(tool.notes || '');
      for (const oldNumber of oldTransferNumbers) {
        notes = notes.split(oldNumber).join(transferNumber);
      }
      if (!notes.includes(consolidationFlag)) {
        notes = [notes, `${consolidationFlag}: ${transferNumber}`].filter(Boolean).join(' | ');
      }
      tool.notes = notes;
      if (deliveredAt) tool.deliveredAt = deliveredAt;
      await tool.save({ transaction });
    }

    await Transfer.destroy({
      where: { id: { [Op.in]: oldTransferIds } },
      transaction,
    });

    await writeAudit({
      req,
      action: 'consolidate_stock_tool_transfers',
      entity: 'Transfer',
      entityId: consolidated.id,
      message: `${transfers.length} guias de ferramentas de ${technician.name} foram consolidadas na guia única ${transferNumber}, sem nova movimentação de saldo.`,
      beforeData: {
        technicianId: technician.id,
        warehouseId,
        marker,
        transferIds: oldTransferIds,
        transferNumbers: oldTransferNumbers,
        transferCount: transfers.length,
        totalQuantity,
        totalValue: money(totalValue),
      },
      afterData: {
        transferId: consolidated.id,
        transferNumber,
        transferCount: 1,
        itemCount: transferItems.length,
        totalQuantity,
        totalValue: money(totalValue),
        movementIds: movements.map((movement) => movement.id),
        toolIds: tools.map((tool) => tool.id),
      },
      transaction,
    });

    return { transferId: consolidated.id, alreadyConsolidated: false };
  });

  const consolidatedTransfer = await Transfer.findByPk(result.transferId, {
    include: [
      Technician,
      Warehouse,
      { model: TransferItem, include: [Material, TechnicianTool] },
    ],
  });

  if (result.alreadyConsolidated) {
    return ok(res, consolidatedTransfer, 'As ferramentas já estão consolidadas em uma única guia.');
  }
  return created(res, consolidatedTransfer, 'As 33 transferências foram substituídas por uma única guia, sem movimentar o saldo novamente.');
});

exports.update = asyncHandler(async (req, res) => {
  const tool = await TechnicianTool.findOne({ where: { id: req.params.id, technicianId: req.params.technicianId }, include: toolInclude });
  if (!tool) return fail(res, 404, 'Ferramenta não encontrada nesta ficha.');
  if (tool.status !== 'com_tecnico') return fail(res, 400, 'Só é possível editar ferramentas que ainda estão com o técnico.');

  const before = tool.toJSON();
  const name = req.body.name !== undefined ? String(req.body.name).trim() : tool.name;
  const serialNumber = req.body.serialNumber !== undefined ? String(req.body.serialNumber).trim() : tool.serialNumber;
  if (!name) return fail(res, 400, 'Informe o nome/descrição da ferramenta.');
  if (!serialNumber) return fail(res, 400, 'Informe o número de patrimônio/série da ferramenta.');
  if (await activeSerialExists(serialNumber, tool.id)) return fail(res, 409, 'Já existe outra ferramenta ativa com este número de patrimônio/série.');

  await tool.update({
    name,
    serialNumber,
    brand: req.body.brand !== undefined ? (String(req.body.brand).trim() || null) : tool.brand,
    referenceValue: req.body.referenceValue !== undefined ? money(req.body.referenceValue) : tool.referenceValue,
    notes: req.body.notes !== undefined ? (String(req.body.notes).trim() || null) : tool.notes,
  });

  const updated = await TechnicianTool.findByPk(tool.id, { include: toolInclude });
  await writeAudit({
    req,
    action: 'update',
    entity: 'TechnicianTool',
    entityId: tool.id,
    message: `Ferramenta "${updated.name}" atualizada.`,
    beforeData: before,
    afterData: updated.toJSON(),
  });
  return ok(res, updated, 'Ferramenta atualizada.');
});

exports.remove = asyncHandler(async (req, res) => {
  const tool = await TechnicianTool.findOne({ where: { id: req.params.id, technicianId: req.params.technicianId }, include: toolInclude });
  if (!tool) return fail(res, 404, 'Ferramenta não encontrada nesta ficha.');
  if (tool.status !== 'com_tecnico') return fail(res, 400, 'Esta ferramenta já foi baixada da ficha.');

  const status = req.body.status;
  if (!REMOVAL_STATUSES.includes(status)) {
    return fail(res, 400, 'Informe o motivo da baixa: substituída, perdida, desgaste ou devolvida.');
  }
  const removalReason = String(req.body.removalReason || '').trim();
  if (!removalReason) return fail(res, 400, 'Descreva o motivo da baixa.');
  if (tool.materialId && status === 'substituida') {
    return fail(res, 400, 'Para substituir uma ferramenta controlada por estoque, devolva ou baixe a unidade atual e adicione a nova ferramenta disponível no estoque.');
  }

  const result = await sequelize.transaction(async (transaction) => {
    const lockedTool = await TechnicianTool.findOne({
      where: { id: tool.id, technicianId: req.params.technicianId, status: 'com_tecnico' },
      transaction,
      lock: transaction.LOCK.UPDATE,
    });
    if (!lockedTool) throw Object.assign(new Error('Esta ferramenta já foi baixada por outro usuário. Atualize a ficha.'), { statusCode: 409 });

    const before = lockedTool.toJSON();
    await lockedTool.update({
      status,
      removalReason,
      removedAt: new Date(),
      removedById: req.user?.id || null,
    }, { transaction });

    let replacementTool = null;
    if (status === 'substituida' && req.body.replacement) {
      const replacement = req.body.replacement;
      const replacementName = String(replacement.name || lockedTool.name).trim();
      const replacementSerial = String(replacement.serialNumber || '').trim();
      if (replacementSerial) {
        replacementTool = await TechnicianTool.create({
          technicianId: lockedTool.technicianId,
          name: replacementName,
          serialNumber: replacementSerial,
          brand: replacement.brand ? String(replacement.brand).trim() : null,
          referenceValue: money(replacement.referenceValue || lockedTool.referenceValue || 0),
          deliveredAt: new Date(),
          notes: `Substitui a ferramenta de série ${lockedTool.serialNumber}.`,
          status: 'com_tecnico',
          createdById: req.user?.id || null,
        }, { transaction });
      }
    }

    if (status === 'devolvida' && lockedTool.materialId && lockedTool.sourceWarehouseId) {
      await adjustBalance({
        materialId: lockedTool.materialId,
        ownerType: 'estoque',
        technicianId: null,
        warehouseId: lockedTool.sourceWarehouseId,
        delta: 1,
        transaction,
      });
      await StockMovement.create({
        type: 'retorno_tecnico',
        materialId: lockedTool.materialId,
        quantity: 1,
        fromOwnerType: 'ficha_tecnico',
        toOwnerType: 'estoque',
        fromTechnicianId: lockedTool.technicianId,
        toWarehouseId: lockedTool.sourceWarehouseId,
        reference: `DEV-FERR-${lockedTool.id}-${Date.now()}`,
        notes: `Devolução da ferramenta ${lockedTool.name} para o estoque de origem. ${removalReason}`,
        createdById: req.user?.id || null,
      }, { transaction });
    }

    const updated = await TechnicianTool.findByPk(lockedTool.id, { include: toolInclude, transaction });
    await writeAudit({
      req,
      action: 'remove',
      entity: 'TechnicianTool',
      entityId: lockedTool.id,
      message: `Ferramenta "${lockedTool.name}" baixada como "${status}". Motivo: ${removalReason}${status === 'devolvida' && lockedTool.materialId ? ' Saldo devolvido ao estoque de origem.' : ''}${replacementTool ? ` Substituída pela ferramenta de série ${replacementTool.serialNumber}.` : ''}`,
      beforeData: before,
      afterData: updated.toJSON(),
      transaction,
    });
    return { tool: updated, replacementTool };
  });

  return ok(res, result, 'Baixa registrada na ficha do técnico.');
});

exports.termData = asyncHandler(async (req, res) => {
  const technician = await loadTechnicianOrFail(res, req.params.technicianId);
  if (!technician) return;

  const tools = await TechnicianTool.findAll({
    where: { technicianId: technician.id },
    include: toolInclude,
    order: [['status', 'ASC'], ['deliveredAt', 'ASC']],
  });
  const active = tools.filter((tool) => tool.status === 'com_tecnico');

  return ok(res, {
    technician,
    generatedAt: new Date(),
    activeTools: active,
    totalValue: money(active.reduce((sum, tool) => sum + Number(tool.referenceValue || 0), 0)),
  });
});

exports.listDocuments = asyncHandler(async (req, res) => {
  const technician = await loadTechnicianOrFail(res, req.params.technicianId);
  if (!technician) return;
  if (req.user?.role === 'tecnico' && Number(req.user.technicianId) !== Number(technician.id)) {
    return fail(res, 403, 'Você só pode acessar os documentos do próprio cadastro.');
  }

  const documents = await TechnicianToolDocument.findAll({
    where: { technicianId: technician.id },
    attributes: { exclude: ['documentData'] },
    include: [{ model: User, as: 'createdBy', attributes: ['id', 'name', 'email'] }],
    order: [['signedAt', 'DESC'], ['createdAt', 'DESC']],
  });

  return ok(res, {
    technician,
    documents: documents.map(publicDocument),
    count: documents.length,
  });
});

exports.getDocument = asyncHandler(async (req, res) => {
  const technician = await loadTechnicianOrFail(res, req.params.technicianId);
  if (!technician) return;
  if (req.user?.role === 'tecnico' && Number(req.user.technicianId) !== Number(technician.id)) {
    return fail(res, 403, 'Você só pode acessar os documentos do próprio cadastro.');
  }

  const document = await TechnicianToolDocument.findOne({
    where: { id: req.params.documentId, technicianId: technician.id },
    include: [{ model: User, as: 'createdBy', attributes: ['id', 'name', 'email'] }],
  });
  if (!document) return fail(res, 404, 'Termo assinado não encontrado nesta ficha.');
  return ok(res, publicDocument(document, true));
});

exports.uploadDocument = asyncHandler(async (req, res) => {
  const technician = await loadTechnicianOrFail(res, req.params.technicianId);
  if (!technician) return;

  const documentName = String(req.body.documentName || '').trim();
  const documentData = String(req.body.documentData || '').trim();
  const notes = String(req.body.notes || '').trim() || null;
  const signedAt = req.body.signedAt || new Date();

  if (!documentName) return fail(res, 400, 'Selecione o termo assinado para anexar.');
  if (!documentData) return fail(res, 400, 'O arquivo do termo assinado não foi recebido.');
  const mime = documentMime(documentData);
  if (!ALLOWED_DOCUMENT_MIMES.includes(mime)) {
    return fail(res, 400, 'Formato não permitido. Anexe PDF, JPG, PNG ou WEBP.');
  }
  if (estimatedDataUrlBytes(documentData) > MAX_DOCUMENT_BYTES) {
    return fail(res, 400, 'O termo assinado deve ter no máximo 12 MB.');
  }

  const activeTools = await TechnicianTool.findAll({
    where: { technicianId: technician.id, status: 'com_tecnico' },
    attributes: ['id', 'name', 'serialNumber', 'brand', 'referenceValue'],
    order: [['name', 'ASC']],
  });
  const totalValue = money(activeTools.reduce((sum, tool) => sum + Number(tool.referenceValue || 0), 0));

  const document = await TechnicianToolDocument.create({
    technicianId: technician.id,
    documentName,
    documentData,
    signedAt,
    notes,
    toolCount: activeTools.length,
    totalValue,
    createdById: req.user?.id || null,
  });

  const createdDocument = await TechnicianToolDocument.findByPk(document.id, {
    include: [{ model: User, as: 'createdBy', attributes: ['id', 'name', 'email'] }],
  });

  await writeAudit({
    req,
    action: 'upload_tool_term',
    entity: 'TechnicianToolDocument',
    entityId: document.id,
    message: `Termo assinado de ferramentas anexado para ${technician.name}.`,
    afterData: {
      id: document.id,
      technicianId: technician.id,
      documentName,
      signedAt,
      notes,
      toolCount: activeTools.length,
      totalValue,
      tools: activeTools.map((tool) => ({ id: tool.id, name: tool.name, serialNumber: tool.serialNumber })),
    },
  });

  return created(res, publicDocument(createdDocument), 'Termo assinado anexado à ficha do técnico.');
});

exports.deleteDocument = asyncHandler(async (req, res) => {
  const document = await TechnicianToolDocument.findOne({
    where: { id: req.params.documentId, technicianId: req.params.technicianId },
  });
  if (!document) return fail(res, 404, 'Termo assinado não encontrado nesta ficha.');

  const before = {
    id: document.id,
    technicianId: document.technicianId,
    documentName: document.documentName,
    signedAt: document.signedAt,
    notes: document.notes,
    toolCount: document.toolCount,
    totalValue: document.totalValue,
  };
  await document.destroy();
  await writeAudit({
    req,
    action: 'delete_tool_term',
    entity: 'TechnicianToolDocument',
    entityId: before.id,
    message: `Termo assinado "${before.documentName}" removido da ficha do técnico.`,
    beforeData: before,
  });
  return ok(res, { id: before.id }, 'Termo assinado removido.');
});

