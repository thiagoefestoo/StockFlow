const { Op } = require('sequelize');
const { StockBalance, Material, SerializedAsset, Technician } = require('../models');
const { qty } = require('../utils/number');

async function getOrCreateBalance({ materialId, ownerType = 'estoque', technicianId = null, transaction }) {
  const [balance] = await StockBalance.findOrCreate({
    where: { materialId, ownerType, technicianId },
    defaults: { quantity: 0 },
    transaction,
  });
  return balance;
}

async function adjustBalance({ materialId, ownerType = 'estoque', technicianId = null, delta, transaction }) {
  const balance = await getOrCreateBalance({ materialId, ownerType, technicianId, transaction });
  const nextQuantity = qty(Number(balance.quantity || 0) + Number(delta || 0));
  if (nextQuantity < -0.0001) {
    const material = await Material.findByPk(materialId, { transaction });
    throw new Error(`Saldo insuficiente para ${material?.name || 'material'} (${ownerType}).`);
  }
  balance.quantity = nextQuantity;
  await balance.save({ transaction });
  return balance;
}

async function getMainStock() {
  const balances = await StockBalance.findAll({ where: { ownerType: 'estoque' }, include: [Material], order: [[Material, 'name', 'ASC']] });
  const serialized = await SerializedAsset.findAll({ where: { ownerType: 'estoque' }, include: [Material] });
  return { balances, serialized };
}

async function getTechnicianStock(technicianId) {
  const balances = await StockBalance.findAll({ where: { ownerType: 'tecnico', technicianId }, include: [Material] });
  const serialized = await SerializedAsset.findAll({ where: { ownerType: 'tecnico', technicianId }, include: [Material, Technician] });
  return { balances, serialized };
}

async function availableAssetsByMaterial(materialId) {
  return SerializedAsset.findAll({
    where: { materialId, ownerType: 'estoque', status: 'em_estoque' },
    order: [['serialNumber', 'ASC']],
  });
}

async function assetsInCustodyOlderThan(days) {
  const limit = new Date(Date.now() - days * 24 * 60 * 60 * 1000);
  return SerializedAsset.findAll({
    where: { ownerType: 'tecnico', custodyStartedAt: { [Op.lte]: limit } },
    include: [Material, Technician],
    order: [['custodyStartedAt', 'ASC']],
  });
}

module.exports = {
  getOrCreateBalance,
  adjustBalance,
  getMainStock,
  getTechnicianStock,
  availableAssetsByMaterial,
  assetsInCustodyOlderThan,
};
