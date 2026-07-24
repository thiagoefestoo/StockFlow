const sequelize = require('../../config/db');
const { ApprovalRequest, User, MaterialRequest, MaterialRequestItem, Material, SerializedAsset, Technician, Warehouse, StockBalance, StockMovement, StockBatch, StockBatchItem, Transfer, ServiceOrder } = require('../models');
const asyncHandler = require('../utils/asyncHandler');
const { ok, fail } = require('../utils/response');
const { executeWarehouseTransferPlan } = require('../services/warehouseTransferService');
const { writeAudit } = require('../services/auditService');
const { approveMaterialRequest, validateApprover } = require('../services/materialRequestApprovalService');

const { Op } = require('sequelize');

async function warehouseInventorySnapshot(warehouseId, options = {}) {
  const transaction = options.transaction || null;
  const [balances, assets] = await Promise.all([
    StockBalance.findAll({ where: { warehouseId, ownerType: 'estoque' }, include: [Material], transaction }),
    SerializedAsset.findAll({ where: { warehouseId, ownerType: 'estoque' }, include: [Material], transaction }),
  ]);
  const positiveBalances = balances.filter((balance) => Number(balance.quantity || 0) > 0);
  return {
    hasItems: positiveBalances.length > 0 || assets.length > 0,
    consumableLines: positiveBalances.length,
    assetCount: assets.length,
    balances: positiveBalances.map((balance) => ({ material: balance.Material?.name || 'Material', quantity: balance.quantity, unit: balance.Material?.unit || '' })),
    assets: assets.map((asset) => ({ material: asset.Material?.name || 'Equipamento', serialNumber: asset.serialNumber, status: asset.status })),
  };
}

async function executeWarehouseDelete(payload, { req, approvalId }) {
  const warehouseId = Number(payload?.warehouseId || payload?.warehouse?.id);
  if (!warehouseId) throw new Error('Estoque inválido para exclusão.');

  const result = await Warehouse.sequelize.transaction(async (transaction) => {
    const warehouse = await Warehouse.findByPk(warehouseId, { transaction });
    if (!warehouse) throw new Error('Estoque não encontrado ou já excluído.');

    const inventory = await warehouseInventorySnapshot(warehouse.id, { transaction });
    if (inventory.hasItems) {
      throw new Error('O estoque recebeu materiais/equipamentos depois da solicitação. Transfira todos os itens para outro estoque antes de aprovar a exclusão.');
    }

    await StockBalance.destroy({ where: { warehouseId: warehouse.id, ownerType: 'estoque', quantity: { [Op.lte]: 0 } }, transaction });

    const users = await User.findAll({ transaction });
    for (const user of users) {
      const ids = Array.isArray(user.warehouseIds) ? user.warehouseIds.map(Number) : [];
      if (ids.includes(Number(warehouse.id))) {
        user.warehouseIds = ids.filter((id) => id !== Number(warehouse.id));
        await user.save({ transaction });
      }
    }

    await Technician.update({ defaultWarehouseId: null }, { where: { defaultWarehouseId: warehouse.id }, transaction });

    await StockMovement.update({ fromWarehouseId: null }, { where: { fromWarehouseId: warehouse.id }, transaction });
    await StockMovement.update({ toWarehouseId: null }, { where: { toWarehouseId: warehouse.id }, transaction });
    await StockBatch.update({ warehouseId: null }, { where: { warehouseId: warehouse.id }, transaction });
    await StockBatchItem.update({ warehouseId: null }, { where: { warehouseId: warehouse.id }, transaction });
    await Transfer.update({ warehouseId: null }, { where: { warehouseId: warehouse.id }, transaction });
    await ServiceOrder.update({ warehouseId: null }, { where: { warehouseId: warehouse.id }, transaction });
    await MaterialRequest.update({ warehouseId: null }, { where: { warehouseId: warehouse.id }, transaction });

    const before = warehouse.get({ plain: true });
    await warehouse.destroy({ transaction });

    await writeAudit({
      req,
      action: 'warehouse_delete_approved',
      entity: 'Warehouse',
      entityId: before.id,
      message: `Estoque ${before.name} excluído após aprovação${approvalId ? ` #${approvalId}` : ''}.`,
      beforeData: before,
      afterData: { deleted: true, approvalId, deletedAt: new Date().toISOString() },
      transaction,
    });

    return before;
  });

  return result;
}

