require('dotenv').config();
const bcrypt = require('bcryptjs');
const sequelize = require('../config/db');
const { User } = require('../app/models');

async function main() {
  const name = process.env.LOCAL_ADMIN_NAME || 'Administrador';
  const email = process.env.LOCAL_ADMIN_EMAIL || 'admin@local.com';
  const password = process.env.LOCAL_ADMIN_PASSWORD || 'admin123';

  await sequelize.authenticate();
  await sequelize.sync();

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
    await user.update({ name, passwordHash, role: 'admin', status: 'ativo' });
  }

  console.log(created ? 'Admin local criado.' : 'Admin local atualizado.');
  console.log(`Email: ${email}`);
  console.log(`Senha: ${password}`);
  await sequelize.close();
}

main().catch(async (error) => {
  console.error('Erro ao criar admin local:', error.message);
  try { await sequelize.close(); } catch (_) {}
  process.exit(1);
});
