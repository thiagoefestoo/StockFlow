const { DataTypes } = require('sequelize');
const sequelize = require('../../config/db');

const User = sequelize.define('User', {
  id: { type: DataTypes.INTEGER, autoIncrement: true, primaryKey: true },
  name: { type: DataTypes.STRING(140), allowNull: false },
  email: { type: DataTypes.STRING(180), allowNull: false, unique: true, validate: { isEmail: true } },
  passwordHash: { type: DataTypes.STRING(255), allowNull: false },
  role: { type: DataTypes.ENUM('admin', 'supervisor', 'tecnico'), allowNull: false, defaultValue: 'tecnico' },
  status: { type: DataTypes.ENUM('ativo', 'inativo'), allowNull: false, defaultValue: 'ativo' },
  technicianId: { type: DataTypes.INTEGER, allowNull: true },
  phone: { type: DataTypes.STRING(40), allowNull: true },
  jobTitle: { type: DataTypes.STRING(120), allowNull: true },
  notes: { type: DataTypes.TEXT, allowNull: true },
  mustChangePassword: { type: DataTypes.BOOLEAN, allowNull: false, defaultValue: false },
  passwordChangedAt: { type: DataTypes.DATE, allowNull: true },
  blockedAt: { type: DataTypes.DATE, allowNull: true },
  blockedReason: { type: DataTypes.TEXT, allowNull: true },
  deletedAt: { type: DataTypes.DATE, allowNull: true },
  deletedReason: { type: DataTypes.TEXT, allowNull: true },
  lastLoginAt: { type: DataTypes.DATE, allowNull: true },
}, { tableName: 'users' });

module.exports = User;
