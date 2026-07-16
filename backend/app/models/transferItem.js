const { DataTypes } = require('sequelize');
const sequelize = require('../../config/db');

const TransferItem = sequelize.define('TransferItem', {
  id: { type: DataTypes.INTEGER, autoIncrement: true, primaryKey: true },
  quantity: { type: DataTypes.DECIMAL(12, 3), allowNull: false, defaultValue: 1 },
  unitCost: { type: DataTypes.DECIMAL(12, 2), allowNull: false, defaultValue: 0 },
  totalCost: { type: DataTypes.DECIMAL(12, 2), allowNull: false, defaultValue: 0 },
  serialNumber: { type: DataTypes.STRING(140), allowNull: true },
}, { tableName: 'transfer_items' });

module.exports = TransferItem;
