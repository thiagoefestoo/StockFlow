const sequelize = require('../../config/db');
const { Transfer, TransferItem, Technician, Material, SerializedAsset, StockMovement } = require('../models');
const asyncHandler = require('../utils/asyncHandler');
const { ok, created, fail } = require('../utils/response');
const { money, qty } = require('../utils/number');
const { adjustBalance } = require('../services/stockService');
const { writeAudit } = require('../services/auditService');

function nextNumber() {
  const now = new Date();
  const stamp = `${now.getFullYear()}${String(now.getMonth() + 1).padStart(2, '0')}${String(now.getDate()).padStart(2, '0')}-${String(now.getHours()).padStart(2, '0')}${String(now.getMinutes()).padStart(2, '0')}${String(now.getSeconds()).padStart(2, '0')}`;
  return `GUIA-${stamp}`;
}

exports.list = asyncHandler(async (req, res) => {
  const transfers = await Transfer.findAll({ include: [Technician, { model: TransferItem, include: [Material, SerializedAsset] }], order: [['deliveredAt', 'DESC']], limit: 300 });
  return ok(res, transfers);
});

exports.get = asyncHandler(async (req, res) => {
  const transfer = await Transfer.findByPk(req.params.id, { include: [Technician, { model: TransferItem, include: [Material, SerializedAsset] }] });
  if (!transfer) return fail(res, 404, 'Transferência não encontrada.');
  return ok(res, transfer);
});

exports.create = asyncHandler(async (req, res) => {
  const { technicianId, deliveredAt, notes, items = [] } = req.body;
  if (!technicianId || !items.length) return fail(res, 400, 'Técnico e itens são obrigatórios.');
  const technician = await Technician.findByPk(technicianId);
  if (!technician) return fail(res, 404, 'Técnico não encontrado.');

  const transfer = await sequelize.transaction(async (transaction) => {
    const record = await Transfer.create({ transferNumber: nextNumber(), technicianId, deliveredAt: deliveredAt || new Date(), notes, createdById: req.user.id }, { transaction });
    let totalQuantity = 0;
    let totalValue = 0;
    for (const item of items) {
      const material = await Material.findByPk(item.materialId, { transaction });
      if (!material) throw new Error('Material não encontrado.');
      const serials = Array.isArray(item.serialNumbers) ? item.serialNumbers.map((s) => String(s).trim()).filter(Boolean) : [];
      const quantity = qty(material.requiresSerial ? serials.length : item.quantity);
      const unitCost = money(item.unitCost ?? material.unitCost);
      if (quantity <= 0) throw new Error(`Quantidade inválida para ${material.name}.`);
      if (material.requiresSerial) {
        for (const serialNumber of serials) {
          const asset = await SerializedAsset.findOne({ where: { serialNumber }, transaction });
          if (!asset || asset.ownerType !== 'estoque' || asset.status !== 'em_estoque') throw new Error(`Serial indisponível no estoque: ${serialNumber}.`);
          await TransferItem.create({ transferId: record.id, materialId: material.id, assetId: asset.id, quantity: 1, unitCost: asset.acquisitionCost || unitCost, totalCost: asset.acquisitionCost || unitCost, serialNumber }, { transaction });
          asset.ownerType = 'tecnico';
          asset.status = 'com_tecnico';
          asset.technicianId = technicianId;
          asset.custodyStartedAt = new Date();
          asset.lastMovementAt = new Date();
          await asset.save({ transaction });
          await StockMovement.create({ type: 'transferencia_tecnico', materialId: material.id, assetId: asset.id, quantity: 1, serialNumber, fromOwnerType: 'estoque', toOwnerType: 'tecnico', toTechnicianId: technicianId, reference: record.transferNumber, createdById: req.user.id }, { transaction });
          totalQuantity += 1;
          totalValue += Number(asset.acquisitionCost || unitCost);
        }
      } else {
        await adjustBalance({ materialId: material.id, ownerType: 'estoque', technicianId: null, delta: -quantity, transaction });
        await adjustBalance({ materialId: material.id, ownerType: 'tecnico', technicianId, delta: quantity, transaction });
        await TransferItem.create({ transferId: record.id, materialId: material.id, quantity, unitCost, totalCost: money(quantity * unitCost) }, { transaction });
        await StockMovement.create({ type: 'transferencia_tecnico', materialId: material.id, quantity, fromOwnerType: 'estoque', toOwnerType: 'tecnico', toTechnicianId: technicianId, reference: record.transferNumber, createdById: req.user.id }, { transaction });
        totalQuantity += quantity;
        totalValue += quantity * unitCost;
      }
    }
    record.totalQuantity = qty(totalQuantity);
    record.totalValue = money(totalValue);
    await record.save({ transaction });
    await writeAudit({ req, action: 'create', entity: 'Transfer', entityId: record.id, message: `Guia ${record.transferNumber} entregue para ${technician.name}.`, afterData: record.toJSON(), transaction });
    return record;
  });

  return created(res, transfer, 'Transferência registrada e guia gerada.');
});

exports.update = asyncHandler(async (req, res) => {
  const transfer = await Transfer.findByPk(req.params.id, { include: [Technician, { model: TransferItem, include: [Material, SerializedAsset] }] });
  if (!transfer) return fail(res, 404, 'Transferência não encontrada.');
  const before = transfer.toJSON();
  const { notes, status, deliveredAt, signatureResponsible } = req.body;
  if (notes !== undefined) transfer.notes = notes;
  if (status !== undefined) transfer.status = status;
  if (deliveredAt !== undefined) transfer.deliveredAt = deliveredAt;
  if (signatureResponsible !== undefined) transfer.signatureResponsible = signatureResponsible;
  await transfer.save();
  await writeAudit({ req, action: 'update', entity: 'Transfer', entityId: transfer.id, message: `Guia ${transfer.transferNumber} editada.`, beforeData: before, afterData: transfer.toJSON() });
  return ok(res, transfer, 'Transferência atualizada.');
});

exports.sign = asyncHandler(async (req, res) => {
  const transfer = await Transfer.findByPk(req.params.id);
  if (!transfer) return fail(res, 404, 'Transferência não encontrada.');
  const before = transfer.toJSON();
  const { attachmentName, attachmentData, signatureResponsible } = req.body;
  transfer.status = 'assinado';
  transfer.signedAt = new Date();
  transfer.attachmentName = attachmentName || transfer.attachmentName;
  transfer.attachmentData = attachmentData || transfer.attachmentData;
  transfer.signatureResponsible = signatureResponsible || transfer.signatureResponsible;
  await transfer.save();
  await writeAudit({ req, action: 'sign', entity: 'Transfer', entityId: transfer.id, message: `Guia ${transfer.transferNumber} assinada/anexada.`, beforeData: before, afterData: transfer.toJSON() });
  return ok(res, transfer, 'Assinatura/anexo registrado.');
});
