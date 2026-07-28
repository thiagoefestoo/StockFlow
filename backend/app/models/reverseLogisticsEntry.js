const { DataTypes } = require('sequelize');
const sequelize = require('../../config/db');

const ReverseLogisticsEntry = sequelize.define('ReverseLogisticsEntry', {
  id: { type: DataTypes.INTEGER, autoIncrement: true, primaryKey: true },
  reference: { type: DataTypes.STRING(140), allowNull: false, unique: true },
  sourceCompany: { type: DataTypes.STRING(180), allowNull: true },
  receivedAt: { type: DataTypes.DATEONLY, allowNull: false },
  documentType: { type: DataTypes.STRING(50), allowNull: true },
  documentNumber: { type: DataTypes.STRING(140), allowNull: true },
  documentDate: { type: DataTypes.DATEONLY, allowNull: true },
  receivedByName: { type: DataTypes.STRING(180), allowNull: true },
  proofAttachmentName: { type: DataTypes.STRING(255), allowNull: true },
  proofAttachmentData: { type: DataTypes.TEXT('long'), allowNull: true },
  notes: { type: DataTypes.TEXT, allowNull: true },
  totalQuantity: { type: DataTypes.DECIMAL(14, 3), allowNull: false, defaultValue: 0 },
  totalValue: { type: DataTypes.DECIMAL(14, 2), allowNull: false, defaultValue: 0 },
  warehouseId: { type: DataTypes.INTEGER, allowNull: false },
  createdById: { type: DataTypes.INTEGER, allowNull: true },
}, { tableName: 'reverse_logistics_entries' });

module.exports = ReverseLogisticsEntry;
