const sequelize = require('../../config/db');
const { Op } = require('sequelize');
const { Transfer, TransferItem, Technician, Material, SerializedAsset, StockMovement, Warehouse, MaterialRequest, MaterialRequestItem, Notification } = require('../models');
const asyncHandler = require('../utils/asyncHandler');
const { ok, created, fail } = require('../utils/response');
const { money, qty } = require('../utils/number');
const { adjustBalance } = require('../services/stockService');
const { writeAudit } = require('../services/auditService');
const { stockWhereForUser, assertWarehouseAccess, isPrivileged } = require('../utils/warehouseAccess');


async function estimateTransferValue(items = [], sourceWarehouseId) {
  let totalValue = 0;
  for (const item of items) {
    const material = await Material.findByPk(item.materialId);
    if (!material) throw new Error('Material não encontrado.');
    const unitCost = money(item.unitCost ?? material.unitCost);
    if (material.requiresSerial) {
      const serials = Array.isArray(item.serialNumbers) ? item.serialNumbers.map((value) => String(value).trim()).filter(Boolean) : [];
      for (const serialNumber of serials) {
        const asset = await SerializedAsset.findOne({ where: { serialNumber, warehouseId: sourceWarehouseId, ownerType: 'estoque', status: 'em_estoque' } });
        totalValue += Number(asset?.acquisitionCost || unitCost);
      }
    } else {
      totalValue += qty(item.quantity) * unitCost;
    }
  }
  return money(totalValue);
}

function nextNumber() {
  const now = new Date();
  const stamp = `${now.getFullYear()}${String(now.getMonth() + 1).padStart(2, '0')}${String(now.getDate()).padStart(2, '0')}-${String(now.getHours()).padStart(2, '0')}${String(now.getMinutes()).padStart(2, '0')}${String(now.getSeconds()).padStart(2, '0')}`;
  return `GUIA-${stamp}`;
}

exports.list = asyncHandler(async (req, res) => {
  const where = { ...stockWhereForUser(req.user, req.query.warehouseId), transferNumber: { [Op.notILike]: 'PERDA-%' } };
  const transfers = await Transfer.findAll({ where, include: [Technician, Warehouse, { model: TransferItem, include: [Material, SerializedAsset] }], order: [['deliveredAt', 'DESC']], limit: 300 });
  return ok(res, transfers);
});

exports.get = asyncHandler(async (req, res) => {
  const transfer = await Transfer.findByPk(req.params.id, { include: [Technician, Warehouse, { model: TransferItem, include: [Material, SerializedAsset] }] });
  if (!transfer) return fail(res, 404, 'Transferência não encontrada.');
  return ok(res, transfer);
});

