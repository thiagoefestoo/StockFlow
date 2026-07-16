const { Op } = require('sequelize');
const { Notification } = require('../models');
const asyncHandler = require('../utils/asyncHandler');
const { ok, fail } = require('../utils/response');
const { generateSmartNotifications } = require('../services/intelligenceService');

function visibilityWhere(user) {
  return {
    [Op.or]: [
      { userId: user.id },
      { userId: null, role: 'todos' },
      { userId: null, role: user.role },
      ...(user.role === 'admin' ? [{ userId: null, role: 'supervisor' }] : []),
    ],
  };
}

exports.list = asyncHandler(async (req, res) => {
  const notifications = await Notification.findAll({ where: { ...visibilityWhere(req.user), status: { [Op.ne]: 'arquivada' } }, order: [['createdAt', 'DESC']], limit: 100 });
  const unread = notifications.filter((n) => n.status === 'nao_lida').length;
  return ok(res, { unread, notifications });
});

exports.markRead = asyncHandler(async (req, res) => {
  const notification = await Notification.findByPk(req.params.id);
  if (!notification) return fail(res, 404, 'Notificação não encontrada.');
  notification.status = 'lida';
  await notification.save();
  return ok(res, notification, 'Notificação marcada como lida.');
});

exports.generate = asyncHandler(async (req, res) => {
  const created = await generateSmartNotifications();
  return ok(res, { created: created.length }, 'Inteligência executada.');
});
