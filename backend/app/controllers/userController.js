const bcrypt = require('bcryptjs');
const { Op } = require('sequelize');
const { User, Technician, AuditLog } = require('../models');
const asyncHandler = require('../utils/asyncHandler');
const { ok, created, fail } = require('../utils/response');
const { writeAudit } = require('../services/auditService');

function computedStatus(user) {
  if (user.deletedAt) return 'excluido';
  if (user.blockedAt) return 'bloqueado';
  return user.status || 'ativo';
}

function hide(user) {
  const raw = user?.get ? user.get({ plain: true }) : user;
  if (!raw) return null;
  return {
    id: raw.id,
    name: raw.name,
    email: raw.email,
    role: raw.role,
    status: raw.status,
    accessStatus: computedStatus(raw),
    technicianId: raw.technicianId,
    Technician: raw.Technician || null,
    phone: raw.phone,
    jobTitle: raw.jobTitle,
    notes: raw.notes,
    mustChangePassword: !!raw.mustChangePassword,
    passwordChangedAt: raw.passwordChangedAt,
    lastLoginAt: raw.lastLoginAt,
    blockedAt: raw.blockedAt,
    blockedReason: raw.blockedReason,
    deletedAt: raw.deletedAt,
    deletedReason: raw.deletedReason,
    createdAt: raw.createdAt,
    updatedAt: raw.updatedAt,
  };
}

async function assertEmailAvailable(email, userId = null) {
  const existing = await User.findOne({ where: { email } });
  if (existing && Number(existing.id) !== Number(userId)) {
    throw Object.assign(new Error('Este e-mail já está vinculado a outro usuário.'), { statusCode: 409 });
  }
}

async function validateTechnicianLink(role, technicianId) {
  if (role !== 'tecnico') return null;
  if (!technicianId) throw Object.assign(new Error('Contas de técnico precisam estar vinculadas a um técnico cadastrado.'), { statusCode: 400 });
  const technician = await Technician.findByPk(technicianId);
  if (!technician) throw Object.assign(new Error('Técnico vinculado não encontrado.'), { statusCode: 404 });
  return technician;
}

exports.list = asyncHandler(async (req, res) => {
  const { q = '', role = '', status = '', includeDeleted = 'true' } = req.query;
  const where = {};
  if (q) {
    where[Op.or] = [
      { name: { [Op.iLike]: `%${q}%` } },
      { email: { [Op.iLike]: `%${q}%` } },
      { phone: { [Op.iLike]: `%${q}%` } },
      { jobTitle: { [Op.iLike]: `%${q}%` } },
    ];
  }
  if (role) where.role = role;
  if (includeDeleted !== 'true') where.deletedAt = null;

  const users = await User.findAll({ where, include: [Technician], order: [['createdAt', 'DESC']] });
  let list = users.map(hide);
  if (status) list = list.filter((u) => u.accessStatus === status || u.status === status);

  const stats = {
    total: users.length,
    ativos: users.filter((u) => computedStatus(u) === 'ativo').length,
    bloqueados: users.filter((u) => computedStatus(u) === 'bloqueado').length,
    inativos: users.filter((u) => computedStatus(u) === 'inativo').length,
    excluidos: users.filter((u) => computedStatus(u) === 'excluido').length,
    tecnicos: users.filter((u) => u.role === 'tecnico').length,
    admins: users.filter((u) => u.role === 'admin').length,
    supervisores: users.filter((u) => u.role === 'supervisor').length,
  };

  return ok(res, { users: list, stats });
});

exports.get = asyncHandler(async (req, res) => {
  const user = await User.findByPk(req.params.id, { include: [Technician] });
  if (!user) return fail(res, 404, 'Usuário não encontrado.');
  const audits = await AuditLog.findAll({
    where: { entity: 'User', entityId: String(user.id) },
    include: [{ model: User, as: 'actor', attributes: ['id', 'name', 'email', 'role'] }],
    order: [['createdAt', 'DESC']],
    limit: 30,
  });
  return ok(res, { user: hide(user), audits });
});

exports.create = asyncHandler(async (req, res) => {
  const { name, email, password, role = 'tecnico', technicianId, status = 'ativo', phone, jobTitle, notes, mustChangePassword = false } = req.body;
  if (!name || !email || !password) return fail(res, 400, 'Nome, e-mail e senha são obrigatórios.');
  if (!['admin', 'supervisor', 'tecnico'].includes(role)) return fail(res, 400, 'Perfil inválido.');
  await assertEmailAvailable(email);
  await validateTechnicianLink(role, technicianId);
  const user = await User.create({
    name,
    email: String(email).toLowerCase().trim(),
    role,
    technicianId: role === 'tecnico' ? technicianId || null : null,
    status,
    phone: phone || null,
    jobTitle: jobTitle || null,
    notes: notes || null,
    mustChangePassword: !!mustChangePassword,
    passwordChangedAt: new Date(),
    passwordHash: await bcrypt.hash(password, 10),
  });
  await writeAudit({ req, action: 'create', entity: 'User', entityId: user.id, message: `Usuário ${user.email} criado.`, afterData: hide(user) });
  return created(res, hide(await User.findByPk(user.id, { include: [Technician] })), 'Usuário criado.');
});

