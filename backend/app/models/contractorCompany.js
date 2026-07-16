const { DataTypes } = require('sequelize');
const sequelize = require('../../config/db');

const ContractorCompany = sequelize.define('ContractorCompany', {
  id: { type: DataTypes.INTEGER, autoIncrement: true, primaryKey: true },
  name: { type: DataTypes.STRING(180), allowNull: false },
  document: { type: DataTypes.STRING(32), allowNull: true },
  contactName: { type: DataTypes.STRING(140), allowNull: true },
  phone: { type: DataTypes.STRING(40), allowNull: true },
  email: { type: DataTypes.STRING(180), allowNull: true },
  city: { type: DataTypes.STRING(120), allowNull: true },
  status: { type: DataTypes.ENUM('ativa', 'inativa'), allowNull: false, defaultValue: 'ativa' },
  notes: { type: DataTypes.TEXT, allowNull: true },
}, { tableName: 'contractor_companies' });

module.exports = ContractorCompany;