async function enrichApproval(approval) {
  const raw = approval?.get ? approval.get({ plain: true }) : approval;
  if (!raw) return null;
  if (raw.entityType === 'material_request' && raw.entityId) {
    const request = await MaterialRequest.findByPk(raw.entityId, {
      include: [
        Technician,
        Warehouse,
        { model: MaterialRequestItem, include: [Material, SerializedAsset] },
      ],
    });
    if (request) {
      raw.requestDetails = request.get({ plain: true });
      raw.operationalSummary = {
        requestNumber: request.requestNumber,
        technicianName: request.Technician?.name,
        warehouseName: request.Warehouse?.name,
        totalQuantity: request.totalQuantity,
        totalValue: request.totalValue,
        items: (request.MaterialRequestItems || []).map((item) => ({
          material: item.Material?.name || 'Material',
          category: item.Material?.category,
          quantity: item.quantity,
          approvedQuantity: item.approvedQuantity,
          unitCost: item.unitCost,
          totalCost: item.totalCost,
          serialNumbers: item.serialNumbers || [],
          notes: item.notes,
        })),
      };
    }
  }

  if (raw.entityType === 'warehouse_transfer' && raw.payload) {
    const payload = raw.payload || {};
    raw.operationalSummary = {
      requestNumber: payload.reference || raw.workflowCode,
      warehouseName: `${payload.fromWarehouse?.name || payload.fromWarehouseId || '-'} → ${payload.toWarehouse?.name || payload.toWarehouseId || '-'}`,
      fromWarehouseName: payload.fromWarehouse?.name,
      toWarehouseName: payload.toWarehouse?.name,
      totalQuantity: payload.totalQuantity,
      totalValue: payload.totalValue,
      requestedByName: payload.requestedByName,
      items: (payload.items || []).map((item) => ({
        material: item.materialName || item.material || 'Material',
        category: item.category,
        quantity: item.quantity,
        unitCost: item.unitCost,
        totalCost: item.totalCost,
        serialNumbers: item.serialNumbers || [],
        notes: item.requiresSerial ? 'Equipamento serializado' : 'Material consumível',
      })),
    };
  }


  if (raw.entityType === 'warehouse_delete' && raw.payload) {
    const payload = raw.payload || {};
    const inventory = payload.inventory || {};
    raw.operationalSummary = {
      requestNumber: raw.workflowCode,
      warehouseName: payload.warehouse?.name || '-',
      fromWarehouseName: payload.warehouse?.name || '-',
      toWarehouseName: 'Exclusão definitiva após aprovação',
      totalQuantity: Number(inventory.assetCount || 0) + Number(inventory.consumableLines || 0),
      totalValue: 0,
      requestedByName: payload.requestedByName,
      items: [{
        material: payload.warehouse?.name || 'Estoque',
        category: 'Exclusão de estoque vazio',
        quantity: inventory.hasItems ? 'Possui itens' : 'Vazio',
        unitCost: 0,
        totalCost: 0,
        serialNumbers: [],
        notes: inventory.hasItems ? 'Bloqueado: transfira os itens antes de excluir.' : 'Estoque conferido como vazio na solicitação. Será revalidado na aprovação.',
      }],
    };
  }
  return raw;
}

exports.list = asyncHandler(async (req, res) => {
  const where = {};
  if (req.query.status) where.status = req.query.status;
  if (req.query.entityType) where.entityType = req.query.entityType;
  const approvals = await ApprovalRequest.findAll({
    where,
    include: [
      { model: User, as: 'requestedBy', attributes: ['id', 'name', 'email', 'role'] },
      { model: User, as: 'decidedBy', attributes: ['id', 'name', 'email', 'role'] },
    ],
    order: [['requestedAt', 'DESC']],
    limit: 500,
  });
  return ok(res, await Promise.all(approvals.map(enrichApproval)));
});

exports.get = asyncHandler(async (req, res) => {
  const approval = await ApprovalRequest.findByPk(req.params.id, {
    include: [
      { model: User, as: 'requestedBy', attributes: ['id', 'name', 'email', 'role'] },
      { model: User, as: 'decidedBy', attributes: ['id', 'name', 'email', 'role'] },
    ],
  });
  if (!approval) return fail(res, 404, 'Aprovação não encontrada.');
  return ok(res, await enrichApproval(approval));
});


