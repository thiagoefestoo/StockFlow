const { DataTypes } = require('sequelize');
const sequelize = require('../../config/db');

const StockBalance = sequelize.define('StockBalance', {
  id: { type: DataTypes.INTEGER, autoIncrement: true, primaryKey: true },
  ownerType: { type: DataTypes.ENUM('estoque', 'tecnico'), allowNull: false, defaultValue: 'estoque' },
  quantity: { type: DataTypes.DECIMAL(12, 3), allowNull: false, defaultValue: 0 },
  warehouseId: { type: DataTypes.INTEGER, allowNull: true },
}, {
  tableName: 'stock_balances',
  indexes: [{ unique: true, fields: ['materialId', 'ownerType', 'technicianId', 'warehouseId'] }],
});

module.exports = StockBalance;
