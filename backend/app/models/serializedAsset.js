const { DataTypes } = require('sequelize');
const sequelize = require('../../config/db');

const SerializedAsset = sequelize.define('SerializedAsset', {
  id: { type: DataTypes.INTEGER, autoIncrement: true, primaryKey: true },
  serialNumber: { type: DataTypes.STRING(140), allowNull: false, unique: true },
  mac: { type: DataTypes.STRING(80), allowNull: true },
  brand: { type: DataTypes.STRING(100), allowNull: true },
  model: { type: DataTypes.STRING(100), allowNull: true },
  status: {
    type: DataTypes.ENUM('em_estoque', 'com_tecnico', 'instalado', 'devolvido', 'manutencao', 'perdido', 'baixado'),
    allowNull: false,
    defaultValue: 'em_estoque',
  },
  ownerType: { type: DataTypes.ENUM('estoque', 'tecnico', 'cliente', 'fornecedor'), allowNull: false, defaultValue: 'estoque' },
  acquisitionCost: { type: DataTypes.DECIMAL(12, 2), allowNull: false, defaultValue: 0 },
  custodyStartedAt: { type: DataTypes.DATE, allowNull: true },
  installedAt: { type: DataTypes.DATE, allowNull: true },
  customerName: { type: DataTypes.STRING(180), allowNull: true },
  customerCpf: { type: DataTypes.STRING(32), allowNull: true },
  lastMovementAt: { type: DataTypes.DATE, allowNull: true },
  notes: { type: DataTypes.TEXT, allowNull: true },
  warehouseId: { type: DataTypes.INTEGER, allowNull: true },
}, { tableName: 'serialized_assets' });

module.exports = SerializedAsset;
