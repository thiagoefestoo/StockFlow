const { DataTypes } = require('sequelize');
const sequelize = require('../../config/db');

const Material = sequelize.define('Material', {
  id: { type: DataTypes.INTEGER, autoIncrement: true, primaryKey: true },
  sku: { type: DataTypes.STRING(80), allowNull: false, unique: true },
  name: { type: DataTypes.STRING(180), allowNull: false },
  category: { type: DataTypes.ENUM('onu', 'drop', 'conector', 'esticador', 'cabo', 'roteador', 'ferragem', 'epi', 'outro'), allowNull: false, defaultValue: 'outro' },
  unit: { type: DataTypes.STRING(30), allowNull: false, defaultValue: 'un' },
  requiresSerial: { type: DataTypes.BOOLEAN, allowNull: false, defaultValue: false },
  unitCost: { type: DataTypes.DECIMAL(12, 2), allowNull: false, defaultValue: 0 },
  minStock: { type: DataTypes.INTEGER, allowNull: false, defaultValue: 0 },
  active: { type: DataTypes.BOOLEAN, allowNull: false, defaultValue: true },

  // Campos corporativos do catálogo de materiais
  commercialName: { type: DataTypes.STRING(180), allowNull: true },
  brand: { type: DataTypes.STRING(120), allowNull: true },
  model: { type: DataTypes.STRING(120), allowNull: true },
  manufacturer: { type: DataTypes.STRING(160), allowNull: true },
  defaultSupplier: { type: DataTypes.STRING(180), allowNull: true },
  barcode: { type: DataTypes.STRING(120), allowNull: true },
  ncm: { type: DataTypes.STRING(40), allowNull: true },
  fiscalCode: { type: DataTypes.STRING(80), allowNull: true },
  accountingCode: { type: DataTypes.STRING(80), allowNull: true },
  costCenter: { type: DataTypes.STRING(120), allowNull: true },
  patrimonyPrefix: { type: DataTypes.STRING(40), allowNull: true },
  storageLocation: { type: DataTypes.STRING(160), allowNull: true },
  shelf: { type: DataTypes.STRING(80), allowNull: true },
  packageQuantity: { type: DataTypes.DECIMAL(12, 3), allowNull: false, defaultValue: 1 },
  maxStock: { type: DataTypes.INTEGER, allowNull: false, defaultValue: 0 },
  reorderPoint: { type: DataTypes.INTEGER, allowNull: false, defaultValue: 0 },
  leadTimeDays: { type: DataTypes.INTEGER, allowNull: false, defaultValue: 0 },
  warrantyDays: { type: DataTypes.INTEGER, allowNull: false, defaultValue: 0 },
  usefulLifeMonths: { type: DataTypes.INTEGER, allowNull: false, defaultValue: 0 },
  weightKg: { type: DataTypes.DECIMAL(12, 3), allowNull: false, defaultValue: 0 },
  dimensions: { type: DataTypes.STRING(120), allowNull: true },
  criticality: { type: DataTypes.STRING(30), allowNull: false, defaultValue: 'media' },
  movementPolicy: { type: DataTypes.STRING(40), allowNull: false, defaultValue: 'livre' },
  qualityInspection: { type: DataTypes.STRING(40), allowNull: false, defaultValue: 'visual' },
  serialPattern: { type: DataTypes.STRING(120), allowNull: true },
  allowTechnicianTransfer: { type: DataTypes.BOOLEAN, allowNull: false, defaultValue: true },
  allowCustomerInstall: { type: DataTypes.BOOLEAN, allowNull: false, defaultValue: true },
  requiresReturnOnRemoval: { type: DataTypes.BOOLEAN, allowNull: false, defaultValue: false },
  autoLowStockAlert: { type: DataTypes.BOOLEAN, allowNull: false, defaultValue: true },
  notes: { type: DataTypes.TEXT, allowNull: true },
}, { tableName: 'materials' });

module.exports = Material;
