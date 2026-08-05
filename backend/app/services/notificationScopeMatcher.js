function plain(notification) {
  return notification?.get ? notification.get({ plain: true }) : (notification || {});
}

function notificationRoleVisible(notification, user) {
  const row = plain(notification);
  const targetUserId = Number(row.userId || 0);
  if (targetUserId > 0) return targetUserId === Number(user?.id || 0);
  if (row.role === 'todos' || row.role === user?.role) return true;
  return user?.role === 'admin' && row.role === 'supervisor';
}

function intersects(left = [], right = []) {
  const rightSet = right instanceof Set ? right : new Set(right);
  return left.some((value) => rightSet.has(value));
}

function notificationMatchesResolvedScope(notification, user, scope, refs) {
  const row = plain(notification);
  if (!notificationRoleVisible(row, user)) return false;
  if (scope?.unrestricted) return true;
  if (Number(row.userId || 0) === Number(user?.id || 0)) return true;

  const hasOperationalReference = refs.warehouseIds.length || refs.technicianIds.length || refs.cities.length;
  if (!hasOperationalReference) return true;

  if (user?.role === 'tecnico') {
    const ownTechnicianId = Number(user?.technicianId || 0);
    if (refs.technicianIds.length) return ownTechnicianId > 0 && refs.technicianIds.includes(ownTechnicianId);
    if (refs.warehouseIds.length) return intersects(refs.warehouseIds, scope.warehouseIds || []);
    return intersects(refs.cities, scope.cityKeys || new Set());
  }

  return intersects(refs.warehouseIds, scope?.warehouseIds || [])
    || intersects(refs.technicianIds, scope?.technicianIds || [])
    || intersects(refs.cities, scope?.cityKeys || new Set());
}

module.exports = {
  plain,
  notificationRoleVisible,
  notificationMatchesResolvedScope,
};
