const { DataTypes } = require('sequelize');
const sequelize = require('../../config/db');

const ServiceOrderMaterial = sequelize.define('ServiceOrderMaterial', {
  id: { type: DataTypes.INTEGER, autoIncrement: true, primaryKey: true },
  quantity: { type: DataTypes.DECIMAL(12, 3), allowNull: false, defaultValue: 1 },
  serialNumber: { type: DataTypes.STRING(140), allowNull: true },
  unitCost: { type: DataTypes.DECIMAL(12, 2), allowNull: false, defaultValue: 0 },
  totalCost: { type: DataTypes.DECIMAL(12, 2), allowNull: false, defaultValue: 0 },
}, { tableName: 'service_order_materials' });

module.exports = ServiceOrderMaterial;
