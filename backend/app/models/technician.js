const { DataTypes } = require('sequelize');
const sequelize = require('../../config/db');

const Technician = sequelize.define('Technician', {
  id: { type: DataTypes.INTEGER, autoIncrement: true, primaryKey: true },
  name: { type: DataTypes.STRING(160), allowNull: false },
  document: { type: DataTypes.STRING(32), allowNull: true },
  phone: { type: DataTypes.STRING(40), allowNull: true },
  email: { type: DataTypes.STRING(180), allowNull: true },
  type: { type: DataTypes.ENUM('interno', 'terceirizado'), allowNull: false, defaultValue: 'interno' },
  status: { type: DataTypes.ENUM('ativo', 'inativo', 'bloqueado'), allowNull: false, defaultValue: 'ativo' },
  vehiclePlate: { type: DataTypes.STRING(20), allowNull: true },
  notes: { type: DataTypes.TEXT, allowNull: true },
}, { tableName: 'technicians' });

module.exports = Technician;
