const { DataTypes } = require('sequelize');
const sequelize = require('../../config/db');

const StockMovement = sequelize.define('StockMovement', {
  id: { type: DataTypes.INTEGER, autoIncrement: true, primaryKey: true },
  type: {
    type: DataTypes.ENUM('entrada', 'transferencia_tecnico', 'retorno_tecnico', 'baixa_os', 'ajuste', 'perda', 'cancelamento'),
    allowNull: false,
  },
  quantity: { type: DataTypes.DECIMAL(12, 3), allowNull: false, defaultValue: 1 },
  serialNumber: { type: DataTypes.STRING(140), allowNull: true },
  fromOwnerType: { type: DataTypes.STRING(40), allowNull: true },
  toOwnerType: { type: DataTypes.STRING(40), allowNull: true },
  movementAt: { type: DataTypes.DATE, allowNull: false, defaultValue: DataTypes.NOW },
  reference: { type: DataTypes.STRING(140), allowNull: true },
  notes: { type: DataTypes.TEXT, allowNull: true },
  fromWarehouseId: { type: DataTypes.INTEGER, allowNull: true },
  toWarehouseId: { type: DataTypes.INTEGER, allowNull: true },
}, { tableName: 'stock_movements' });

module.exports = StockMovement;
