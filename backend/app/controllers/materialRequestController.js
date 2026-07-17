const sequelize = require('../../config/db');
const {
  MaterialRequest,
  MaterialRequestItem,
  ApprovalRequest,
  Material,
  Technician,
  Transfer,
  TransferItem,
  SerializedAsset,
  StockMovement,
  Notification,
  User,
  Warehouse,
} = require('../models');
const asyncHandler = require('../utils/asyncHandler');
const { ok, created, fail } = require('../utils/response');
const { money, qty } = require('../utils/number');
const { adjustBalance } = require('../services/stockService');
const { writeAudit } = require('../services/auditService');

function nextRequestNumber() {
  const now = new Date();
  const stamp = `${now.getFullYear()}${String(now.getMonth() + 1).padStart(2, '0')}${String(now.getDate()).padStart(2, '0')}-${String(now.getHours()).padStart(2, '0')}${String(now.getMinutes()).padStart(2, '0')}${String(now.getSeconds()).padStart(2, '0')}`;
  return `REQ-${stamp}`;
}

function nextTransferNumber() {
  const now = new Date();
  const stamp = `${now.getFullYear()}${String(now.getMonth() + 1).padStart(2, '0')}${String(now.getDate()).padStart(2, '0')}-${String(now.getHours()).padStart(2, '0')}${String(now.getMinutes()).padStart(2, '0')}${String(now.getSeconds()).padStart(2, '0')}`;
  return `GUIA-${stamp}`;
}

function includeFull() {
  return [
    Technician,
    { model: User, as: 'requestedBy', attributes: ['id', 'name', 'email', 'role'] },
    { model: User, as: 'approvedBy', attributes: ['id', 'name', 'email', 'role'] },
    { model: User, as: 'deliveredBy', attributes: ['id', 'name', 'email', 'role'] },
    Transfer,
    Warehouse,
    { model: MaterialRequestItem, include: [Material, SerializedAsset] },
  ];
}

exports.list = asyncHandler(async (req, res) => {
  const where = {};
  if (req.user.role === 'tecnico') where.technicianId = req.user.technicianId || -1;
  if (req.query.status) where.status = req.query.status;
  if (req.query.technicianId) where.technicianId = req.query.technicianId;
  const requests = await MaterialRequest.findAll({ where, include: includeFull(), order: [['createdAt', 'DESC']], limit: 500 });
  return ok(res, requests);
});

exports.summary = asyncHandler(async (req, res) => {
  const technicianFilter = req.user.role === 'tecnico' ? { technicianId: req.user.technicianId || -1 } : {};
  const [pending, approved, delivered, rejected, total] = await Promise.all([
    MaterialRequest.count({ where: { ...technicianFilter, status: 'pendente_aprovacao' } }),
    MaterialRequest.count({ where: { ...technicianFilter, status: 'aprovado' } }),
    MaterialRequest.count({ where: { ...technicianFilter, status: 'entregue' } }),
    MaterialRequest.count({ where: { ...technicianFilter, status: 'reprovado' } }),
    MaterialRequest.count({ where: technicianFilter }),
  ]);
  return ok(res, { pending, approved, delivered, rejected, total });
});

exports.get = asyncHandler(async (req, res) => {
  const request = await MaterialRequest.findByPk(req.params.id, { include: includeFull() });
  if (!request) return fail(res, 404, 'Solicitação não encontrada.');
  if (req.user.role === 'tecnico' && Number(request.technicianId) !== Number(req.user.technicianId)) return fail(res, 403, 'Você só pode consultar suas próprias solicitações.');
  return ok(res, request);
});

