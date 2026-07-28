const { DataTypes } = require('sequelize');
const sequelize = require('../../config/db');

const ServiceOrderEquipmentReplacement = sequelize.define('ServiceOrderEquipmentReplacement', {
  id: { type: DataTypes.INTEGER, autoIncrement: true, primaryKey: true },
  oldSerialNumber: { type: DataTypes.STRING(140), allowNull: false },
  newSerialNumber: { type: DataTypes.STRING(140), allowNull: false },
  reason: { type: DataTypes.STRING(255), allowNull: true },
  notes: { type: DataTypes.TEXT, allowNull: true },
  serviceOrderId: { type: DataTypes.INTEGER, allowNull: false },
  technicianId: { type: DataTypes.INTEGER, allowNull: false },
  oldAssetId: { type: DataTypes.INTEGER, allowNull: false },
  newAssetId: { type: DataTypes.INTEGER, allowNull: false },
  oldMaterialId: { type: DataTypes.INTEGER, allowNull: false },
  newMaterialId: { type: DataTypes.INTEGER, allowNull: false },
  performedById: { type: DataTypes.INTEGER, allowNull: true },
}, { tableName: 'service_order_equipment_replacements' });

module.exports = ServiceOrderEquipmentReplacement;
