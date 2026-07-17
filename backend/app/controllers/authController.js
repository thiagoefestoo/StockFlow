const { Op } = require('sequelize');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const env = require('../../config/env');
const { User, Technician } = require('../models');
const asyncHandler = require('../utils/asyncHandler');
const { ok, created, fail } = require('../utils/response');
const { writeAudit } = require('../services/auditService');

function publicUser(user) {
  const technician = user.Technician || user.technician || null;
  return {
    id: user.id,
    name: user.name,
    email: user.email,
    role: user.role,
    technicianId: user.technicianId,
    technician: technician ? {
      id: technician.id,
      name: technician.name,
      document: technician.document,
      phone: technician.phone,
      email: technician.email,
      status: technician.status,
    } : null,
    status: user.status,
    accessStatus: user.deletedAt ? 'excluido' : user.blockedAt ? 'bloqueado' : user.status,
    phone: user.phone,
    jobTitle: user.jobTitle,
    notes: user.notes,
    mustChangePassword: !!user.mustChangePassword,
    passwordChangedAt: user.passwordChangedAt,
    lastLoginAt: user.lastLoginAt,
    createdAt: user.createdAt,
    updatedAt: user.updatedAt,
  };
}

function tokenFor(user) {
  return jwt.sign({ id: user.id, role: user.role }, env.jwtSecret, { expiresIn: env.jwtExpiresIn });
}

function normalizeIdentifier(value) {
  return String(value || '').trim();
}

async function findLoginUser(identifier) {
  const value = normalizeIdentifier(identifier);
  if (!value) return null;

  const where = value.includes('@')
    ? { email: value.toLowerCase() }
    : {
      [Op.or]: [
        { name: { [Op.iLike]: value } },
        { email: { [Op.iLike]: value } },
      ],
    };

  return User.findOne({ where, include: [Technician] });
}

exports.setupAdmin = asyncHandler(async (req, res) => {
  const { key, name, email, password } = req.body;
  if (key !== env.setupAdminKey) return fail(res, 403, 'Chave de criação inválida.');
  const count = await User.count();
  if (count > 0) return fail(res, 409, 'O sistema já possui usuários cadastrados.');
  const user = await User.create({
    name: name || 'Administrador',
    email: email || 'admin@telecomstock.local',
    passwordHash: await bcrypt.hash(password || 'admin123', 10),
    role: 'admin',
  });
  await writeAudit({ req, action: 'setup_admin', entity: 'User', entityId: user.id, message: 'Administrador inicial criado.', afterData: publicUser(user) });
  return created(res, { user: publicUser(user), token: tokenFor(user) }, 'Administrador criado.');
});

exports.login = asyncHandler(async (req, res) => {
  const identifier = normalizeIdentifier(req.body.email || req.body.login || req.body.username);
  const user = await findLoginUser(identifier);
  if (!user || !(await bcrypt.compare(req.body.password || '', user.passwordHash))) return fail(res, 401, 'Usuário ou senha inválidos.');
  if (user.deletedAt) return fail(res, 403, 'Usuário excluído.');
  if (user.blockedAt) return fail(res, 403, 'Usuário bloqueado.');
  if (user.status !== 'ativo') return fail(res, 403, 'Usuário inativo.');
  if (user.role === 'tecnico' && user.Technician?.status && user.Technician.status !== 'ativo') return fail(res, 403, 'Técnico vinculado está inativo ou bloqueado.');
  user.lastLoginAt = new Date();
  await user.save();
  return ok(res, { user: publicUser(user), token: tokenFor(user) }, 'Login realizado.');
});

exports.me = asyncHandler(async (req, res) => {
  const user = await User.findByPk(req.user.id, { include: [Technician] });
  return ok(res, { user: publicUser(user) });
});

exports.updateMe = asyncHandler(async (req, res) => {
  const user = await User.findByPk(req.user.id, { include: [Technician] });
  if (!user) return fail(res, 404, 'Usuário não encontrado.');

  const before = publicUser(user);
  const { name, email, phone, jobTitle, notes } = req.body;

  if (!name || String(name).trim().length < 3) {
    return fail(res, 400, 'Informe seu nome com pelo menos 3 caracteres.');
  }

  const normalizedEmail = String(email || '').toLowerCase().trim();
  if (!normalizedEmail || !normalizedEmail.includes('@')) {
    return fail(res, 400, 'Informe um e-mail válido.');
  }

  if (normalizedEmail !== user.email) {
    const existing = await User.findOne({ where: { email: normalizedEmail } });
    if (existing && Number(existing.id) !== Number(user.id)) {
      return fail(res, 409, 'Este e-mail já está vinculado a outro usuário.');
    }
  }

  user.name = String(name).trim();
  user.email = normalizedEmail;
  user.phone = phone ? String(phone).trim() : null;
  user.jobTitle = jobTitle ? String(jobTitle).trim() : null;
  user.notes = notes ? String(notes).trim() : null;
  await user.save();

  const updated = await User.findByPk(user.id, { include: [Technician] });
  await writeAudit({
    req,
    action: 'update_own_profile',
    entity: 'User',
    entityId: user.id,
    message: `Usuário ${user.email} atualizou as próprias informações de conta.`,
    beforeData: before,
    afterData: publicUser(updated),
  });

  return ok(res, { user: publicUser(updated) }, 'Informações da conta atualizadas.');
});

exports.changePassword = asyncHandler(async (req, res) => {
  const user = await User.findByPk(req.user.id, { include: [Technician] });
  if (!user) return fail(res, 404, 'Usuário não encontrado.');

  const { currentPassword, newPassword, confirmPassword } = req.body;
  if (!currentPassword || !(await bcrypt.compare(currentPassword, user.passwordHash))) {
    return fail(res, 401, 'Senha atual incorreta.');
  }
  if (!newPassword || String(newPassword).length < 6) {
    return fail(res, 400, 'A nova senha precisa ter pelo menos 6 caracteres.');
  }
  if (newPassword !== confirmPassword) {
    return fail(res, 400, 'A confirmação da nova senha não confere.');
  }
  if (currentPassword === newPassword) {
    return fail(res, 400, 'A nova senha precisa ser diferente da senha atual.');
  }

  const before = publicUser(user);
  user.passwordHash = await bcrypt.hash(newPassword, 10);
  user.passwordChangedAt = new Date();
  user.mustChangePassword = false;
  await user.save();

  await writeAudit({
    req,
    action: 'change_own_password',
    entity: 'User',
    entityId: user.id,
    message: `Usuário ${user.email} alterou a própria senha.`,
    beforeData: before,
    afterData: { ...publicUser(user), passwordChanged: true },
  });

  return ok(res, { user: publicUser(user) }, 'Senha alterada com sucesso.');
});
