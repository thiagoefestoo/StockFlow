const { Op } = require('sequelize');
const { Technician } = require('../models');
const { userWarehouseIds, userCities } = require('../utils/warehouseAccess');

function uniquePositiveIds(values = []) {
  return [...new Set((Array.isArray(values) ? values : [])
    .map(Number)
    .filter((value) => Number.isFinite(value) && value > 0))];
}

function normalizeCityKey(value) {
  return String(value || '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .trim()
    .toLowerCase();
}

function uniqueCities(values = []) {
  const result = [];
  const seen = new Set();
  for (const value of Array.isArray(values) ? values : []) {
    const city = String(value || '').trim();
    const key = normalizeCityKey(city);
    if (!key || seen.has(key)) continue;
    seen.add(key);
    result.push(city);
  }
  return result;
}

async function resolveOperationalScope(user) {
  if (user?.role === 'admin') {
    return {
      unrestricted: true,
      warehouseIds: [],
      technicianIds: [],
      cities: uniqueCities(userCities(user)),
      cityKeys: new Set(uniqueCities(userCities(user)).map(normalizeCityKey)),
    };
  }

  const warehouseIds = uniquePositiveIds(userWarehouseIds(user));
  const ownTechnicianId = Number(user?.technicianId || 0);
  let technicianIds = ownTechnicianId > 0 ? [ownTechnicianId] : [];

  if (warehouseIds.length) {
    const technicians = await Technician.findAll({
      where: { defaultWarehouseId: { [Op.in]: warehouseIds } },
      attributes: ['id'],
      raw: true,
    }).catch(() => []);
    technicianIds = uniquePositiveIds([
      ...technicianIds,
      ...technicians.map((row) => row.id),
    ]);
  }

  const cities = uniqueCities(userCities(user));

  return {
    unrestricted: false,
    warehouseIds,
    technicianIds,
    cities,
    cityKeys: new Set(cities.map(normalizeCityKey)),
  };
}

function emptyScopeWhere(field = 'id') {
  return { [field]: -1 };
}

function warehouseScopeWhere(scope, field = 'warehouseId') {
  if (scope?.unrestricted) return {};
  if (!scope?.warehouseIds?.length) return emptyScopeWhere(field);
  return { [field]: { [Op.in]: scope.warehouseIds } };
}

function technicianScopeWhere(scope, field = 'technicianId') {
  if (scope?.unrestricted) return {};
  if (!scope?.technicianIds?.length) return emptyScopeWhere(field);
  return { [field]: { [Op.in]: scope.technicianIds } };
}

function requestScopeWhere(scope) {
  if (scope?.unrestricted) return {};
  const conditions = [];
  if (scope?.warehouseIds?.length) conditions.push({ warehouseId: { [Op.in]: scope.warehouseIds } });
  if (scope?.technicianIds?.length) conditions.push({ technicianId: { [Op.in]: scope.technicianIds } });
  return conditions.length ? { [Op.or]: conditions } : { id: -1 };
}

function transferScopeWhere(scope) {
  if (scope?.unrestricted) return {};
  const conditions = [];
  if (scope?.warehouseIds?.length) conditions.push({ warehouseId: { [Op.in]: scope.warehouseIds } });
  if (scope?.technicianIds?.length) {
    conditions.push({ technicianId: { [Op.in]: scope.technicianIds } });
    conditions.push({ fromTechnicianId: { [Op.in]: scope.technicianIds } });
  }
  return conditions.length ? { [Op.or]: conditions } : { id: -1 };
}

function serviceOrderScopeWhere(scope) {
  if (scope?.unrestricted) return {};
  const conditions = [];
  if (scope?.warehouseIds?.length) conditions.push({ warehouseId: { [Op.in]: scope.warehouseIds } });
  if (scope?.technicianIds?.length) conditions.push({ technicianId: { [Op.in]: scope.technicianIds } });
  for (const city of scope?.cities || []) conditions.push({ city: { [Op.iLike]: city } });
  return conditions.length ? { [Op.or]: conditions } : { id: -1 };
}

function intersects(left = [], right = []) {
  const rightSet = right instanceof Set ? right : new Set(right);
  return left.some((value) => rightSet.has(value));
}

module.exports = {
  uniquePositiveIds,
  normalizeCityKey,
  uniqueCities,
  resolveOperationalScope,
  warehouseScopeWhere,
  technicianScopeWhere,
  requestScopeWhere,
  transferScopeWhere,
  serviceOrderScopeWhere,
  intersects,
};
