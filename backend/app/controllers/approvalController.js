const { ApprovalRequest, User, MaterialRequest, MaterialRequestItem, Material, SerializedAsset, Technician, Warehouse } = require('../models');
const asyncHandler = require('../utils/asyncHandler');
const { ok, fail } = require('../utils/response');

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
