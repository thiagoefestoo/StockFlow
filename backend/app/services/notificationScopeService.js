const { Op } = require('sequelize');
const {
  Notification,
  MaterialRequest,
  Transfer,
  SerializedAsset,
  ServiceOrder,
} = require('../models');
const {
  uniquePositiveIds,
  normalizeCityKey,
  resolveOperationalScope,
} = require('./operationalScopeService');
const {
  plain,
  notificationRoleVisible,
  notificationMatchesResolvedScope,
} = require('./notificationScopeMatcher');

function metadataIds(metadata, singularKeys, arrayKeys) {
  const ids = [];
  for (const key of singularKeys) ids.push(metadata?.[key]);
  for (const key of arrayKeys) {
    const value = metadata?.[key];
    if (Array.isArray(value)) ids.push(...value);
  }
  return uniquePositiveIds(ids);
}

function directReferences(notification) {
  const row = plain(notification);
  const metadata = row.metadata || {};
  const cities = [metadata.city, metadata.warehouseCity, metadata.sourceCity, metadata.targetCity]
    .map(normalizeCityKey)
    .filter(Boolean);

  return {
    warehouseIds: metadataIds(
      metadata,
      ['warehouseId', 'fromWarehouseId', 'toWarehouseId', 'sourceWarehouseId', 'targetWarehouseId'],
      ['warehouseIds']
    ),
    technicianIds: metadataIds(
      metadata,
      ['technicianId', 'fromTechnicianId', 'toTechnicianId'],
      ['technicianIds']
    ),
    cities: [...new Set(cities)],
    requestId: Number(metadata.requestId || 0),
    transferId: Number(metadata.transferId || 0),
    assetId: Number(metadata.assetId || 0),
    serviceOrderId: Number(metadata.serviceOrderId || metadata.orderId || 0),
  };
}

function addId(target, value) {
  const id = Number(value || 0);
  if (Number.isFinite(id) && id > 0) target.add(id);
}

function mergeEntityReferences(refs, entity) {
  if (!entity) return;
  addId(refs.warehouseIds, entity.warehouseId);
  addId(refs.technicianIds, entity.technicianId);
  addId(refs.technicianIds, entity.fromTechnicianId);
  const cityKey = normalizeCityKey(entity.city);
  if (cityKey) refs.cities.add(cityKey);
}

async function hydrateReferenceMaps(notifications = []) {
  const direct = notifications.map(directReferences);
  const requestIds = uniquePositiveIds(direct.map((item) => item.requestId));
  const transferIds = uniquePositiveIds(direct.map((item) => item.transferId));
  const assetIds = uniquePositiveIds(direct.map((item) => item.assetId));
  const serviceOrderIds = uniquePositiveIds(direct.map((item) => item.serviceOrderId));

  const [requests, transfers, assets, serviceOrders] = await Promise.all([
    requestIds.length
      ? MaterialRequest.findAll({ where: { id: { [Op.in]: requestIds } }, attributes: ['id', 'warehouseId', 'technicianId'], raw: true })
      : [],
    transferIds.length
      ? Transfer.findAll({ where: { id: { [Op.in]: transferIds } }, attributes: ['id', 'warehouseId', 'technicianId', 'fromTechnicianId'], raw: true })
      : [],
    assetIds.length
      ? SerializedAsset.findAll({ where: { id: { [Op.in]: assetIds } }, attributes: ['id', 'warehouseId', 'technicianId'], raw: true })
      : [],
    serviceOrderIds.length
      ? ServiceOrder.findAll({ where: { id: { [Op.in]: serviceOrderIds } }, attributes: ['id', 'warehouseId', 'technicianId', 'city'], raw: true })
      : [],
  ]);

  return {
    requests: new Map(requests.map((row) => [Number(row.id), row])),
    transfers: new Map(transfers.map((row) => [Number(row.id), row])),
    assets: new Map(assets.map((row) => [Number(row.id), row])),
    serviceOrders: new Map(serviceOrders.map((row) => [Number(row.id), row])),
  };
}

function resolvedReferences(notification, maps) {
  const direct = directReferences(notification);
  const refs = {
    warehouseIds: new Set(direct.warehouseIds),
    technicianIds: new Set(direct.technicianIds),
    cities: new Set(direct.cities),
  };

  mergeEntityReferences(refs, maps.requests.get(direct.requestId));
  mergeEntityReferences(refs, maps.transfers.get(direct.transferId));
  mergeEntityReferences(refs, maps.assets.get(direct.assetId));
  mergeEntityReferences(refs, maps.serviceOrders.get(direct.serviceOrderId));

  return {
    warehouseIds: [...refs.warehouseIds],
    technicianIds: [...refs.technicianIds],
    cities: [...refs.cities],
  };
}

async function filterNotificationsForUser(notifications = [], user, resolvedScope = null) {
  const roleVisible = notifications.filter((row) => notificationRoleVisible(row, user));
  if (!roleVisible.length) return [];
  const scope = resolvedScope || await resolveOperationalScope(user);
  if (scope.unrestricted) return roleVisible;
  const maps = await hydrateReferenceMaps(roleVisible);
  return roleVisible.filter((row) => notificationMatchesResolvedScope(row, user, scope, resolvedReferences(row, maps)));
}

async function findVisibleNotifications(user, { status = null, excludeArchived = false, order = [['createdAt', 'DESC'], ['id', 'DESC']] } = {}) {
  const where = {
    [Op.or]: [
      { userId: user.id },
      { userId: null, role: 'todos' },
      { userId: null, role: user.role },
      ...(user.role === 'admin' ? [{ userId: null, role: 'supervisor' }] : []),
    ],
  };
  if (status) where.status = status;
  else if (excludeArchived) where.status = { [Op.ne]: 'arquivada' };

  const candidates = await Notification.findAll({
    where,
    attributes: ['id', 'userId', 'role', 'type', 'severity', 'title', 'message', 'status', 'route', 'metadata', 'createdAt'],
    order,
  });
  return filterNotificationsForUser(candidates, user);
}

async function countVisibleUnreadNotifications(user) {
  const rows = await findVisibleNotifications(user, { status: 'nao_lida' });
  return rows.length;
}

module.exports = {
  notificationRoleVisible,
  directReferences,
  notificationMatchesResolvedScope,
  filterNotificationsForUser,
  findVisibleNotifications,
  countVisibleUnreadNotifications,
};