exports.create = asyncHandler(async (req, res) => {
  let { technicianId, requestType, priority, neededBy, requesterNotes, warehouseId, items = [] } = req.body;
  if (req.user.role === 'tecnico') technicianId = req.user.technicianId;
  if (!technicianId) return fail(res, 400, 'Técnico é obrigatório.');
  if (!items.length) return fail(res, 400, 'Inclua ao menos um item solicitado.');
  const technician = await Technician.findByPk(technicianId);
  if (!technician) return fail(res, 404, 'Técnico não encontrado.');
  warehouseId = warehouseId || technician.defaultWarehouseId || null;
  if (warehouseId) {
    const warehouse = await Warehouse.findByPk(warehouseId);
    if (!warehouse || warehouse.status !== 'ativo') return fail(res, 404, 'Estoque/região não encontrado ou inativo.');
  }

  const request = await sequelize.transaction(async (transaction) => {
    const record = await MaterialRequest.create({
      requestNumber: nextRequestNumber(),
      technicianId,
      requestType: requestType || 'reposicao_carga',
      status: 'pendente_aprovacao',
      priority: priority || 'media',
      neededBy: neededBy || null,
      requesterNotes,
      requestedById: req.user.id,
      warehouseId: warehouseId || null,
    }, { transaction });

    let totalQuantity = 0;
    let totalValue = 0;
    const cleanItems = [];
    const approvalItems = [];

    for (const item of items) {
      const material = await Material.findByPk(item.materialId, { transaction });
      if (!material) throw new Error('Material não encontrado na solicitação.');
      const quantity = qty(item.quantity);
      if (quantity <= 0) continue;
      const unitCost = money(item.unitCost ?? material.unitCost);
      const totalCost = money(quantity * unitCost);
      const serialNumbers = Array.isArray(item.serialNumbers) ? item.serialNumbers.map((s) => String(s).trim()).filter(Boolean) : [];
      const createdItem = await MaterialRequestItem.create({
        requestId: record.id,
        materialId: material.id,
        quantity,
        approvedQuantity: quantity,
        unitCost,
        totalCost,
        serialNumbers,
        notes: item.notes,
      }, { transaction });
      cleanItems.push(createdItem);
      approvalItems.push({ materialId: material.id, materialName: material.name, category: material.category, quantity, unitCost, totalCost, serialNumbers, notes: item.notes });
      totalQuantity += quantity;
      totalValue += totalCost;
    }

    if (!cleanItems.length) throw new Error('Nenhum item válido foi informado.');

    record.totalQuantity = qty(totalQuantity);
    record.totalValue = money(totalValue);
    await record.save({ transaction });

    await ApprovalRequest.create({
      workflowCode: 'material_request',
      entityType: 'material_request',
      entityId: String(record.id),
      title: `Aprovar ${record.requestNumber}`,
      description: `Solicitação de material para ${technician.name}.`,
      status: 'pendente',
      priority: record.priority,
      amount: record.totalValue,
      requestedById: req.user.id,
      payload: { requestId: record.id, requestNumber: record.requestNumber, technicianId, technicianName: technician.name, warehouseId: warehouseId || null, items: approvalItems },
    }, { transaction });

    await Notification.create({
      role: 'supervisor',
      type: 'tarefa',
      severity: record.priority === 'critica' ? 'danger' : 'warning',
      title: `Nova solicitação ${record.requestNumber}`,
      message: `${technician.name} solicitou ${record.totalQuantity} item(ns) para a carga técnica.`,
      route: '/aprovacoes',
      metadata: { requestId: record.id, requestNumber: record.requestNumber },
    }, { transaction });

    await writeAudit({ req, action: 'request', entity: 'MaterialRequest', entityId: record.id, message: `Solicitação ${record.requestNumber} aberta para ${technician.name}.`, afterData: record.toJSON(), transaction });
    return record;
  });

  return created(res, await MaterialRequest.findByPk(request.id, { include: includeFull() }), 'Solicitação enviada para aprovação.');
});

