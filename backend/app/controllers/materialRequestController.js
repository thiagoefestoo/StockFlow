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
const { userWarehouseIds, assertWarehouseAccess } = require('../utils/warehouseAccess');
const { Op } = require('sequelize');

function nextRequestNumber(prefix = 'REQ') {
  const now = new Date();
  const stamp = `${now.getFullYear()}${String(now.getMonth() + 1).padStart(2, '0')}${String(now.getDate()).padStart(2, '0')}-${String(now.getHours()).padStart(2, '0')}${String(now.getMinutes()).padStart(2, '0')}${String(now.getSeconds()).padStart(2, '0')}`;
  return `${prefix}-${stamp}`;
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

function isStockRecharge(requestType) {
  return String(requestType || '').toLowerCase() === 'recarga_estoque';
}

function allowedWarehouseWhere(user) {
  if (['admin', 'supervisor'].includes(user?.role)) return null;
  const ids = userWarehouseIds(user);
  if (!ids.length) return { warehouseId: -1 };
  return { warehouseId: { [Op.in]: ids } };
}

async function resolveRequestWarehouse({ req, warehouseId, technicianId, requestType }) {
  let selectedWarehouseId = Number(warehouseId || 0) || null;

  if (isStockRecharge(requestType)) {
    if (!selectedWarehouseId && req.user.role === 'estoquista') {
      const ids = userWarehouseIds(req.user);
      if (ids.length === 1) selectedWarehouseId = ids[0];
    }
    if (!selectedWarehouseId) {
      const error = new Error('Selecione o estoque regional que receberá a recarga.');
      error.statusCode = 400;
      throw error;
    }
  }

  if (!selectedWarehouseId && technicianId) {
    const technician = await Technician.findByPk(technicianId);
    selectedWarehouseId = technician?.defaultWarehouseId || null;
  }

  if (selectedWarehouseId) {
    if (!['admin', 'supervisor'].includes(req.user.role)) {
      assertWarehouseAccess(req.user, selectedWarehouseId, 'Você só pode solicitar material para estoques autorizados ao seu usuário.');
    }
    const warehouse = await Warehouse.findByPk(selectedWarehouseId);
    if (!warehouse || warehouse.status !== 'ativo') {
      const error = new Error('Estoque regional não encontrado ou inativo.');
      error.statusCode = 404;
      throw error;
    }
  }

  return selectedWarehouseId;
}

exports.list = asyncHandler(async (req, res) => {
  const where = {};
  if (req.user.role === 'tecnico') where.technicianId = req.user.technicianId || -1;
  if (req.user.role === 'estoquista') {
    const warehouseFilter = allowedWarehouseWhere(req.user);
    if (warehouseFilter) Object.assign(where, warehouseFilter);
  }
  if (req.query.status) where.status = req.query.status;
  if (req.query.requestType) where.requestType = req.query.requestType;
  if (req.query.technicianId) where.technicianId = req.query.technicianId;
  if (req.query.warehouseId) where.warehouseId = req.query.warehouseId;
  const requests = await MaterialRequest.findAll({ where, include: includeFull(), order: [['createdAt', 'DESC']], limit: 500 });
  return ok(res, requests);
});

exports.summary = asyncHandler(async (req, res) => {
  const filter = {};
  if (req.user.role === 'tecnico') filter.technicianId = req.user.technicianId || -1;
  if (req.user.role === 'estoquista') {
    const warehouseFilter = allowedWarehouseWhere(req.user);
    if (warehouseFilter) Object.assign(filter, warehouseFilter);
  }
  const [pending, approved, delivered, rejected, total] = await Promise.all([
    MaterialRequest.count({ where: { ...filter, status: 'pendente_aprovacao' } }),
    MaterialRequest.count({ where: { ...filter, status: 'aprovado' } }),
    MaterialRequest.count({ where: { ...filter, status: 'entregue' } }),
    MaterialRequest.count({ where: { ...filter, status: 'reprovado' } }),
    MaterialRequest.count({ where: filter }),
  ]);
  return ok(res, { pending, approved, delivered, rejected, total });
});

exports.get = asyncHandler(async (req, res) => {
  const request = await MaterialRequest.findByPk(req.params.id, { include: includeFull() });
  if (!request) return fail(res, 404, 'Solicitação não encontrada.');
  if (req.user.role === 'tecnico' && Number(request.technicianId) !== Number(req.user.technicianId)) return fail(res, 403, 'Você só pode consultar suas próprias solicitações.');
  if (req.user.role === 'estoquista' && request.warehouseId) assertWarehouseAccess(req.user, request.warehouseId, 'Você só pode consultar solicitações dos seus estoques autorizados.');
  return ok(res, request);
});

exports.create = asyncHandler(async (req, res) => {
  let { technicianId, requestType, priority, neededBy, requesterNotes, warehouseId, items = [] } = req.body;

  if (req.user.role === 'tecnico') {
    requestType = 'reposicao_carga';
    technicianId = req.user.technicianId;
  }
  if (req.user.role === 'estoquista' && !requestType) requestType = 'recarga_estoque';
  requestType = requestType || 'reposicao_carga';

  if (!Array.isArray(items) || !items.length) return fail(res, 400, 'Inclua ao menos um item solicitado.');

  let technician = null;
  if (!isStockRecharge(requestType)) {
    if (!technicianId) return fail(res, 400, 'Técnico é obrigatório para solicitação de carga técnica.');
    technician = await Technician.findByPk(technicianId);
    if (!technician) return fail(res, 404, 'Técnico não encontrado.');
  }

  try {
    warehouseId = await resolveRequestWarehouse({ req, warehouseId, technicianId, requestType });
  } catch (error) {
    return fail(res, error.statusCode || 400, error.message);
  }

  const warehouse = warehouseId ? await Warehouse.findByPk(warehouseId) : null;

  const request = await sequelize.transaction(async (transaction) => {
    const record = await MaterialRequest.create({
      requestNumber: nextRequestNumber(isStockRecharge(requestType) ? 'REC' : 'REQ'),
      technicianId: isStockRecharge(requestType) ? null : technicianId,
      requestType,
      status: 'pendente_aprovacao',
      priority: priority || 'media',
      neededBy: neededBy || null,
      requesterNotes,
      requestedById: req.user.id,
      warehouseId: warehouseId || null,
      metadata: isStockRecharge(requestType) ? { rechargeForWarehouse: true } : null,
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
      const serialNumbers = Array.isArray(item.serialNumbers)
        ? item.serialNumbers.map((s) => String(s).trim()).filter(Boolean)
        : String(item.serialNumbersText || '').split(/\n|,|;/).map((s) => s.trim()).filter(Boolean);

      if (isStockRecharge(requestType) && material.requiresSerial && serialNumbers.length && serialNumbers.length < Math.ceil(quantity)) {
        throw new Error(`Informe ${Math.ceil(quantity)} serial(is) para ${material.name}, ou deixe os seriais para preenchimento no recebimento.`);
      }

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

    const technicianApprovalLimit = isStockRecharge(requestType)
      ? 0
      : money(technician?.transferApprovalLimit === undefined ? 500 : technician.transferApprovalLimit);
    const requiresApproval = isStockRecharge(requestType) || Number(record.totalValue || 0) > technicianApprovalLimit;

    if (!requiresApproval) {
      record.status = 'aprovado';
      record.approvedAt = new Date();
      record.approvedById = req.user.id;
      record.approvalNotes = `Aprovação automática: valor dentro do limite individual de ${technician.name} (${technicianApprovalLimit.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })}).`;
    }
    record.metadata = {
      ...(record.metadata || {}),
      approvalPolicy: isStockRecharge(requestType) ? 'stock_recharge_admin' : 'technician_transfer_limit',
      technicianApprovalLimit,
      requiresApproval,
      automaticApproval: !requiresApproval,
    };
    await record.save({ transaction });

    const title = isStockRecharge(requestType) ? `Aprovar recarga ${record.requestNumber}` : `${requiresApproval ? 'Aprovar' : 'Liberada automaticamente'} ${record.requestNumber}`;
    const description = isStockRecharge(requestType)
      ? `Solicitação de recarga para o estoque ${warehouse?.name || warehouseId}.`
      : `Solicitação de material para ${technician.name}.`;

    await ApprovalRequest.create({
      workflowCode: isStockRecharge(requestType) ? 'stock_recharge' : 'material_request',
      entityType: 'material_request',
      entityId: String(record.id),
      title,
      description,
      status: requiresApproval ? 'pendente' : 'aprovado',
      priority: record.priority,
      amount: record.totalValue,
      requestedById: req.user.id,
      decidedAt: requiresApproval ? null : new Date(),
      decidedById: requiresApproval ? null : req.user.id,
      decisionNotes: requiresApproval ? null : record.approvalNotes,
      payload: {
        requestId: record.id,
        requestNumber: record.requestNumber,
        requestType,
        technicianId: record.technicianId,
        technicianName: technician?.name,
        warehouseId: warehouseId || null,
        warehouseName: warehouse?.name,
        technicianApprovalLimit,
        requiresApproval,
        automaticApproval: !requiresApproval,
        items: approvalItems,
      },
    }, { transaction });

    await Notification.create({
      role: requiresApproval ? 'admin' : 'estoquista',
      type: requiresApproval ? 'tarefa' : 'estoque',
      severity: requiresApproval ? (record.priority === 'critica' ? 'danger' : 'warning') : 'success',
      title: isStockRecharge(requestType)
        ? `Nova recarga ${record.requestNumber}`
        : (requiresApproval ? `Nova solicitação ${record.requestNumber}` : `Solicitação liberada ${record.requestNumber}`),
      message: isStockRecharge(requestType)
        ? `${req.user.name} solicitou recarga de ${record.totalQuantity} item(ns) para ${warehouse?.name || 'estoque regional'}.`
        : (requiresApproval
          ? `${technician.name} solicitou ${record.totalQuantity} item(ns), no valor de ${Number(record.totalValue || 0).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })}, acima do limite individual de ${technicianApprovalLimit.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })}.`
          : `${record.requestNumber} foi liberada automaticamente para separação. Valor dentro do limite individual de ${technician.name}.`),
      route: requiresApproval ? '/aprovacoes' : '/solicitacoes-material',
      metadata: { requestId: record.id, requestNumber: record.requestNumber, warehouseId, technicianId: record.technicianId, technicianApprovalLimit, totalValue: record.totalValue, requiresApproval },
    }, { transaction });

    await writeAudit({
      req,
      action: isStockRecharge(requestType) ? 'stock_recharge_request' : (requiresApproval ? 'request_pending_approval' : 'request_auto_approved'),
      entity: 'MaterialRequest',
      entityId: record.id,
      message: isStockRecharge(requestType)
        ? `Recarga ${record.requestNumber} aberta para ${warehouse?.name || warehouseId}.`
        : (requiresApproval
          ? `Solicitação ${record.requestNumber} aberta para ${technician.name}; valor acima do limite individual e enviada para aprovação.`
          : `Solicitação ${record.requestNumber} aberta e aprovada automaticamente para ${technician.name}; valor dentro do limite individual.`),
      afterData: { ...record.toJSON(), technicianApprovalLimit, requiresApproval },
      transaction,
    });
    return record;
  });

  const createdRequest = await MaterialRequest.findByPk(request.id, { include: includeFull() });
  const message = isStockRecharge(requestType)
    ? 'Solicitação de recarga enviada para aprovação do admin.'
    : (createdRequest.status === 'aprovado'
      ? 'Solicitação liberada automaticamente dentro do limite individual do técnico.'
      : 'Solicitação enviada para aprovação por exceder o limite individual do técnico.');
  return created(res, createdRequest, message);
});

exports.approve = asyncHandler(async (req, res) => {
  const request = await MaterialRequest.findByPk(req.params.id, { include: includeFull() });
  if (!request) return fail(res, 404, 'Solicitação não encontrada.');
  if (request.status !== 'pendente_aprovacao') return fail(res, 400, 'A solicitação não está pendente de aprovação.');

  if (request.requestType === 'recarga_estoque' && req.user.role !== 'admin') {
    return fail(res, 403, 'Recarga de estoque precisa ser aprovada por administrador.');
  }

  const amount = Number(request.totalValue || 0);
  const technicianLimit = Number(request.metadata?.technicianApprovalLimit || request.Technician?.transferApprovalLimit || 500);
  const requiresAdminApproval = request.requestType === 'recarga_estoque' || request.metadata?.requiresApproval === true || amount > technicianLimit;
  if (requiresAdminApproval && req.user.role !== 'admin') {
    return fail(res, 403, `Esta solicitação soma ${amount.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })} e excede o limite individual do técnico de ${technicianLimit.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })}. A aprovação deve ser realizada por administrador.`);
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
      role: request.requestType === 'recarga_estoque' ? 'estoquista' : 'admin',
      type: 'estoque',
      severity: 'success',
      title: `Solicitação aprovada ${request.requestNumber}`,
      message: request.requestType === 'recarga_estoque' ? 'A recarga foi aprovada e está pronta para recebimento no estoque.' : 'A solicitação foi aprovada e está pronta para separação/entrega ao técnico.',
      route: '/solicitacoes-material',
      metadata: { requestId: request.id, warehouseId: request.warehouseId },
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

async function deliverStockRecharge({ req, request, transaction, deliveryOverrides }) {
  if (!request.warehouseId) throw new Error('A recarga precisa estar vinculada a um estoque regional.');
  if (!['admin', 'supervisor'].includes(req.user.role)) assertWarehouseAccess(req.user, request.warehouseId, 'Você só pode receber recarga nos seus estoques autorizados.');

  let totalQuantity = 0;
  let totalValue = 0;

  for (const requestItem of request.MaterialRequestItems || []) {
    const material = requestItem.Material || await Material.findByPk(requestItem.materialId, { transaction });
    const override = deliveryOverrides.find((item) => Number(item.requestItemId) === Number(requestItem.id));
    const quantity = qty(override?.approvedQuantity ?? requestItem.approvedQuantity ?? requestItem.quantity);
    if (quantity <= 0) continue;
    const unitCost = money(requestItem.unitCost ?? material.unitCost);

    if (material.requiresSerial) {
      const serials = (override?.serialNumbers?.length ? override.serialNumbers : requestItem.serialNumbers || [])
        .map((serial) => String(serial).trim())
        .filter(Boolean);
      if (serials.length < Math.ceil(quantity)) throw new Error(`Informe ${Math.ceil(quantity)} serial(is) para receber ${material.name}.`);
      const deliveredSerials = [];
      for (const serialNumber of serials.slice(0, Math.ceil(quantity))) {
        const existing = await SerializedAsset.findOne({ where: { serialNumber }, transaction });
        if (existing) throw new Error(`Serial ${serialNumber} já existe no sistema.`);
        const asset = await SerializedAsset.create({
          materialId: material.id,
          serialNumber,
          ownerType: 'estoque',
          status: 'em_estoque',
          warehouseId: request.warehouseId,
          acquisitionCost: unitCost,
          lastMovementAt: new Date(),
          notes: `Recebido por recarga ${request.requestNumber}.`,
        }, { transaction });
        await StockMovement.create({
          type: 'entrada_recarga_estoque',
          materialId: material.id,
          assetId: asset.id,
          quantity: 1,
          serialNumber,
          toOwnerType: 'estoque',
          toWarehouseId: request.warehouseId,
          reference: request.requestNumber,
          notes: `Recarga de estoque ${request.requestNumber}.`,
          createdById: req.user.id,
        }, { transaction });
        deliveredSerials.push(serialNumber);
        totalQuantity += 1;
        totalValue += unitCost;
      }
      requestItem.deliverySerials = deliveredSerials;
      await requestItem.save({ transaction });
    } else {
      await adjustBalance({ materialId: material.id, ownerType: 'estoque', warehouseId: request.warehouseId, technicianId: null, delta: quantity, transaction });
      const totalCost = money(quantity * unitCost);
      await StockMovement.create({
        type: 'entrada_recarga_estoque',
        materialId: material.id,
        quantity,
        toOwnerType: 'estoque',
        toWarehouseId: request.warehouseId,
        reference: request.requestNumber,
        notes: `Recarga de estoque ${request.requestNumber}.`,
        createdById: req.user.id,
      }, { transaction });
      totalQuantity += quantity;
      totalValue += totalCost;
    }
  }

  return { totalQuantity, totalValue };
}

exports.deliver = asyncHandler(async (req, res) => {
  const request = await MaterialRequest.findByPk(req.params.id, { include: includeFull() });
  if (!request) return fail(res, 404, 'Solicitação não encontrada.');
  if (request.status !== 'aprovado') return fail(res, 400, 'A solicitação precisa estar aprovada para ser entregue/recebida.');

  const deliveryOverrides = Array.isArray(req.body.items) ? req.body.items : [];

  if (request.requestType === 'recarga_estoque') {
    const before = request.toJSON();
    await sequelize.transaction(async (transaction) => {
      const result = await deliverStockRecharge({ req, request, transaction, deliveryOverrides });
      request.status = 'entregue';
      request.deliveredAt = new Date();
      request.deliveredById = req.user.id;
      request.logisticsNotes = req.body.logisticsNotes || request.logisticsNotes;
      request.totalQuantity = qty(result.totalQuantity || request.totalQuantity);
      request.totalValue = money(result.totalValue || request.totalValue);
      await request.save({ transaction });
      await writeAudit({ req, action: 'stock_recharge_delivered', entity: 'MaterialRequest', entityId: request.id, message: `Recarga ${request.requestNumber} recebida no estoque.`, beforeData: before, afterData: request.toJSON(), transaction });
    });
    return created(res, await MaterialRequest.findByPk(request.id, { include: includeFull() }), 'Recarga recebida no estoque regional.');
  }

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
      stampText: `CARIMBO SUPER INFRA | ${technician.name} | ${request.requestNumber} | ${new Date().toLocaleDateString('pt-BR')} | Assinatura: ______________________________`,
    }, { transaction });

    let totalQuantity = 0;
    let totalValue = 0;

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
          asset.warehouseId = null;
          asset.custodyStartedAt = new Date();
          asset.lastMovementAt = new Date();
          await asset.save({ transaction });
          await StockMovement.create({ type: 'transferencia_tecnico', materialId: material.id, assetId: asset.id, quantity: 1, serialNumber: asset.serialNumber, fromOwnerType: 'estoque', toOwnerType: 'tecnico', fromWarehouseId: request.warehouseId || null, toTechnicianId: request.technicianId, reference: record.transferNumber, notes: `Expedição pela solicitação ${request.requestNumber}.`, createdById: req.user.id }, { transaction });
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
