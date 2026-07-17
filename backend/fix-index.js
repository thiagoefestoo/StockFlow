require('dotenv').config();
const sequelize = require('./config/db');

(async () => {
  try {
    await sequelize.authenticate();
    console.log('Banco conectado.');

    await sequelize.query('DROP INDEX IF EXISTS "stock_balances_material_id_owner_type_technician_id_warehouse_i";');

    console.log('Índice duplicado removido com sucesso.');
  } catch (error) {
    console.error('Erro:', error.message);
    process.exitCode = 1;
  } finally {
    await sequelize.close();
  }
})();