exports.approve = asyncHandler(async (req, res) => {
  const request = await MaterialRequest.findByPk(req.params.id, { include: includeFull() });
  if (!request) return fail(res, 404, 'Solicitação não encontrada.');
  if (request.status !== 'pendente_aprovacao') return fail(res, 400, 'A solicitação não está pendente de aprovação.');
  const adminMinAmount = Number(process.env.APPROVAL_ADMIN_MIN_AMOUNT || 500);
  const amount = Number(request.totalValue || 0);
  if (amount >= adminMinAmount && req.user.role !== 'admin') {
    return fail(res, 403, `Esta solicitação soma ${amount.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })} e exige aprovação de administrador a partir de ${adminMinAmount.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })}.`);
  }

  const before = request.toJSON();
  await sequelize.transaction(async (transaction) => {
    request.status = 'aprovado';
    request.approvedAt = new Date();
    request.approvedById = req.user.id;
    request.approvalNotes = req.body.approvalNotes || req.body.notes || null;
    await request.save({ transaction });
    await ApprovalRequest.update({ status: 'aprovado', decidedAt: new Date(), decidedById: req.user.id, decisionNotes: request.approvalNotes }, { where: { entityType: 'material_request', entityId: String(request.id) }, transaction });
    await Notification.create({
      role: 'admin',
      type: 'estoque',
      severity: 'success',
      title: `Solicitação aprovada ${request.requestNumber}`,
      message: `A solicitação foi aprovada e está pronta para separação/entrega ao técnico.`,
      route: '/solicitacoes-material',
      metadata: { requestId: request.id },
    }, { transaction });
    await writeAudit({ req, action: 'approve', entity: 'MaterialRequest', entityId: request.id, message: `Solicitação ${request.requestNumber} aprovada.`, beforeData: before, afterData: request.toJSON(), transaction });
  });

  return ok(res, await MaterialRequest.findByPk(request.id, { include: includeFull() }), 'Solicitação aprovada.');
});

exports.reject = asyncHandler(async (req, res) => {
  const request = await MaterialRequest.findByPk(req.params.id, { include: includeFull() });
  if (!request) return fail(res, 404, 'Solicitação não encontrada.');
  if (!['pendente_aprovacao', 'aprovado'].includes(request.status)) return fail(res, 400, 'Esta solicitação não pode ser reprovada.');

  const before = request.toJSON();
  await sequelize.transaction(async (transaction) => {
    request.status = 'reprovado';
    request.approvedById = req.user.id;
    request.approvedAt = new Date();
    request.approvalNotes = req.body.approvalNotes || req.body.notes || 'Reprovada.';
    await request.save({ transaction });
    await ApprovalRequest.update({ status: 'reprovado', decidedAt: new Date(), decidedById: req.user.id, decisionNotes: request.approvalNotes }, { where: { entityType: 'material_request', entityId: String(request.id) }, transaction });
    await writeAudit({ req, action: 'reject', entity: 'MaterialRequest', entityId: request.id, message: `Solicitação ${request.requestNumber} reprovada.`, beforeData: before, afterData: request.toJSON(), transaction });
  });

  return ok(res, await MaterialRequest.findByPk(request.id, { include: includeFull() }), 'Solicitação reprovada.');
});

