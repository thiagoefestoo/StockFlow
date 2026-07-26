const { DataTypes } = require('sequelize');
const sequelize = require('../../config/db');

const TechnicianToolDocument = sequelize.define('TechnicianToolDocument', {
  id: { type: DataTypes.INTEGER, autoIncrement: true, primaryKey: true },
  technicianId: { type: DataTypes.INTEGER, allowNull: false },
  documentName: { type: DataTypes.STRING(255), allowNull: false },
  documentData: { type: DataTypes.TEXT('long'), allowNull: false },
  signedAt: { type: DataTypes.DATE, allowNull: true },
  notes: { type: DataTypes.TEXT, allowNull: true },
  toolCount: { type: DataTypes.INTEGER, allowNull: false, defaultValue: 0 },
  totalValue: { type: DataTypes.DECIMAL(12, 2), allowNull: false, defaultValue: 0 },
  createdById: { type: DataTypes.INTEGER, allowNull: true },
}, { tableName: 'technician_tool_documents' });

module.exports = TechnicianToolDocument;
