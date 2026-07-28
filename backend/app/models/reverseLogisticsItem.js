const { DataTypes } = require('sequelize');
const sequelize = require('../../config/db');

const ReverseLogisticsItem = sequelize.define('ReverseLogisticsItem', {
  id: { type: DataTypes.INTEGER, autoIncrement: true, primaryKey: true },
  code: { type: DataTypes.STRING(100), allowNull: false },
  description: { type: DataTypes.STRING(255), allowNull: false },
  serialNumber: { type: DataTypes.STRING(160), allowNull: true },
  quantity: { type: DataTypes.DECIMAL(14, 3), allowNull: false, defaultValue: 0 },
  unit: { type: DataTypes.STRING(30), allowNull: false, defaultValue: 'un' },
  unitCost: { type: DataTypes.DECIMAL(14, 2), allowNull: false, defaultValue: 0 },
  condition: { type: DataTypes.STRING(40), allowNull: false, defaultValue: 'usado' },
  status: { type: DataTypes.STRING(40), allowNull: false, defaultValue: 'em_estoque' },
  notes: { type: DataTypes.TEXT, allowNull: true },
  receivedAt: { type: DataTypes.DATE, allowNull: false, defaultValue: DataTypes.NOW },
  exitedAt: { type: DataTypes.DATE, allowNull: true },
  warehouseId: { type: DataTypes.INTEGER, allowNull: false },
  entryId: { type: DataTypes.INTEGER, allowNull: false },
}, { tableName: 'reverse_logistics_items' });

module.exports = ReverseLogisticsItem;
