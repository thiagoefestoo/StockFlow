const { ApprovalRequest, User } = require('../models');
const asyncHandler = require('../utils/asyncHandler');
const { ok, fail } = require('../utils/response');

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
  return ok(res, approvals);
});

exports.get = asyncHandler(async (req, res) => {
  const approval = await ApprovalRequest.findByPk(req.params.id, {
    include: [
      { model: User, as: 'requestedBy', attributes: ['id', 'name', 'email', 'role'] },
      { model: User, as: 'decidedBy', attributes: ['id', 'name', 'email', 'role'] },
    ],
  });
  if (!approval) return fail(res, 404, 'Aprovação não encontrada.');
  return ok(res, approval);
});
