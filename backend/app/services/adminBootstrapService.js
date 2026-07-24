const bcrypt = require('bcryptjs');
const env = require('../../config/env');
const { User } = require('../models');
const { assertUserAccountCapacity } = require('./userAccountLimitService');

async function ensureBootstrapAdmin() {
  if (!env.autoCreateAdmin) return null;

  const email = env.defaultAdminEmail;
  const password = env.defaultAdminPassword;
  const name = env.defaultAdminName || 'Administrador';

  if (!email || !password) {
    console.warn('⚠️ AUTO_CREATE_ADMIN ativo, mas DEFAULT_ADMIN_EMAIL ou DEFAULT_ADMIN_PASSWORD não foi configurado.');
    return null;
  }

  if (env.isProduction) {
    console.warn('⚠️ AUTO_CREATE_ADMIN está ativo em produção. Use somente se tiver certeza e troque a senha depois do primeiro acesso.');
  }

  const passwordHash = await bcrypt.hash(password, 10);
  let user = await User.findOne({ where: { email } });
  const created = !user;

  if (created) {
    await assertUserAccountCapacity();
    user = await User.create({
      name,
      email,
      passwordHash,
      role: 'admin',
      status: 'ativo',
    });
  } else {
    await user.update({
      name,
      passwordHash,
      role: 'admin',
      status: 'ativo',
    });
  }

  console.log(created ? '✅ Admin padrão criado automaticamente.' : '✅ Admin padrão atualizado automaticamente.');
  console.log(`👤 Admin: ${email}`);
  return user;
}

module.exports = { ensureBootstrapAdmin };
