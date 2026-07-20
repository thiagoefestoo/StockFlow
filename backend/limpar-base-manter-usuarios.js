require('dotenv').config();

const sequelize = require('./config/db');
const { User } = require('./app/models');

function quoteTable(tableName) {
  return `"${String(tableName).replace(/"/g, '""')}"`;
}

async function main() {
  if (process.env.CONFIRM_RESET !== 'MANTER_USUARIOS') {
    throw new Error('Proteção ativa. Rode antes: $env:CONFIRM_RESET="MANTER_USUARIOS"');
  }

  await sequelize.authenticate();
  console.log('Conectado ao banco.');

  await sequelize.transaction(async (transaction) => {
    const userPatch = {};

    if (User.rawAttributes.technicianId) userPatch.technicianId = null;
    if (User.rawAttributes.companyId) userPatch.companyId = null;
    if (User.rawAttributes.warehouseIds) userPatch.warehouseIds = [];
    if (User.rawAttributes.cityAccess) userPatch.cityAccess = [];

    if (Object.keys(userPatch).length) {
      await User.update(userPatch, { where: {}, transaction });
      console.log('Vínculos dos usuários limpos:', Object.keys(userPatch).join(', '));
    }

    const existingRaw = await sequelize.getQueryInterface().showAllTables();
    const existingTables = existingRaw.map((item) =>
      typeof item === 'string' ? item : item.tableName
    );

    const keepTables = new Set([
      'users',
      'Users',
      'sequelize_meta',
      'SequelizeMeta',
      'migrations',
      'knex_migrations',
      'knex_migrations_lock',
    ]);

    const tablesToTruncate = existingTables.filter((table) => !keepTables.has(table));

    if (!tablesToTruncate.length) {
      console.log('Nenhuma tabela operacional encontrada para apagar.');
      return;
    }

    console.log('');
    console.log('Tabelas que serão apagadas:');
    tablesToTruncate.forEach((table) => console.log('-', table));

    await sequelize.query(
      `TRUNCATE TABLE ${tablesToTruncate.map(quoteTable).join(', ')} RESTART IDENTITY CASCADE;`,
      { transaction }
    );

    console.log('');
    console.log('Dados operacionais apagados com sucesso.');
  });

  const users = await User.findAll({
    attributes: ['id', 'name', 'email', 'role', 'status'],
    order: [['id', 'ASC']],
  });

  console.log('');
  console.log('Usuários mantidos:');
  users.forEach((user) => {
    console.log(`${user.id} | ${user.name} | ${user.email} | ${user.role} | ${user.status}`);
  });
}

main()
  .catch((error) => {
    console.error('');
    console.error('Erro:', error.message);
    process.exitCode = 1;
  })
  .finally(async () => {
    await sequelize.close();
  });
