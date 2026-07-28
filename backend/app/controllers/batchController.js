const sequelize = require('../../config/db');
const { Op } = require('sequelize');
const { StockBatch, StockBatchItem, Material, SerializedAsset, StockMovement, User, Warehouse } = require('../models');
const asyncHandler = require('../utils/asyncHandler');
const { ok, okPaginated, created, fail } = require('../utils/response');
const { paginationFromQuery, paginationMeta } = require('../utils/pagination');
const { money, qty } = require('../utils/number');
const { adjustBalance } = require('../services/stockService');
const { stockWhereForUser, assertWarehouseAccess, isPrivileged } = require('../utils/warehouseAccess');
const { writeAudit } = require('../services/auditService');
const { isTrue } = require('../utils/booleans');
const { assertUniqueOperationItems } = require('../utils/itemSelectionValidation');
const { reverseWarehouseIds, warehouseOutsideReverse } = require('../utils/reverseLogistics');

exports.list = asyncHandler(async (req, res) => {
  const reverseIds = await reverseWarehouseIds();
  const where = { [Op.and]: [stockWhereForUser(req.user, req.query.warehouseId), warehouseOutsideReverse(reverseIds)] };
  const pagination = paginationFromQuery(req.query);
  const limit = pagination.enabled ? pagination.limit : Math.min(Math.max(Number(req.query.limit || 150), 1), 300);
  const [batches, total] = await Promise.all([
    StockBatch.findAll({
      where,
      attributes: { exclude: ['proofAttachmentData'] },
      include: [
        { model: User, as: 'createdBy', attributes: ['id', 'name', 'email', 'role'] },
        Warehouse,
      ],
      order: [['receivedAt', 'DESC'], ['createdAt', 'DESC']],
      limit,
      ...(pagination.enabled ? { offset: pagination.offset } : {}),
    }),
    pagination.enabled ? StockBatch.count({ where }) : Promise.resolve(0),
  ]);
  return pagination.enabled
    ? okPaginated(res, batches, paginationMeta(total, pagination.page, pagination.pageSize))
    : ok(res, batches);
});

exports.get = asyncHandler(async (req, res) => {
  const reverseIds = await reverseWarehouseIds();
  const where = { id: req.params.id, [Op.and]: [stockWhereForUser(req.user), warehouseOutsideReverse(reverseIds)] };
  const batch = await StockBatch.findOne({
    where,
    include: [
      { model: StockBatchItem, include: [Material] },
      { model: User, as: 'createdBy', attributes: ['id', 'name', 'email', 'role'] },
      Warehouse,
    ],
  });
  if (!batch) return fail(res, 404, 'Entrada de estoque não encontrada ou sem acesso.');
  return ok(res, batch);
});

