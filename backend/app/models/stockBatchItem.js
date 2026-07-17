const { DataTypes } = require('sequelize');
const sequelize = require('../../config/db');

const StockBatchItem = sequelize.define('StockBatchItem', {
  id: { type: DataTypes.INTEGER, autoIncrement: true, primaryKey: true },
  quantity: { type: DataTypes.DECIMAL(12, 3), allowNull: false, defaultValue: 0 },
  unitCost: { type: DataTypes.DECIMAL(12, 2), allowNull: false, defaultValue: 0 },
  totalCost: { type: DataTypes.DECIMAL(12, 2), allowNull: false, defaultValue: 0 },
  serialNumbers: { type: DataTypes.JSONB, allowNull: true, defaultValue: [] },
  manufacturerLot: { type: DataTypes.STRING(120), allowNull: true },
  purchaseOrder: { type: DataTypes.STRING(120), allowNull: true },
  condition: { type: DataTypes.ENUM('novo', 'usado', 'recondicionado', 'defeito', 'outro'), allowNull: false, defaultValue: 'novo' },
  warehouseLocation: { type: DataTypes.STRING(120), allowNull: true },
  itemNotes: { type: DataTypes.TEXT, allowNull: true },
  warehouseId: { type: DataTypes.INTEGER, allowNull: true },
}, { tableName: 'stock_batch_items' });

module.exports = StockBatchItem;
