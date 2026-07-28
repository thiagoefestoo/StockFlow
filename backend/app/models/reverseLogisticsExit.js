const { DataTypes } = require('sequelize');
const sequelize = require('../../config/db');

const ReverseLogisticsExit = sequelize.define('ReverseLogisticsExit', {
  id: { type: DataTypes.INTEGER, autoIncrement: true, primaryKey: true },
  reference: { type: DataTypes.STRING(140), allowNull: false, unique: true },
  supplierName: { type: DataTypes.STRING(180), allowNull: false },
  documentNumber: { type: DataTypes.STRING(140), allowNull: false },
  notes: { type: DataTypes.TEXT, allowNull: true },
  totalQuantity: { type: DataTypes.DECIMAL(14, 3), allowNull: false, defaultValue: 0 },
  totalValue: { type: DataTypes.DECIMAL(14, 2), allowNull: false, defaultValue: 0 },
  warehouseId: { type: DataTypes.INTEGER, allowNull: false },
  createdById: { type: DataTypes.INTEGER, allowNull: true },
}, { tableName: 'reverse_logistics_exits' });

module.exports = ReverseLogisticsExit;
