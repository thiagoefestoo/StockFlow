const { DataTypes } = require('sequelize');
const sequelize = require('../../config/db');

const ReverseLogisticsExitItem = sequelize.define('ReverseLogisticsExitItem', {
  id: { type: DataTypes.INTEGER, autoIncrement: true, primaryKey: true },
  code: { type: DataTypes.STRING(100), allowNull: false },
  description: { type: DataTypes.STRING(255), allowNull: false },
  serialNumber: { type: DataTypes.STRING(160), allowNull: true },
  quantity: { type: DataTypes.DECIMAL(14, 3), allowNull: false, defaultValue: 0 },
  unit: { type: DataTypes.STRING(30), allowNull: false, defaultValue: 'un' },
  unitCost: { type: DataTypes.DECIMAL(14, 2), allowNull: false, defaultValue: 0 },
  totalCost: { type: DataTypes.DECIMAL(14, 2), allowNull: false, defaultValue: 0 },
  reverseItemId: { type: DataTypes.INTEGER, allowNull: true },
  exitId: { type: DataTypes.INTEGER, allowNull: false },
}, { tableName: 'reverse_logistics_exit_items' });

module.exports = ReverseLogisticsExitItem;
