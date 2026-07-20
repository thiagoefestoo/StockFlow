require('dotenv').config();

const bcrypt = require('bcryptjs');
const sequelize = require('./config/db');
const { User } = require('./app/models');

async function main() {
  await sequelize.authenticate();
  console.log('Conectado ao banco.');

  const email = 'admin@superinfra.local';
  const senha = 'Admin@123';

  const passwordHash = await bcrypt.hash(senha, 10);

  let user = await User.findOne({
    where: { email },
  });

  const data = {
    name: 'Administrador Super Infra',
    email,
    role: 'admin',
    status: 'ativo',
  };

  if (User.rawAttributes.passwordHash) data.passwordHash = passwordHash;
  if (User.rawAttributes.password) data.password = passwordHash;
  if (User.rawAttributes.jobTitle) data.jobTitle = 'Administrador';
  if (User.rawAttributes.phone) data.phone = '';
  if (User.rawAttributes.notes) data.notes = 'Admin recriado após limpeza da base.';
  if (User.rawAttributes.technicianId) data.technicianId = null;
  if (User.rawAttributes.companyId) data.companyId = null;
  if (User.rawAttributes.warehouseIds) data.warehouseIds = [];
  if (User.rawAttributes.cityAccess) data.cityAccess = [];
  if (User.rawAttributes.approvalLimit) data.approvalLimit = 999999;
  if (User.rawAttributes.mustChangePassword) data.mustChangePassword = false;
  if (User.rawAttributes.passwordChangedAt) data.passwordChangedAt = new Date();

  if (user) {
    await user.update(data);
    console.log('Admin atualizado com nova senha.');
  } else {
    user = await User.create(data);
    console.log('Admin criado com sucesso.');
  }

  console.log('');
  console.log('Login:');
  console.log('E-mail:', email);
  console.log('Senha:', senha);

  const users = await User.findAll({
    attributes: ['id', 'name', 'email', 'role', 'status'],
    order: [['id', 'ASC']],
  });

  console.log('');
  console.log('Usuários existentes:');
  for (const u of users) {
    console.log(`${u.id} | ${u.name} | ${u.email} | ${u.role} | ${u.status}`);
  }
}

main()
  .catch((error) => {
    console.error('Erro:', error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await sequelize.close();
  });
