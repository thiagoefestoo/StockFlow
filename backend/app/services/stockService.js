const { Op } = require('sequelize');
const { StockBalance, Material, SerializedAsset, Technician } = require('../models');
const { qty } = require('../utils/number');

function normalizeWarehouseId(value) {
  return value === undefined || value === '' ? null : value;
}

async function getOrCreateBalance({ materialId, ownerType = 'estoque', technicianId = null, warehouseId = null, transaction }) {
  const normalizedWarehouseId = normalizeWarehouseId(warehouseId);
  const [balance] = await StockBalance.findOrCreate({
    where: { materialId, ownerType, technicianId, warehouseId: normalizedWarehouseId },
    defaults: { quantity: 0, warehouseId: normalizedWarehouseId },
    transaction,
  });
  return balance;
}

async function adjustBalance({ materialId, ownerType = 'estoque', technicianId = null, warehouseId = null, delta, transaction }) {
  const balance = await getOrCreateBalance({ materialId, ownerType, technicianId, warehouseId, transaction });
  const nextQuantity = qty(Number(balance.quantity || 0) + Number(delta || 0));
  if (nextQuantity < -0.0001) {
    const material = await Material.findByPk(materialId, { transaction });
    throw new Error(`Saldo insuficiente para ${material?.name || 'material'} (${ownerType}).`);
  }
  balance.quantity = nextQuantity;
  await balance.save({ transaction });
  return balance;
}

async function getMainStock(warehouseId = null) {
  const where = { ownerType: 'estoque' };
  const assetWhere = { ownerType: 'estoque' };
  if (warehouseId) { where.warehouseId = warehouseId; assetWhere.warehouseId = warehouseId; }
  const balances = await StockBalance.findAll({ where, include: [Material], order: [[Material, 'name', 'ASC']] });
  const serialized = await SerializedAsset.findAll({ where: assetWhere, include: [Material] });
  return { balances, serialized };
}

async function getTechnicianStock(technicianId) {
  const balances = await StockBalance.findAll({ where: { ownerType: 'tecnico', technicianId }, include: [Material] });
  const serialized = await SerializedAsset.findAll({ where: { ownerType: 'tecnico', technicianId }, include: [Material, Technician] });
  return { balances, serialized };
}

async function availableAssetsByMaterial(materialId, warehouseId = null) {
  const where = { materialId, ownerType: 'estoque', status: 'em_estoque' };
  if (warehouseId) where.warehouseId = warehouseId;
  return SerializedAsset.findAll({ where, order: [['serialNumber', 'ASC']] });
}

async function assetsInCustodyOlderThan(days) {
  const limit = new Date(Date.now() - days * 24 * 60 * 60 * 1000);
  return SerializedAsset.findAll({
    where: { ownerType: 'tecnico', custodyStartedAt: { [Op.lte]: limit } },
    include: [Material, Technician],
    order: [['custodyStartedAt', 'ASC']],
  });
}

module.exports = { getOrCreateBalance, adjustBalance, getMainStock, getTechnicianStock, availableAssetsByMaterial, assetsInCustodyOlderThan };
