const { DataTypes } = require('sequelize');
const sequelize = require('../../config/db');

const Transfer = sequelize.define('Transfer', {
  id: { type: DataTypes.INTEGER, autoIncrement: true, primaryKey: true },
  transferNumber: { type: DataTypes.STRING(80), allowNull: false, unique: true },
  status: { type: DataTypes.ENUM('pendente_assinatura', 'assinado', 'cancelado'), allowNull: false, defaultValue: 'pendente_assinatura' },
  deliveredAt: { type: DataTypes.DATE, allowNull: false, defaultValue: DataTypes.NOW },
  signedAt: { type: DataTypes.DATE, allowNull: true },
  totalQuantity: { type: DataTypes.DECIMAL(12, 3), allowNull: false, defaultValue: 0 },
  totalValue: { type: DataTypes.DECIMAL(12, 2), allowNull: false, defaultValue: 0 },
  attachmentName: { type: DataTypes.STRING(255), allowNull: true },
  attachmentData: { type: DataTypes.TEXT('long'), allowNull: true },
  signatureResponsible: { type: DataTypes.STRING(160), allowNull: true },
  notes: { type: DataTypes.TEXT, allowNull: true },
}, { tableName: 'transfers' });

module.exports = Transfer;
