const { DataTypes } = require('sequelize');
const sequelize = require('../../config/db');

const ApprovalRequest = sequelize.define('ApprovalRequest', {
  id: { type: DataTypes.INTEGER, autoIncrement: true, primaryKey: true },
  workflowCode: { type: DataTypes.STRING(80), allowNull: false },
  entityType: { type: DataTypes.STRING(80), allowNull: false },
  entityId: { type: DataTypes.STRING(80), allowNull: false },
  title: { type: DataTypes.STRING(180), allowNull: false },
  description: { type: DataTypes.TEXT, allowNull: true },
  status: { type: DataTypes.STRING(40), allowNull: false, defaultValue: 'pendente' },
  priority: { type: DataTypes.STRING(40), allowNull: false, defaultValue: 'media' },
  requestedAt: { type: DataTypes.DATE, allowNull: false, defaultValue: DataTypes.NOW },
  decidedAt: { type: DataTypes.DATE, allowNull: true },
  decisionNotes: { type: DataTypes.TEXT, allowNull: true },
  amount: { type: DataTypes.DECIMAL(12, 2), allowNull: false, defaultValue: 0 },
  payload: { type: DataTypes.JSONB, allowNull: true },
}, { tableName: 'approval_requests' });

module.exports = ApprovalRequest;
