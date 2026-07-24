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


  if (users) {
    await sequelize.query(`
      CREATE OR REPLACE FUNCTION enforce_user_account_limit()
      RETURNS trigger AS $$
      BEGIN
        LOCK TABLE users IN SHARE ROW EXCLUSIVE MODE;
        IF (SELECT COUNT(*) FROM users) >= 30 THEN
          RAISE EXCEPTION 'Limite máximo de 30 contas atingido. Entre em contato com o Engenheiro de Software do Sistema para mais informações.'
            USING ERRCODE = 'check_violation';
        END IF;
        RETURN NEW;
      END;
      $$ LANGUAGE plpgsql;

      DROP TRIGGER IF EXISTS users_account_limit_30 ON users;
      CREATE TRIGGER users_account_limit_30
      BEFORE INSERT ON users
      FOR EACH ROW
      EXECUTE FUNCTION enforce_user_account_limit();
    `);
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
