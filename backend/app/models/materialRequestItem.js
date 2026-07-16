const { DataTypes } = require('sequelize');
const sequelize = require('../../config/db');

const MaterialRequestItem = sequelize.define('MaterialRequestItem', {
  id: { type: DataTypes.INTEGER, autoIncrement: true, primaryKey: true },
  quantity: { type: DataTypes.DECIMAL(12, 3), allowNull: false, defaultValue: 1 },
  approvedQuantity: { type: DataTypes.DECIMAL(12, 3), allowNull: false, defaultValue: 0 },
  unitCost: { type: DataTypes.DECIMAL(12, 2), allowNull: false, defaultValue: 0 },
  totalCost: { type: DataTypes.DECIMAL(12, 2), allowNull: false, defaultValue: 0 },
  serialNumbers: { type: DataTypes.JSONB, allowNull: true, defaultValue: [] },
  deliverySerials: { type: DataTypes.JSONB, allowNull: true, defaultValue: [] },
  notes: { type: DataTypes.TEXT, allowNull: true },
}, { tableName: 'material_request_items' });

module.exports = MaterialRequestItem;