exports.deliver = asyncHandler(async (req, res) => {
  const request = await MaterialRequest.findByPk(req.params.id, { include: includeFull() });
  if (!request) return fail(res, 404, 'Solicitação não encontrada.');
  if (request.status !== 'aprovado') return fail(res, 400, 'A solicitação precisa estar aprovada para ser entregue.');

  const transfer = await sequelize.transaction(async (transaction) => {
    const technician = await Technician.findByPk(request.technicianId, { transaction });
    if (!technician) throw new Error('Técnico não encontrado.');

    const record = await Transfer.create({
      transferNumber: nextTransferNumber(),
      technicianId: request.technicianId,
      deliveredAt: new Date(),
      notes: `Gerada pela solicitação ${request.requestNumber}. ${req.body.logisticsNotes || ''}`.trim(),
      createdById: req.user.id,
      warehouseId: request.warehouseId || null,
      stampText: `CARIMBO STOCKFLOW | ${technician.name} | ${request.requestNumber} | ${new Date().toLocaleDateString('pt-BR')} | Assinatura: ______________________________`,
    }, { transaction });

    let totalQuantity = 0;
    let totalValue = 0;
    const deliveryOverrides = Array.isArray(req.body.items) ? req.body.items : [];

    for (const requestItem of request.MaterialRequestItems || []) {
      const material = requestItem.Material || await Material.findByPk(requestItem.materialId, { transaction });
      const override = deliveryOverrides.find((item) => Number(item.requestItemId) === Number(requestItem.id));
      const quantity = qty(override?.approvedQuantity ?? requestItem.approvedQuantity ?? requestItem.quantity);
      if (quantity <= 0) continue;
      const unitCost = money(requestItem.unitCost ?? material.unitCost);

      if (material.requiresSerial) {
        let serials = [];
        if (override?.serialNumbers?.length) serials = override.serialNumbers;
        else if (requestItem.serialNumbers?.length) serials = requestItem.serialNumbers;

        let assets;
        if (serials.length) {
          assets = await SerializedAsset.findAll({ where: { serialNumber: serials, materialId: material.id, ownerType: 'estoque', status: 'em_estoque', ...(request.warehouseId ? { warehouseId: request.warehouseId } : {}) }, transaction });
        } else {
          assets = await SerializedAsset.findAll({ where: { materialId: material.id, ownerType: 'estoque', status: 'em_estoque', ...(request.warehouseId ? { warehouseId: request.warehouseId } : {}) }, order: [['serialNumber', 'ASC']], limit: Math.ceil(quantity), transaction });
        }
        if (assets.length < quantity) throw new Error(`Estoque serializado insuficiente para ${material.name}.`);
        const deliveredSerials = [];
        for (const asset of assets.slice(0, Math.ceil(quantity))) {
          deliveredSerials.push(asset.serialNumber);
          const assetCost = money(asset.acquisitionCost || unitCost);
          await TransferItem.create({ transferId: record.id, materialId: material.id, assetId: asset.id, quantity: 1, unitCost: assetCost, totalCost: assetCost, serialNumber: asset.serialNumber }, { transaction });
          asset.ownerType = 'tecnico';
          asset.status = 'com_tecnico';
          asset.technicianId = request.technicianId;
          asset.custodyStartedAt = new Date();
          asset.lastMovementAt = new Date();
          await asset.save({ transaction });
          await StockMovement.create({ type: 'transferencia_tecnico', materialId: material.id, assetId: asset.id, quantity: 1, serialNumber: asset.serialNumber, fromOwnerType: 'estoque', toOwnerType: 'tecnico', fromWarehouseId: request.warehouseId || asset.warehouseId || null, toTechnicianId: request.technicianId, reference: record.transferNumber, notes: `Expedição pela solicitação ${request.requestNumber}.`, createdById: req.user.id }, { transaction });
          totalQuantity += 1;
          totalValue += assetCost;
        }
        requestItem.deliverySerials = deliveredSerials;
        await requestItem.save({ transaction });
      } else {
        await adjustBalance({ materialId: material.id, ownerType: 'estoque', technicianId: null, warehouseId: request.warehouseId || null, delta: -quantity, transaction });
        await adjustBalance({ materialId: material.id, ownerType: 'tecnico', technicianId: request.technicianId, delta: quantity, transaction });
        const totalCost = money(quantity * unitCost);
        await TransferItem.create({ transferId: record.id, materialId: material.id, quantity, unitCost, totalCost }, { transaction });
        await StockMovement.create({ type: 'transferencia_tecnico', materialId: material.id, quantity, fromOwnerType: 'estoque', toOwnerType: 'tecnico', fromWarehouseId: request.warehouseId || null, toTechnicianId: request.technicianId, reference: record.transferNumber, notes: `Expedição pela solicitação ${request.requestNumber}.`, createdById: req.user.id }, { transaction });
        totalQuantity += quantity;
        totalValue += totalCost;
      }
    }

    record.totalQuantity = qty(totalQuantity);
    record.totalValue = money(totalValue);
    await record.save({ transaction });

    const before = request.toJSON();
    request.status = 'entregue';
    request.deliveredAt = new Date();
    request.deliveredById = req.user.id;
    request.transferId = record.id;
    request.logisticsNotes = req.body.logisticsNotes || request.logisticsNotes;
    await request.save({ transaction });

    await Notification.create({
      role: 'tecnico',
      type: 'estoque',
      severity: 'success',
      title: `Carga recebida ${request.requestNumber}`,
      message: `Sua solicitação foi entregue. Confira sua caixa e assine a guia ${record.transferNumber}.`,
      route: '/caixa-tecnico',
      metadata: { requestId: request.id, transferId: record.id },
    }, { transaction });

    await writeAudit({ req, action: 'deliver', entity: 'MaterialRequest', entityId: request.id, message: `Solicitação ${request.requestNumber} entregue e vinculada à guia ${record.transferNumber}.`, beforeData: before, afterData: request.toJSON(), transaction });
    return record;
  });

  return created(res, await MaterialRequest.findByPk(request.id, { include: includeFull() }), `Carga entregue e guia ${transfer.transferNumber} gerada.`);
});