exports.create = asyncHandler(async (req, res) => {
  const {
    receiptNumber,
    sourceCompany,
    receivedAt,
    cycle,
    notes,
    fiscalDocumentType = 'nota_fiscal',
    fiscalDocumentNumber,
    fiscalDocumentDate,
    fiscalIssuer,
    invoiceAccessKey,
    receivedByName,
    conferenceStatus = 'conferido',
    warehouseLocation,
    warehouseId,
    proofAttachmentName,
    proofAttachmentData,
    items = [],
  } = req.body;

  if (!receiptNumber || !receivedAt || !items.length) return fail(res, 400, 'Número de recebimento, data e itens são obrigatórios.');
  try { assertUniqueOperationItems(items); } catch (error) { return fail(res, error.statusCode || 400, error.message); }
  if (!proofAttachmentName || !proofAttachmentData) return fail(res, 400, 'Anexe um comprovante da entrada, como nota fiscal, termo de entrega, romaneio ou recibo.');
  if (!fiscalDocumentNumber && !invoiceAccessKey) return fail(res, 400, 'Informe o número do documento fiscal/termo ou a chave de acesso da nota.');
  let targetWarehouseId = warehouseId || null;
  if (!targetWarehouseId) return fail(res, 400, 'Selecione o estoque regional onde a entrada será registrada. Não existe mais entrada em estoque central.');
  if (targetWarehouseId) {
    try { assertWarehouseAccess(req.user, targetWarehouseId, 'Você não tem acesso ao estoque informado.'); } catch (error) { return fail(res, error.statusCode || 403, error.message); }
    const warehouse = await Warehouse.findByPk(targetWarehouseId);
    if (!warehouse || warehouse.status !== 'ativo') return fail(res, 404, 'Estoque/região informado não existe ou está inativo.');
    if (warehouse.isReverseLogistics) return fail(res, 400, 'Entradas de logística reversa usam o fluxo isolado e não podem ser registradas como entrada operacional.');
  }

  const result = await sequelize.transaction(async (transaction) => {
    let totalItems = 0;
    const serialsInThisEntry = new Set();
    let totalValue = 0;
    const batch = await StockBatch.create({
      receiptNumber,
      sourceCompany,
      receivedAt,
      cycle,
      notes,
      fiscalDocumentType,
      fiscalDocumentNumber,
      fiscalDocumentDate,
      fiscalIssuer,
      invoiceAccessKey,
      receivedByName,
      conferenceStatus,
      warehouseLocation,
      proofAttachmentName,
      proofAttachmentData,
      warehouseId: targetWarehouseId,
      createdById: req.user.id,
    }, { transaction });

    for (const item of items) {
      const material = await Material.findByPk(item.materialId, { transaction });
      if (!material) throw new Error('Material não encontrado.');
      const materialRequiresSerial = isTrue(material.requiresSerial);
      const typedSerials = Array.isArray(item.serialNumbers) ? item.serialNumbers.map((s) => String(s).trim()).filter(Boolean) : [];
      const serials = materialRequiresSerial ? typedSerials : [];
      const quantity = qty(item.quantity || (materialRequiresSerial ? serials.length : 0) || 0);
      const unitCost = money(item.unitCost ?? 0);
      if (quantity <= 0) throw new Error(`Quantidade inválida para ${material.name}.`);
      if (unitCost <= 0) throw new Error(`Informe o valor unitário da entrada para ${material.name}.`);
      if (materialRequiresSerial) {
        if (serials.length !== Number(quantity)) throw new Error(`Informe exatamente ${Number(quantity)} serial(is) para ${material.name}. Você informou ${serials.length}.`);
        const localSet = new Set();
        const repeatedTyped = [];
        for (const serialNumber of serials) {
          const normalizedSerial = serialNumber.toUpperCase();
          if (localSet.has(normalizedSerial) || serialsInThisEntry.has(normalizedSerial)) repeatedTyped.push(serialNumber);
          localSet.add(normalizedSerial);
        }
        if (repeatedTyped.length) throw new Error(`Serial digitado repetido: ${[...new Set(repeatedTyped)].join(', ')}.`);
        const alreadyRegistered = serials.length ? await SerializedAsset.findAll({ where: { [Op.or]: serials.map((serialNumber) => ({ serialNumber: { [Op.iLike]: serialNumber } })) }, transaction }) : [];
        if (alreadyRegistered.length) throw new Error(`Serial já cadastrado: ${alreadyRegistered.map((asset) => asset.serialNumber).join(', ')}.`);
        serials.forEach((serialNumber) => serialsInThisEntry.add(serialNumber.toUpperCase()));
      }
      const totalCost = money(quantity * unitCost);
      totalItems += quantity;
      totalValue += totalCost;

      await StockBatchItem.create({
        batchId: batch.id,
        materialId: material.id,
        quantity,
        unitCost,
        totalCost,
        serialNumbers: serials,
        manufacturerLot: item.manufacturerLot || null,
        purchaseOrder: item.purchaseOrder || null,
        condition: item.condition || 'novo',
        warehouseLocation: item.warehouseLocation || warehouseLocation || null,
        itemNotes: item.itemNotes || null,
        warehouseId: targetWarehouseId,
      }, { transaction });

      if (materialRequiresSerial) {
        for (const serialNumber of serials) {
          const asset = await SerializedAsset.create({
            materialId: material.id,
            serialNumber,
            mac: item.macBySerial?.[serialNumber] || null,
            brand: item.brand || null,
            model: item.model || null,
            acquisitionCost: unitCost,
            status: 'em_estoque',
            ownerType: 'estoque',
            lastMovementAt: new Date(),
            warehouseId: targetWarehouseId,
            notes: [
              item.itemNotes,
              item.manufacturerLot ? `Lote fabricante: ${item.manufacturerLot}` : null,
              item.purchaseOrder ? `Pedido/OC: ${item.purchaseOrder}` : null,
              item.condition ? `Condição: ${item.condition}` : null,
              item.warehouseLocation || warehouseLocation ? `Local: ${item.warehouseLocation || warehouseLocation}` : null,
            ].filter(Boolean).join(' | ') || null,
          }, { transaction });
          await StockMovement.create({
            type: 'entrada',
            materialId: material.id,
            assetId: asset.id,
            quantity: 1,
            serialNumber,
            toOwnerType: 'estoque',
            toWarehouseId: targetWarehouseId,
            reference: receiptNumber,
            notes: `Entrada por lote ${receiptNumber}. Documento: ${fiscalDocumentNumber || invoiceAccessKey}.`,
            createdById: req.user.id,
          }, { transaction });
        }
      } else {
        await adjustBalance({ materialId: material.id, ownerType: 'estoque', technicianId: null, warehouseId: targetWarehouseId, delta: quantity, transaction });
        await StockMovement.create({
          type: 'entrada',
          materialId: material.id,
          quantity,
          toOwnerType: 'estoque',
          toWarehouseId: targetWarehouseId,
          reference: receiptNumber,
          notes: `Entrada por lote ${receiptNumber}. Documento: ${fiscalDocumentNumber || invoiceAccessKey}.`,
          createdById: req.user.id,
        }, { transaction });
      }
    }

    batch.totalItems = qty(totalItems);
    batch.totalValue = money(totalValue);
    await batch.save({ transaction });
    await writeAudit({
      req,
      action: 'create',
      entity: 'StockBatch',
      entityId: batch.id,
      message: `Entrada de estoque ${receiptNumber} confirmada com comprovante ${proofAttachmentName}.`,
      afterData: { ...batch.toJSON(), proofAttachmentData: undefined },
      transaction,
    });
    return batch;
  });

  return created(res, { ...result.toJSON(), proofAttachmentData: undefined }, 'Entrada de estoque registrada com documento comprobatório.');
});
