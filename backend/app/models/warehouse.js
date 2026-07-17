
const { DataTypes } = require('sequelize');
const sequelize = require('../../config/db');

const Warehouse = sequelize.define('Warehouse', {
  id: { type: DataTypes.INTEGER, autoIncrement: true, primaryKey: true },
  name: { type: DataTypes.STRING(160), allowNull: false },
  code: { type: DataTypes.STRING(50), allowNull: false, unique: true },
  region: { type: DataTypes.STRING(120), allowNull: true },
  city: { type: DataTypes.STRING(120), allowNull: true },
  state: { type: DataTypes.STRING(2), allowNull: true },
  address: { type: DataTypes.STRING(220), allowNull: true },
  responsibleName: { type: DataTypes.STRING(160), allowNull: true },
  status: { type: DataTypes.ENUM('ativo', 'inativo', 'bloqueado'), allowNull: false, defaultValue: 'ativo' },
  approvalLimit: { type: DataTypes.DECIMAL(12, 2), allowNull: false, defaultValue: 0 },
  notes: { type: DataTypes.TEXT, allowNull: true },
}, { tableName: 'warehouses' });

module.exports = Warehouse;