exports.approve = asyncHandler(async (req, res) => {
  const approval = await ApprovalRequest.findByPk(req.params.id);
  if (!approval) return fail(res, 404, 'Aprovação não encontrada.');
  if (approval.status !== 'pendente') return fail(res, 409, 'Esta aprovação já foi decidida.');

  if (approval.entityType === 'material_request') {
    try {
      const request = await approveMaterialRequest({
        requestId: approval.entityId,
        req,
        notes: req.body?.notes || req.body?.approvalNotes,
      });
      const refreshed = await ApprovalRequest.findByPk(approval.id);
      return ok(res, { approval: await enrichApproval(refreshed), request }, 'Solicitação aprovada com sucesso.');
    } catch (error) {
      return fail(res, error.statusCode || 500, error.message || 'Não foi possível aprovar a solicitação.');
    }
  }

  if (req.user.role !== 'admin') {
    return fail(res, 403, 'Somente administrador pode executar este tipo de aprovação.');
  }

  if (approval.entityType === 'warehouse_transfer') {
    try {
      await executeWarehouseTransferPlan(approval.payload, { req, approvalId: approval.id });
    } catch (error) {
      return fail(res, 409, `Não foi possível executar a transferência: ${error.message}`);
    }
  } else if (approval.entityType === 'warehouse_delete') {
    try {
      await executeWarehouseDelete(approval.payload, { req, approvalId: approval.id });
    } catch (error) {
      return fail(res, 409, `Não foi possível excluir o estoque: ${error.message}`);
    }
  } else {
    return fail(res, 400, 'Tipo de aprovação não suportado.');
  }

  approval.status = 'aprovado';
  approval.decidedAt = new Date();
  approval.decidedById = req.user.id;
  approval.decisionNotes = req.body?.notes || req.body?.approvalNotes || 'Aprovado pelo administrador.';
  await approval.save();

  await writeAudit({
    req,
    action: 'approval_approved',
    entity: 'ApprovalRequest',
    entityId: approval.id,
    message: `Aprovação ${approval.workflowCode} aprovada e executada.`,
    afterData: approval.toJSON(),
  });

  return ok(res, await enrichApproval(approval), 'Aprovação executada com sucesso.');
});

exports.reject = asyncHandler(async (req, res) => {
  const result = await sequelize.transaction(async (transaction) => {
    const approval = await ApprovalRequest.findByPk(req.params.id, {
      transaction,
      lock: transaction.LOCK.UPDATE,
    });
    if (!approval) {
      const error = new Error('Aprovação não encontrada.');
      error.statusCode = 404;
      throw error;
    }
    if (approval.status !== 'pendente') {
      const error = new Error('Esta aprovação já foi decidida.');
      error.statusCode = 409;
      throw error;
    }

    let request = null;
    if (approval.entityType === 'material_request') {
      request = await MaterialRequest.findByPk(approval.entityId, {
        transaction,
        lock: transaction.LOCK.UPDATE,
      });
      if (!request) {
        const error = new Error('Solicitação vinculada não encontrada.');
        error.statusCode = 404;
        throw error;
      }
      if (request.technicianId) {
        request.Technician = await Technician.findByPk(request.technicianId, { transaction });
      }
      validateApprover({ user: req.user, request });
    } else if (req.user.role !== 'admin') {
      const error = new Error('Somente administrador pode rejeitar este tipo de aprovação.');
      error.statusCode = 403;
      throw error;
    }

    const notes = req.body?.notes || req.body?.approvalNotes || 'Reprovado.';
    const decidedAt = new Date();
    approval.status = 'reprovado';
    approval.decidedAt = decidedAt;
    approval.decidedById = req.user.id;
    approval.decisionNotes = notes;
    await approval.save({ transaction });

    if (request) {
      request.status = 'reprovado';
      request.approvedAt = decidedAt;
      request.approvedById = req.user.id;
      request.approvalNotes = notes;
      await request.save({ transaction });
      await writeAudit({
        req,
        action: 'reject',
        entity: 'MaterialRequest',
        entityId: request.id,
        message: `Solicitação ${request.requestNumber} reprovada por ${req.user.name}.`,
        afterData: request.toJSON(),
        transaction,
      });
    }

    await writeAudit({
      req,
      action: 'approval_rejected',
      entity: 'ApprovalRequest',
      entityId: approval.id,
      message: `Aprovação ${approval.workflowCode} reprovada.`,
      afterData: approval.toJSON(),
      transaction,
    });

    return approval.id;
  });

  const approval = await ApprovalRequest.findByPk(result);
  return ok(res, await enrichApproval(approval), 'Aprovação reprovada.');
});
