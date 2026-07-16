const { DataTypes } = require('sequelize');
const sequelize = require('../../config/db');

const MaterialRequest = sequelize.define('MaterialRequest', {
  id: { type: DataTypes.INTEGER, autoIncrement: true, primaryKey: true },
  requestNumber: { type: DataTypes.STRING(80), allowNull: false, unique: true },
  requestType: { type: DataTypes.STRING(60), allowNull: false, defaultValue: 'reposicao_carga' },
  status: { type: DataTypes.STRING(60), allowNull: false, defaultValue: 'pendente_aprovacao' },
  priority: { type: DataTypes.STRING(40), allowNull: false, defaultValue: 'media' },
  neededBy: { type: DataTypes.DATEONLY, allowNull: true },
  requesterNotes: { type: DataTypes.TEXT, allowNull: true },
  approvalNotes: { type: DataTypes.TEXT, allowNull: true },
  logisticsNotes: { type: DataTypes.TEXT, allowNull: true },
  totalQuantity: { type: DataTypes.DECIMAL(12, 3), allowNull: false, defaultValue: 0 },
  totalValue: { type: DataTypes.DECIMAL(12, 2), allowNull: false, defaultValue: 0 },
  approvedAt: { type: DataTypes.DATE, allowNull: true },
  deliveredAt: { type: DataTypes.DATE, allowNull: true },
  cancelledAt: { type: DataTypes.DATE, allowNull: true },
  metadata: { type: DataTypes.JSONB, allowNull: true },
}, { tableName: 'material_requests' });

module.exports = MaterialRequest;
