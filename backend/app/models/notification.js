const { DataTypes } = require('sequelize');
const sequelize = require('../../config/db');

const Notification = sequelize.define('Notification', {
  id: { type: DataTypes.INTEGER, autoIncrement: true, primaryKey: true },
  role: { type: DataTypes.ENUM('admin', 'supervisor', 'tecnico', 'todos'), allowNull: false, defaultValue: 'todos' },
  type: { type: DataTypes.ENUM('alerta', 'tarefa', 'dica', 'estoque', 'patrimonio', 'assinatura'), allowNull: false, defaultValue: 'alerta' },
  severity: { type: DataTypes.ENUM('info', 'success', 'warning', 'danger'), allowNull: false, defaultValue: 'info' },
  title: { type: DataTypes.STRING(160), allowNull: false },
  message: { type: DataTypes.TEXT, allowNull: false },
  status: { type: DataTypes.ENUM('nao_lida', 'lida', 'arquivada'), allowNull: false, defaultValue: 'nao_lida' },
  route: { type: DataTypes.STRING(160), allowNull: true },
  dueAt: { type: DataTypes.DATE, allowNull: true },
  metadata: { type: DataTypes.JSONB, allowNull: true },
}, { tableName: 'notifications' });

module.exports = Notification;
