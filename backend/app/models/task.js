const { DataTypes } = require('sequelize');
const sequelize = require('../../config/db');

const Task = sequelize.define('Task', {
  id: { type: DataTypes.INTEGER, autoIncrement: true, primaryKey: true },
  title: { type: DataTypes.STRING(180), allowNull: false },
  description: { type: DataTypes.TEXT, allowNull: true },
  priority: { type: DataTypes.ENUM('baixa', 'media', 'alta', 'critica'), allowNull: false, defaultValue: 'media' },
  status: { type: DataTypes.ENUM('aberta', 'em_andamento', 'concluida', 'cancelada'), allowNull: false, defaultValue: 'aberta' },
  dueAt: { type: DataTypes.DATE, allowNull: true },
  relatedEntity: { type: DataTypes.STRING(100), allowNull: true },
  relatedEntityId: { type: DataTypes.STRING(100), allowNull: true },
}, { tableName: 'tasks' });

module.exports = Task;
