const { Op } = require('sequelize');
const sequelize = require('../../config/db');
const { Material, StockBalance, StockMovement } = require('../models');
const { qty } = require('../utils/number');

const CORRECTION_PREFIX = 'CORRECAO-CAD-MAT-';

function correctionReference(movementId) {
  return `${CORRECTION_PREFIX}${movementId}`;
}

async function hasRealStockEntry(materialId, warehouseId) {
  const [rows] = await sequelize.query(`
    SELECT 1
    FROM stock_batch_items AS item
    JOIN stock_batches AS batch ON batch.id = item."batchId"
    WHERE item."materialId" = :materialId
      AND COALESCE(item."warehouseId", batch."warehouseId") = :warehouseId
    LIMIT 1
  `, { replacements: { materialId, warehouseId } });
  return rows.length > 0;
}

async function findForcedInitialMovement({ materialId, warehouseId, transaction, lock = false }) {
  return StockMovement.findOne({
    where: {
      materialId,
      toWarehouseId: warehouseId,
      type: 'entrada',
      assetId: null,
      quantity: 1,
      reference: { [Op.like]: 'CAD-MAT-%' },
      notes: { [Op.like]: 'Cadastro inicial do material no estoque %' },
    },
    order: [['id', 'ASC']],
    transaction,
    ...(lock && transaction ? { lock: transaction.LOCK.UPDATE } : {}),
  });
}

async function correctForcedInitialStock({ materialId, warehouseId, createdById = null, transaction }) {
  if (!materialId || !warehouseId || !transaction) return false;

  const material = await Material.findByPk(materialId, { transaction });
  if (!material || material.requiresSerial) return false;

  // Bloqueia o movimento de origem para impedir duas correções simultâneas.
  const forcedMovement = await findForcedInitialMovement({ materialId, warehouseId, transaction, lock: true });
  if (!forcedMovement) return false;

  const reference = correctionReference(forcedMovement.id);
  const alreadyCorrected = await StockMovement.findOne({ where: { reference }, transaction });
  if (alreadyCorrected) return false;

  const balance = await StockBalance.findOne({
    where: {
      materialId,
      ownerType: 'estoque',
      technicianId: null,
      warehouseId,
    },
    transaction,
    lock: transaction.LOCK.UPDATE,
  });

  const currentQuantity = Number(balance?.quantity || 0);
  if (!balance || currentQuantity < 1) return false;

  balance.quantity = qty(currentQuantity - 1);
  await balance.save({ transaction });

  await StockMovement.create({
    type: 'ajuste',
    materialId,
    quantity: 1,
    fromOwnerType: 'estoque',
    fromWarehouseId: warehouseId,
    reference,
    notes: 'Correção automática da unidade criada indevidamente no cadastro do material. O saldo real deve nascer somente pela Entrada em Estoque.',
    createdById,
  }, { transaction });

  return true;
}

async function repairForcedInitialStockBalances() {
  try {
    const candidates = await StockMovement.findAll({
      where: {
        type: 'entrada',
        assetId: null,
        quantity: 1,
        toWarehouseId: { [Op.ne]: null },
        reference: { [Op.like]: 'CAD-MAT-%' },
        notes: { [Op.like]: 'Cadastro inicial do material no estoque %' },
      },
      attributes: ['id', 'materialId', 'toWarehouseId'],
      include: [{ model: Material, attributes: [], where: { requiresSerial: false } }],
      order: [['id', 'ASC']],
    });

    let corrected = 0;
    for (const candidate of candidates) {
      const warehouseId = candidate.toWarehouseId;
      const hasRealEntry = await hasRealStockEntry(candidate.materialId, warehouseId);
      if (!hasRealEntry) continue;

      const changed = await sequelize.transaction((transaction) => correctForcedInitialStock({
        materialId: candidate.materialId,
        warehouseId,
        transaction,
      }));
      if (changed) corrected += 1;
    }

    if (corrected > 0) {
      console.log(`✅ ${corrected} saldo(s) inicial(is) indevido(s) corrigido(s) com rastreabilidade.`);
    }
    return corrected;
  } catch (error) {
    // A correção é defensiva e nunca deve impedir o sistema de iniciar em produção.
    console.warn('⚠️ Não foi possível revisar os saldos iniciais automáticos:', error.message);
    return 0;
  }
}

module.exports = {
  correctForcedInitialStock,
  repairForcedInitialStockBalances,
};
