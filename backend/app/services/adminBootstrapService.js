const bcrypt = require('bcryptjs');
const env = require('../../config/env');
const { User } = require('../models');

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
  const [user, created] = await User.findOrCreate({
    where: { email },
    defaults: {
      name,
      email,
      passwordHash,
      role: 'admin',
      status: 'ativo',
    },
  });

  if (!created) {
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
