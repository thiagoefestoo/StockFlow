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


  const technicians = await queryInterface.describeTable('technicians').catch(() => null);
  if (technicians && !technicians.transferApprovalLimit) {
    await queryInterface.addColumn('technicians', 'transferApprovalLimit', {
      type: DataTypes.DECIMAL(14, 2),
      allowNull: false,
      defaultValue: 500,
    });
    console.log('✅ Coluna technicians.transferApprovalLimit criada para limite individual de transferências.');
  }
}

module.exports = { ensureRuntimeSchema };