exports.update = asyncHandler(async (req, res) => {
  const user = await User.findByPk(req.params.id, { include: [Technician] });
  if (!user) return fail(res, 404, 'Usuário não encontrado.');
  if (user.deletedAt) return fail(res, 409, 'Usuário excluído. Restaure antes de editar.');

  const before = hide(user);
  const { name, email, password, role, technicianId, status, phone, jobTitle, notes, mustChangePassword } = req.body;
  const nextRole = role || user.role;
  if (email && email !== user.email) await assertEmailAvailable(String(email).toLowerCase().trim(), user.id);
  await validateTechnicianLink(nextRole, technicianId === undefined ? user.technicianId : technicianId);

  Object.assign(user, {
    name: name ?? user.name,
    email: email ? String(email).toLowerCase().trim() : user.email,
    role: nextRole,
    technicianId: nextRole === 'tecnico' ? (technicianId === undefined ? user.technicianId : technicianId || null) : null,
    status: status ?? user.status,
    phone: phone === undefined ? user.phone : phone || null,
    jobTitle: jobTitle === undefined ? user.jobTitle : jobTitle || null,
    notes: notes === undefined ? user.notes : notes || null,
    mustChangePassword: mustChangePassword === undefined ? user.mustChangePassword : !!mustChangePassword,
  });
  if (password) {
    user.passwordHash = await bcrypt.hash(password, 10);
    user.passwordChangedAt = new Date();
    user.mustChangePassword = !!mustChangePassword;
  }
  await user.save();
  const updated = await User.findByPk(user.id, { include: [Technician] });
  await writeAudit({ req, action: 'update', entity: 'User', entityId: user.id, message: `Usuário ${user.email} atualizado.`, beforeData: before, afterData: hide(updated) });
  return ok(res, hide(updated), 'Usuário atualizado.');
});

exports.setStatus = asyncHandler(async (req, res) => {
  const user = await User.findByPk(req.params.id, { include: [Technician] });
  if (!user) return fail(res, 404, 'Usuário não encontrado.');
  const before = hide(user);
  const { action, reason } = req.body;
  if (Number(user.id) === Number(req.user.id) && ['block', 'deactivate', 'delete'].includes(action)) {
    return fail(res, 409, 'Você não pode bloquear, inativar ou excluir sua própria conta logada.');
  }

  if (action === 'activate') {
    user.status = 'ativo';
    user.blockedAt = null;
    user.blockedReason = null;
    user.deletedAt = null;
    user.deletedReason = null;
  } else if (action === 'deactivate') {
    user.status = 'inativo';
    user.blockedAt = null;
    user.blockedReason = null;
  } else if (action === 'block') {
    user.status = 'inativo';
    user.blockedAt = new Date();
    user.blockedReason = reason || 'Bloqueado pelo administrador.';
  } else if (action === 'unblock') {
    user.status = 'ativo';
    user.blockedAt = null;
    user.blockedReason = null;
  } else if (action === 'restore') {
    user.status = 'ativo';
    user.deletedAt = null;
    user.deletedReason = null;
    user.blockedAt = null;
    user.blockedReason = null;
  } else {
    return fail(res, 400, 'Ação de status inválida.');
  }

  await user.save();
  const updated = await User.findByPk(user.id, { include: [Technician] });
  await writeAudit({ req, action: `user_${action}`, entity: 'User', entityId: user.id, message: `Status do usuário ${user.email} alterado para ${computedStatus(updated)}.`, beforeData: before, afterData: hide(updated) });
  return ok(res, hide(updated), 'Status atualizado.');
});

exports.resetPassword = asyncHandler(async (req, res) => {
  const user = await User.findByPk(req.params.id, { include: [Technician] });
  if (!user) return fail(res, 404, 'Usuário não encontrado.');
  if (user.deletedAt) return fail(res, 409, 'Usuário excluído. Restaure antes de redefinir senha.');
  const { password, mustChangePassword = false } = req.body;
  if (!password || String(password).length < 6) return fail(res, 400, 'Informe uma senha com pelo menos 6 caracteres.');
  const before = hide(user);
  user.passwordHash = await bcrypt.hash(password, 10);
  user.passwordChangedAt = new Date();
  user.mustChangePassword = !!mustChangePassword;
  await user.save();
  await writeAudit({ req, action: 'password_reset', entity: 'User', entityId: user.id, message: `Senha do usuário ${user.email} redefinida pelo administrador.`, beforeData: before, afterData: { ...hide(user), passwordReset: true } });
  return ok(res, hide(user), 'Senha redefinida.');
});

exports.remove = asyncHandler(async (req, res) => {
  const user = await User.findByPk(req.params.id, { include: [Technician] });
  if (!user) return fail(res, 404, 'Usuário não encontrado.');
  if (Number(user.id) === Number(req.user.id)) return fail(res, 409, 'Você não pode excluir sua própria conta logada.');
  const before = hide(user);
  user.status = 'inativo';
  user.deletedAt = new Date();
  user.deletedReason = req.body?.reason || 'Exclusão lógica pelo administrador.';
  await user.save();
  await writeAudit({ req, action: 'soft_delete', entity: 'User', entityId: user.id, message: `Usuário ${user.email} excluído logicamente.`, beforeData: before, afterData: hide(user) });
  return ok(res, hide(user), 'Usuário excluído logicamente.');
});
