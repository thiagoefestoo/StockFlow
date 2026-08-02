const jwt = require('jsonwebtoken');
const env = require('../../config/env');
const { User, Technician, Warehouse } = require('../models');
const { normalizeModulePermissions, hasModuleAccess } = require('../config/modulePermissions');

function normalizeIds(value) {
  if (!Array.isArray(value)) return [];
  return value.map(Number).filter((id) => Number.isFinite(id) && id > 0);
}

function normalizeCities(value) {
  if (!Array.isArray(value)) return [];
  return value.map((city) => String(city || '').trim()).filter(Boolean);
}

function normalizeCityKey(value) {
  return String(value || '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .trim()
    .toLowerCase();
}

async function effectiveWarehouseIds(user) {
  const explicitIds = normalizeIds(user?.warehouseIds);
  const technicianWarehouseId = Number(user?.Technician?.defaultWarehouseId || 0);
  const linkedIds = technicianWarehouseId > 0
    ? [...new Set([...explicitIds, technicianWarehouseId])]
    : explicitIds;

  if (user?.role === 'admin') return linkedIds;

  const cities = normalizeCities(user?.cityAccess);
  if (!cities.length) return linkedIds;

  // Resolve as cidades em memória para aceitar diferenças de maiúsculas,
  // espaços e acentuação, como "Sao Pedro" e "São Pedro".
  const allowedCityKeys = new Set(cities.map(normalizeCityKey).filter(Boolean));
  const warehouses = await Warehouse.findAll({ attributes: ['id', 'city'] });
  const cityWarehouseIds = warehouses
    .filter((warehouse) => allowedCityKeys.has(normalizeCityKey(warehouse.city)))
    .map((warehouse) => Number(warehouse.id))
    .filter((id) => Number.isFinite(id) && id > 0);

  return [...new Set([...linkedIds, ...cityWarehouseIds])];
}

async function authenticate(req, res, next) {
  try {
    const header = req.headers.authorization || '';
    const token = header.startsWith('Bearer ') ? header.slice(7) : null;
    if (!token) return res.status(401).json({ success: false, message: 'Token não informado.' });
    const decoded = jwt.verify(token, env.jwtSecret);
    const user = await User.findByPk(decoded.id, { include: [Technician] });
    if (!user || user.deletedAt || user.blockedAt || user.status !== 'ativo') return res.status(401).json({ success: false, message: 'Usuário inválido, bloqueado ou inativo.' });
    const resolvedWarehouseIds = await effectiveWarehouseIds(user);
    req.user = {
      id: user.id,
      name: user.name,
      email: user.email,
      role: user.role,
      technicianId: user.technicianId,
      technician: user.Technician,
      warehouseIds: resolvedWarehouseIds,
      explicitWarehouseIds: normalizeIds(user.warehouseIds),
      cityAccess: normalizeCities(user.cityAccess),
      approvalLimit: user.approvalLimit,
      modulePermissions: normalizeModulePermissions(user.modulePermissions, user.role),
      accessStatus: user.deletedAt ? 'excluido' : user.blockedAt ? 'bloqueado' : user.status,
      mustChangePassword: !!user.mustChangePassword,
    };
    return next();
  } catch (error) {
    return res.status(401).json({ success: false, message: 'Sessão expirada ou inválida.' });
  }
}

function requireRoles(...roles) {
  return (req, res, next) => {
    if (!req.user) return res.status(401).json({ success: false, message: 'Não autenticado.' });
    if (!roles.includes(req.user.role)) return res.status(403).json({ success: false, message: 'Acesso negado para este perfil.' });
    return next();
  };
}


function requireModule(...moduleKeys) {
  return (req, res, next) => {
    if (!req.user) return res.status(401).json({ success: false, message: 'Não autenticado.' });
    if (req.user.role === 'admin') return next();
    const allowed = moduleKeys.some((moduleKey) => hasModuleAccess(req.user, moduleKey));
    if (!allowed) return res.status(403).json({ success: false, message: 'Você não tem permissão para acessar este módulo.' });
    return next();
  };
}

module.exports = { authenticate, requireRoles, requireModule };
