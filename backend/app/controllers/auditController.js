const { Op } = require('sequelize');
const { AuditLog, User } = require('../models');
const asyncHandler = require('../utils/asyncHandler');
const { ok } = require('../utils/response');

exports.list = asyncHandler(async (req, res) => {
  const where = {};
  if (req.query.action) where.action = req.query.action;
  if (req.query.entity) where.entity = req.query.entity;
  if (req.query.search) {
    const q = `%${req.query.search}%`;
    where[Op.or] = [
      { message: { [Op.iLike]: q } },
      { entity: { [Op.iLike]: q } },
      { entityId: { [Op.iLike]: q } },
      { action: { [Op.iLike]: q } },
    ];
  }
  const limit = Math.min(Number(req.query.limit || 1200), 3000);
  const logs = await AuditLog.findAll({
    include: [{ model: User, as: 'actor', attributes: ['id', 'name', 'email', 'role'] }],
    where,
    order: [['createdAt', 'DESC']],
    limit,
  });
  return ok(res, logs);
});
