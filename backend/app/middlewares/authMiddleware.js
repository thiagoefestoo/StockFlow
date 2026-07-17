const jwt = require('jsonwebtoken');
const env = require('../../config/env');
const { User, Technician } = require('../models');

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

module.exports = { authenticate, requireRoles };
