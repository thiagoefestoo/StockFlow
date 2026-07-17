const { ApprovalRequest, User, MaterialRequest, MaterialRequestItem, Material, SerializedAsset, Technician, Warehouse } = require('../models');
const asyncHandler = require('../utils/asyncHandler');
const { ok, fail } = require('../utils/response');
const { executeWarehouseTransferPlan } = require('../services/warehouseTransferService');
const { writeAudit } = require('../services/auditService');

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

  if (approval.entityType === 'warehouse_transfer') {
    try {
      await executeWarehouseTransferPlan(approval.payload, { req, approvalId: approval.id });
    } catch (error) {
      return fail(res, 409, `Não foi possível executar a transferência: ${error.message}`);
    }
  } else {
    return fail(res, 400, 'Este tipo de aprovação deve ser decidido pelo fluxo original.');
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
  const approval = await ApprovalRequest.findByPk(req.params.id);
  if (!approval) return fail(res, 404, 'Aprovação não encontrada.');
  if (approval.status !== 'pendente') return fail(res, 409, 'Esta aprovação já foi decidida.');

  approval.status = 'reprovado';
  approval.decidedAt = new Date();
  approval.decidedById = req.user.id;
  approval.decisionNotes = req.body?.notes || req.body?.approvalNotes || 'Reprovado pelo administrador.';
  await approval.save();

  await writeAudit({
    req,
    action: 'approval_rejected',
    entity: 'ApprovalRequest',
    entityId: approval.id,
    message: `Aprovação ${approval.workflowCode} reprovada.`,
    afterData: approval.toJSON(),
  });

  return ok(res, await enrichApproval(approval), 'Aprovação reprovada.');
});
