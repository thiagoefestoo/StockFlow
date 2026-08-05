const { Notification } = require('../models');
const asyncHandler = require('../utils/asyncHandler');
const { ok, fail } = require('../utils/response');
const { generateSmartNotifications } = require('../services/intelligenceService');
const {
  filterNotificationsForUser,
  findVisibleNotifications,
} = require('../services/notificationScopeService');

exports.list = asyncHandler(async (req, res) => {
  const visible = await findVisibleNotifications(req.user, { excludeArchived: true });
  const unread = visible.filter((row) => row.status === 'nao_lida').length;

  if (String(req.query.summaryOnly || '').toLowerCase() === 'true') {
    return ok(res, { unread, notifications: [] });
  }

  const limit = Math.min(Math.max(Number(req.query.limit || 20), 1), 50);
  const notifications = visible.slice(0, limit).map((row) => {
    const value = row.get ? row.get({ plain: true }) : row;
    const { userId, role, metadata, ...safe } = value;
    return safe;
  });

  return ok(res, { unread, notifications });
});

exports.markRead = asyncHandler(async (req, res) => {
  const notification = await Notification.findByPk(req.params.id);
  if (!notification) return fail(res, 404, 'Notificação não encontrada.');

  const visible = await filterNotificationsForUser([notification], req.user);
  if (!visible.length) return fail(res, 404, 'Notificação não encontrada para o seu acesso.');

  notification.status = 'lida';
  await notification.save();
  return ok(res, notification, 'Notificação marcada como lida.');
});

exports.generate = asyncHandler(async (req, res) => {
  const created = await generateSmartNotifications();
  return ok(res, { created: created.length }, 'Inteligência executada.');
});