exports.create = asyncHandler(async (req, res) => {
  const { technicianId, deliveredAt, notes, warehouseId, materialRequestId, items = [] } = req.body;
  if (!technicianId || !items.length) return fail(res, 400, 'Técnico e itens são obrigatórios.');
  const technician = await Technician.findByPk(technicianId);
  if (!technician) return fail(res, 404, 'Técnico não encontrado.');
  const sourceWarehouseId = warehouseId || technician.defaultWarehouseId || null;
  if (!sourceWarehouseId) return fail(res, 400, 'Selecione o estoque de origem da transferência.');
  if (sourceWarehouseId) {
    try { assertWarehouseAccess(req.user, sourceWarehouseId, 'Você não tem acesso ao estoque de origem.'); } catch (error) { return fail(res, error.statusCode || 403, error.message); }
  }
  const sourceWarehouse = await Warehouse.findByPk(sourceWarehouseId);
  if (!sourceWarehouse) return fail(res, 404, 'Estoque de origem não encontrado.');
  if (sourceWarehouse.status && sourceWarehouse.status !== 'ativo') return fail(res, 400, 'O estoque de origem precisa estar ativo para transferir material.');

  let linkedRequest = null;
  if (materialRequestId) {
    linkedRequest = await MaterialRequest.findByPk(materialRequestId, { include: [{ model: MaterialRequestItem, include: [Material] }] });
    if (!linkedRequest) return fail(res, 404, 'Solicitação de material não encontrada.');
    if (linkedRequest.status !== 'aprovado') return fail(res, 400, 'A solicitação precisa estar aprovada para gerar entrega.');
    if (linkedRequest.requestType === 'recarga_estoque') return fail(res, 400, 'Recarga de estoque deve ser recebida pela tela de solicitações.');
    if (Number(linkedRequest.technicianId) !== Number(technicianId)) return fail(res, 400, 'O técnico selecionado não corresponde à solicitação.');
    if (linkedRequest.warehouseId && Number(linkedRequest.warehouseId) !== Number(sourceWarehouseId)) return fail(res, 400, 'O estoque de origem não corresponde ao estoque da solicitação.');
  }

  const estimatedTotalValue = await estimateTransferValue(items, sourceWarehouseId);
  const technicianApprovalLimit = money(technician.transferApprovalLimit === undefined ? 500 : technician.transferApprovalLimit);
  if (!linkedRequest && estimatedTotalValue > technicianApprovalLimit) {
    return fail(
      res,
      409,
      `A transferência soma ${estimatedTotalValue.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })} e excede o limite sem aprovação de ${technician.name}, definido em ${technicianApprovalLimit.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })}. Envie a carga para aprovação antes de gerar a guia.`,
      { code: 'TECHNICIAN_APPROVAL_REQUIRED', technicianId: technician.id, technicianApprovalLimit, totalValue: estimatedTotalValue },
    );
  }

  const transfer = await sequelize.transaction(async (transaction) => {
    const record = await Transfer.create({ transferNumber: nextNumber(), technicianId, deliveredAt: deliveredAt || new Date(), notes, createdById: req.user.id, warehouseId: sourceWarehouseId }, { transaction });
    let totalQuantity = 0;
    let totalValue = 0;
    const usedSerials = new Set();
    for (const item of items) {
      const material = await Material.findByPk(item.materialId, { transaction });
      if (!material) throw new Error('Material não encontrado.');
      const serials = Array.isArray(item.serialNumbers) ? item.serialNumbers.map((s) => String(s).trim()).filter(Boolean) : [];
      const requestedQuantity = qty(item.quantity);
      const quantity = qty(material.requiresSerial ? serials.length : item.quantity);
      const unitCost = money(item.unitCost ?? material.unitCost);
      if (quantity <= 0) throw new Error(`Quantidade inválida para ${material.name}.`);
      if (material.requiresSerial) {
        if (requestedQuantity <= 0) throw new Error(`Informe a quantidade para ${material.name}.`);
        if (serials.length !== requestedQuantity) throw new Error(`Para ${material.name}, a quantidade informada precisa ser igual aos seriais selecionados. Quantidade: ${qty(requestedQuantity)}. Seriais: ${serials.length}.`);
        for (const serialNumber of serials) {
          const serialKey = String(serialNumber).trim().toUpperCase();
          if (usedSerials.has(serialKey)) throw new Error(`Serial repetido na guia: ${serialNumber}.`);
          usedSerials.add(serialKey);
        }
        for (const serialNumber of serials) {
          const asset = await SerializedAsset.findOne({ where: { serialNumber }, transaction });
          if (!asset || asset.ownerType !== 'estoque' || asset.status !== 'em_estoque' || (sourceWarehouseId && Number(asset.warehouseId) !== Number(sourceWarehouseId))) throw new Error(`Serial indisponível no estoque de origem: ${serialNumber}.`);
          await TransferItem.create({ transferId: record.id, materialId: material.id, assetId: asset.id, quantity: 1, unitCost: asset.acquisitionCost || unitCost, totalCost: asset.acquisitionCost || unitCost, serialNumber }, { transaction });
          asset.ownerType = 'tecnico';
          asset.status = 'com_tecnico';
          asset.technicianId = technicianId;
          asset.custodyStartedAt = new Date();
          asset.lastMovementAt = new Date();
          await asset.save({ transaction });
          await StockMovement.create({ type: 'transferencia_tecnico', materialId: material.id, assetId: asset.id, quantity: 1, serialNumber, fromOwnerType: 'estoque', toOwnerType: 'tecnico', fromWarehouseId: sourceWarehouseId, toTechnicianId: technicianId, reference: record.transferNumber, createdById: req.user.id }, { transaction });
          totalQuantity += 1;
          totalValue += Number(asset.acquisitionCost || unitCost);
        }
      } else {
        await adjustBalance({ materialId: material.id, ownerType: 'estoque', technicianId: null, warehouseId: sourceWarehouseId, delta: -quantity, transaction });
        await adjustBalance({ materialId: material.id, ownerType: 'tecnico', technicianId, delta: quantity, transaction });
        await TransferItem.create({ transferId: record.id, materialId: material.id, quantity, unitCost, totalCost: money(quantity * unitCost) }, { transaction });
        await StockMovement.create({ type: 'transferencia_tecnico', materialId: material.id, quantity, fromOwnerType: 'estoque', toOwnerType: 'tecnico', fromWarehouseId: sourceWarehouseId, toTechnicianId: technicianId, reference: record.transferNumber, createdById: req.user.id }, { transaction });
        totalQuantity += quantity;
        totalValue += quantity * unitCost;
      }
    }
    record.totalQuantity = qty(totalQuantity);
    record.totalValue = money(totalValue);
    await record.save({ transaction });

    await Notification.create({
      role: 'tecnico',
      type: 'estoque',
      severity: 'success',
      title: `Nova carga enviada ${record.transferNumber}`,
      message: `${qty(totalQuantity)} item(ns) foram transferidos para a caixa do técnico ${technician.name}.`,
      route: '/caixa-tecnico',
      metadata: { transferId: record.id, technicianId: Number(technicianId), warehouseId: sourceWarehouseId, totalQuantity: qty(totalQuantity) },
    }, { transaction });

    if (linkedRequest) {
      const beforeRequest = linkedRequest.toJSON();
      linkedRequest.status = 'entregue';
      linkedRequest.deliveredAt = new Date();
      linkedRequest.deliveredById = req.user.id;
      linkedRequest.transferId = record.id;
      linkedRequest.logisticsNotes = notes || linkedRequest.logisticsNotes;
      await linkedRequest.save({ transaction });
      await Notification.create({
        role: 'tecnico',
        type: 'estoque',
        severity: 'success',
        title: `Carga recebida ${linkedRequest.requestNumber}`,
        message: `Sua solicitação foi entregue. Confira sua caixa e assine a guia ${record.transferNumber}.`,
        route: '/caixa-tecnico',
        metadata: { requestId: linkedRequest.id, transferId: record.id },
      }, { transaction });
      await writeAudit({ req, action: 'deliver_from_request', entity: 'MaterialRequest', entityId: linkedRequest.id, message: `Solicitação ${linkedRequest.requestNumber} entregue pela guia ${record.transferNumber}.`, beforeData: beforeRequest, afterData: linkedRequest.toJSON(), transaction });
    }

    await writeAudit({
      req,
      action: 'create',
      entity: 'Transfer',
      entityId: record.id,
      message: `Guia ${record.transferNumber} transferiu material do estoque ${sourceWarehouse.name} para ${technician.name}.`,
      afterData: { ...record.toJSON(), sourceWarehouse: sourceWarehouse.toJSON(), technicianApprovalLimit, estimatedTotalValue, linkedMaterialRequestId: linkedRequest?.id || null, items },
      transaction,
    });
    return record;
  });

  return created(res, transfer, 'Transferência registrada e guia gerada.');
});

exports.update = asyncHandler(async (req, res) => {
  const transfer = await Transfer.findByPk(req.params.id, { include: [Technician, Warehouse, { model: TransferItem, include: [Material, SerializedAsset] }] });
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
