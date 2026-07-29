const { DataTypes } = require('sequelize');
const sequelize = require('../../config/db');

const TechnicianTool = sequelize.define('TechnicianTool', {
  id: { type: DataTypes.INTEGER, autoIncrement: true, primaryKey: true },
  technicianId: { type: DataTypes.INTEGER, allowNull: false },
  materialId: { type: DataTypes.INTEGER, allowNull: true },
  sourceWarehouseId: { type: DataTypes.INTEGER, allowNull: true },
  name: { type: DataTypes.STRING(160), allowNull: false },
  serialNumber: { type: DataTypes.STRING(140), allowNull: false },
  brand: { type: DataTypes.STRING(100), allowNull: true },
  referenceValue: { type: DataTypes.DECIMAL(12, 2), allowNull: false, defaultValue: 0 },
  status: {
    type: DataTypes.ENUM('com_tecnico', 'substituida', 'perdida', 'desgaste', 'devolvida'),
    allowNull: false,
    defaultValue: 'com_tecnico',
  },
  deliveredAt: { type: DataTypes.DATE, allowNull: false, defaultValue: DataTypes.NOW },
  removedAt: { type: DataTypes.DATE, allowNull: true },
  removalReason: { type: DataTypes.TEXT, allowNull: true },
  notes: { type: DataTypes.TEXT, allowNull: true },
  createdById: { type: DataTypes.INTEGER, allowNull: true },
  removedById: { type: DataTypes.INTEGER, allowNull: true },
}, { tableName: 'technician_tools' });

module.exports = TechnicianTool;
