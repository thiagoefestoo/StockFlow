const { DataTypes } = require('sequelize');
const sequelize = require('../../config/db');

const ServiceOrder = sequelize.define('ServiceOrder', {
  id: { type: DataTypes.INTEGER, autoIncrement: true, primaryKey: true },
  osNumber: { type: DataTypes.STRING(80), allowNull: false, unique: true },
  customerName: { type: DataTypes.STRING(180), allowNull: false },
  customerCpf: { type: DataTypes.STRING(32), allowNull: false },
  customerAddress: { type: DataTypes.STRING(255), allowNull: true },
  city: { type: DataTypes.STRING(120), allowNull: true },
  serviceType: { type: DataTypes.ENUM('instalacao', 'manutencao', 'troca_onu', 'retirada', 'outro'), allowNull: false, defaultValue: 'instalacao' },
  status: { type: DataTypes.ENUM('aberta', 'concluida', 'cancelada', 'pendente'), allowNull: false, defaultValue: 'concluida' },
  completedAt: { type: DataTypes.DATE, allowNull: true },
  notes: { type: DataTypes.TEXT, allowNull: true },
}, { tableName: 'service_orders' });

module.exports = ServiceOrder;
