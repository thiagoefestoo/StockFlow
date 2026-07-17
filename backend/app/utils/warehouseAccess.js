const { Op } = require('sequelize');

function isPrivileged(user) {
  return ['admin', 'supervisor'].includes(user?.role);
}

function normalizeIds(value) {
  if (!Array.isArray(value)) return [];
  return value.map((id) => Number(id)).filter((id) => Number.isFinite(id) && id > 0);
}

function userWarehouseIds(user) {
  return normalizeIds(user?.warehouseIds);
}

function userCities(user) {
  return Array.isArray(user?.cityAccess) ? user.cityAccess.map((city) => String(city).trim()).filter(Boolean) : [];
}

function warehouseListWhere(user) {
  if (isPrivileged(user)) return {};
  const ids = userWarehouseIds(user);
  if (ids.length) return { id: { [Op.in]: ids } };
  const cities = userCities(user);
  if (cities.length) return { city: { [Op.in]: cities } };
  return { id: -1 };
}

function warehouseIdAllowed(user, warehouseId) {
  const id = Number(warehouseId);
  if (!Number.isFinite(id) || id <= 0) return false;
  if (isPrivileged(user)) return true;
  return userWarehouseIds(user).includes(id);
}

function assertWarehouseAccess(user, warehouseId, message = 'Você não tem acesso a este estoque.') {
  if (!warehouseIdAllowed(user, warehouseId)) {
    const error = new Error(message);
    error.statusCode = 403;
    throw error;
  }
}

function stockWhereForUser(user, requestedWarehouseId = null, field = 'warehouseId') {
  const requested = Number(requestedWarehouseId || 0);
  if (requested > 0) {
    if (isPrivileged(user) || userWarehouseIds(user).includes(requested)) return { [field]: requested };
    return { [field]: -1 };
  }
  if (isPrivileged(user)) return {};
  const ids = userWarehouseIds(user);
  if (ids.length) return { [field]: { [Op.in]: ids } };
  return { [field]: -1 };
}

function movementWhereForUser(user, requestedWarehouseId = null) {
  const requested = Number(requestedWarehouseId || 0);
  if (requested > 0) {
    if (isPrivileged(user) || userWarehouseIds(user).includes(requested)) {
      return { [Op.or]: [{ fromWarehouseId: requested }, { toWarehouseId: requested }] };
    }
    return { fromWarehouseId: -1 };
  }
  if (isPrivileged(user)) return null;
  const ids = userWarehouseIds(user);
  if (!ids.length) return { fromWarehouseId: -1 };
  return { [Op.or]: [{ fromWarehouseId: { [Op.in]: ids } }, { toWarehouseId: { [Op.in]: ids } }] };
}

module.exports = {
  isPrivileged,
  userWarehouseIds,
  userCities,
  warehouseListWhere,
  warehouseIdAllowed,
  assertWarehouseAccess,
  stockWhereForUser,
  movementWhereForUser,
};
