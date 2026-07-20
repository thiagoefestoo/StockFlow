const jwt = require('jsonwebtoken');
const env = require('../../config/env');
const { User, Technician } = require('../models');
const { normalizeModulePermissions, hasModuleAccess } = require('../config/modulePermissions');

async function authenticate(req, res, next) {
  try {
    const header = req.headers.authorization || '';
    const token = header.startsWith('Bearer ') ? header.slice(7) : null;
    if (!token) return res.status(401).json({ success: false, message: 'Token não informado.' });
    const decoded = jwt.verify(token, env.jwtSecret);
    const user = await User.findByPk(decoded.id, { include: [Technician] });
    if (!user || user.deletedAt || user.blockedAt || user.status !== 'ativo') return res.status(401).json({ success: false, message: 'Usuário inválido, bloqueado ou inativo.' });
    req.user = {
      id: user.id,
      name: user.name,
      email: user.email,
      role: user.role,
      technicianId: user.technicianId,
      technician: user.Technician,
      warehouseIds: user.warehouseIds || [],
      cityAccess: user.cityAccess || [],
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
