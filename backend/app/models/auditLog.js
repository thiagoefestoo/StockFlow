const { DataTypes } = require('sequelize');
const sequelize = require('../../config/db');

const AuditLog = sequelize.define('AuditLog', {
  id: { type: DataTypes.INTEGER, autoIncrement: true, primaryKey: true },
  action: { type: DataTypes.STRING(80), allowNull: false },
  entity: { type: DataTypes.STRING(80), allowNull: false },
  entityId: { type: DataTypes.STRING(80), allowNull: true },
  message: { type: DataTypes.STRING(255), allowNull: false },
  beforeData: { type: DataTypes.JSONB, allowNull: true },
  afterData: { type: DataTypes.JSONB, allowNull: true },
  ip: { type: DataTypes.STRING(80), allowNull: true },
}, { tableName: 'audit_logs' });

module.exports = AuditLog;
