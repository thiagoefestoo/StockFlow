const { Op } = require('sequelize');
const { AuditLog, User } = require('../models');
const asyncHandler = require('../utils/asyncHandler');
const { ok, okPaginated } = require('../utils/response');
const { paginationFromQuery, paginationMeta } = require('../utils/pagination');

exports.list = asyncHandler(async (req, res) => {
  const where = { action: { [Op.notIn]: ['reverse_logistics_entry', 'reverse_logistics_exit'] } };
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
  const pagination = paginationFromQuery(req.query);
  const limit = pagination.enabled ? pagination.limit : Math.min(Number(req.query.limit || 1200), 3000);
  const [logs, total] = await Promise.all([
    AuditLog.findAll({
      attributes: { exclude: ['beforeData', 'afterData'] },
      include: [{ model: User, as: 'actor', attributes: ['id', 'name', 'email', 'role'] }],
      where,
      order: [['createdAt', 'DESC'], ['id', 'DESC']],
      limit,
      ...(pagination.enabled ? { offset: pagination.offset } : {}),
    }),
    pagination.enabled ? AuditLog.count({ where }) : Promise.resolve(0),
  ]);
  return pagination.enabled
    ? okPaginated(res, logs, paginationMeta(total, pagination.page, pagination.pageSize))
    : ok(res, logs);
});

exports.get = asyncHandler(async (req, res) => {
  const log = await AuditLog.findByPk(req.params.id, {
    include: [{ model: User, as: 'actor', attributes: ['id', 'name', 'email', 'role'] }],
  });
  if (!log || ['reverse_logistics_entry', 'reverse_logistics_exit'].includes(log.action)) return res.status(404).json({ success: false, message: 'Evento de auditoria não encontrado.' });
  return ok(res, log);
});
