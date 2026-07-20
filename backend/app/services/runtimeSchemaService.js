const { DataTypes } = require('sequelize');
const sequelize = require('../../config/db');

async function ensureRuntimeSchema() {
  const queryInterface = sequelize.getQueryInterface();
  const users = await queryInterface.describeTable('users').catch(() => null);
  if (users && !users.modulePermissions) {
    await queryInterface.addColumn('users', 'modulePermissions', {
      type: DataTypes.JSONB,
      allowNull: true,
      defaultValue: null,
    });
    console.log('✅ Coluna users.modulePermissions criada para controle de módulos.');
  }
}

module.exports = { ensureRuntimeSchema };
