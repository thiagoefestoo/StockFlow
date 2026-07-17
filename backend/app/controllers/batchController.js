const sequelize = require('../../config/db');
const { StockBatch, StockBatchItem, Material, SerializedAsset, StockMovement, User, Warehouse } = require('../models');
const asyncHandler = require('../utils/asyncHandler');
const { ok, created, fail } = require('../utils/response');
const { money, qty } = require('../utils/number');
const { adjustBalance } = require('../services/stockService');
const { writeAudit } = require('../services/auditService');

exports.list = asyncHandler(async (req, res) => {
  const batches = await StockBatch.findAll({
    include: [
      { model: StockBatchItem, include: [Material] },
      { model: User, as: 'createdBy', attributes: ['id', 'name', 'email', 'role'] },
      Warehouse,
    ],
    order: [['receivedAt', 'DESC'], ['createdAt', 'DESC']],
    limit: 400,
  });
  return ok(res, batches);
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
  if (!proofAttachmentName || !proofAttachmentData) return fail(res, 400, 'Anexe um comprovante da entrada, como nota fiscal, termo de entrega, romaneio ou recibo.');
  if (!fiscalDocumentNumber && !invoiceAccessKey) return fail(res, 400, 'Informe o número do documento fiscal/termo ou a chave de acesso da nota.');
  let targetWarehouseId = warehouseId || null;
  if (targetWarehouseId) {
    const warehouse = await Warehouse.findByPk(targetWarehouseId);
    if (!warehouse || warehouse.status !== 'ativo') return fail(res, 404, 'Estoque/região informado não existe ou está inativo.');
  }

  const result = await sequelize.transaction(async (transaction) => {
    let totalItems = 0;
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
      const serials = Array.isArray(item.serialNumbers) ? item.serialNumbers.map((s) => String(s).trim()).filter(Boolean) : [];
      const quantity = qty(item.quantity || serials.length || 0);
      const unitCost = money(item.unitCost ?? material.unitCost);
      if (quantity <= 0) throw new Error(`Quantidade inválida para ${material.name}.`);
      if (material.requiresSerial && serials.length !== Number(quantity)) throw new Error(`Quantidade de seriais precisa bater com o item ${material.name}.`);
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

      if (material.requiresSerial) {
        for (const serialNumber of serials) {
          const exists = await SerializedAsset.findOne({ where: { serialNumber }, transaction });
          if (exists) throw new Error(`Serial duplicado: ${serialNumber}.`);
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
      afterData: batch.toJSON(),
      transaction,
    });
    return batch;
  });

  return created(res, result, 'Entrada de estoque registrada com documento comprobatório.');
});
