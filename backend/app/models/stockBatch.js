const { DataTypes } = require('sequelize');
const sequelize = require('../../config/db');

const StockBatch = sequelize.define('StockBatch', {
  id: { type: DataTypes.INTEGER, autoIncrement: true, primaryKey: true },
  receiptNumber: { type: DataTypes.STRING(80), allowNull: false, unique: true },
  sourceCompany: { type: DataTypes.STRING(180), allowNull: false, defaultValue: 'Companhia Telecom' },
  receivedAt: { type: DataTypes.DATEONLY, allowNull: false },
  cycle: { type: DataTypes.ENUM('quinzenal', 'mensal', 'extra'), allowNull: false, defaultValue: 'quinzenal' },
  status: { type: DataTypes.ENUM('rascunho', 'confirmado', 'cancelado'), allowNull: false, defaultValue: 'confirmado' },
  fiscalDocumentType: { type: DataTypes.ENUM('nota_fiscal', 'termo_entrega', 'romaneio', 'recibo', 'outro'), allowNull: false, defaultValue: 'nota_fiscal' },
  fiscalDocumentNumber: { type: DataTypes.STRING(100), allowNull: true },
  fiscalDocumentDate: { type: DataTypes.DATEONLY, allowNull: true },
  fiscalIssuer: { type: DataTypes.STRING(180), allowNull: true },
  invoiceAccessKey: { type: DataTypes.STRING(120), allowNull: true },
  receivedByName: { type: DataTypes.STRING(160), allowNull: true },
  conferenceStatus: { type: DataTypes.ENUM('pendente_conferencia', 'conferido', 'divergente'), allowNull: false, defaultValue: 'conferido' },
  warehouseLocation: { type: DataTypes.STRING(120), allowNull: true },
  proofAttachmentName: { type: DataTypes.STRING(255), allowNull: true },
  proofAttachmentData: { type: DataTypes.TEXT('long'), allowNull: true },
  totalItems: { type: DataTypes.DECIMAL(12, 3), allowNull: false, defaultValue: 0 },
  totalValue: { type: DataTypes.DECIMAL(12, 2), allowNull: false, defaultValue: 0 },
  notes: { type: DataTypes.TEXT, allowNull: true },
  warehouseId: { type: DataTypes.INTEGER, allowNull: true },
}, { tableName: 'stock_batches' });

module.exports = StockBatch;
