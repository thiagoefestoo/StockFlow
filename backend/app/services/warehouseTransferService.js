const sequelize = require('../../config/db');
const { Material, SerializedAsset, StockBalance, StockMovement, Warehouse } = require('../models');
const { adjustBalance } = require('./stockService');
const { money, qty } = require('../utils/number');

function parseSerials(value) {
  if (Array.isArray(value)) return value.map((s) => String(s).trim()).filter(Boolean);
  return String(value || '').split(/\n|,|;/).map((s) => s.trim()).filter(Boolean);
}

function nextWarehouseTransferNumber() {
  const now = new Date();
  const stamp = `${now.getFullYear()}${String(now.getMonth() + 1).padStart(2, '0')}${String(now.getDate()).padStart(2, '0')}-${String(now.getHours()).padStart(2, '0')}${String(now.getMinutes()).padStart(2, '0')}${String(now.getSeconds()).padStart(2, '0')}`;
  return `TE-${stamp}`;
}

async function buildWarehouseTransferPlan({ fromWarehouseId, toWarehouseId, reference, notes, items = [] }, options = {}) {
  if (!fromWarehouseId || !toWarehouseId) throw new Error('Informe estoque de origem e destino.');
  if (Number(fromWarehouseId) === Number(toWarehouseId)) throw new Error('Origem e destino precisam ser diferentes.');
  if (!Array.isArray(items) || !items.length) throw new Error('Informe ao menos um item para transferir.');

  const transaction = options.transaction || null;
  const [fromWarehouse, toWarehouse] = await Promise.all([
    Warehouse.findByPk(fromWarehouseId, { transaction }),
    Warehouse.findByPk(toWarehouseId, { transaction }),
  ]);
  if (!fromWarehouse || !toWarehouse) throw new Error('Estoque de origem ou destino não encontrado.');
  if (fromWarehouse.status !== 'ativo' || toWarehouse.status !== 'ativo') throw new Error('Só é possível transferir entre estoques ativos.');

  const normalizedItems = [];
  let totalQuantity = 0;
  let totalValue = 0;

  for (const raw of items) {
    const material = await Material.findByPk(raw.materialId, { transaction });
    if (!material) throw new Error('Material não encontrado.');
    const unitCost = money(raw.unitCost ?? material.unitCost);

    if (material.requiresSerial) {
      const serialNumbers = parseSerials(raw.serialNumbers);
      if (!serialNumbers.length) throw new Error(`Selecione ao menos um serial de ${material.name}.`);
      const serialDetails = [];
      for (const serialNumber of serialNumbers) {
        const asset = await SerializedAsset.findOne({ where: { serialNumber }, include: [Material], transaction });
        if (!asset || asset.ownerType !== 'estoque' || asset.status !== 'em_estoque' || Number(asset.warehouseId) !== Number(fromWarehouseId)) {
          throw new Error(`Serial ${serialNumber} não está disponível no estoque de origem.`);
        }
        const value = Number(asset.acquisitionCost || unitCost || 0);
        totalQuantity += 1;
        totalValue += value;
        serialDetails.push({
          assetId: asset.id,
          serialNumber,
          status: asset.status,
          value,
        });
      }
      normalizedItems.push({
        materialId: material.id,
        materialName: material.name,
        category: material.category,
        unit: material.unit,
        requiresSerial: true,
        quantity: serialNumbers.length,
        unitCost,
        totalCost: money(serialDetails.reduce((sum, a) => sum + Number(a.value || 0), 0)),
        serialNumbers,
        serialDetails,
      });
    } else {
      const quantity = qty(raw.quantity);
      if (quantity <= 0) throw new Error(`Quantidade inválida para ${material.name}.`);
      const balance = await StockBalance.findOne({
        where: { materialId: material.id, ownerType: 'estoque', technicianId: null, warehouseId: Number(fromWarehouseId) },
        transaction,
      });
      if (!balance || Number(balance.quantity || 0) < Number(quantity)) {
        throw new Error(`Saldo insuficiente para ${material.name} no estoque de origem. Disponível: ${balance?.quantity || 0}.`);
      }
      totalQuantity += Number(quantity);
      totalValue += Number(quantity) * Number(unitCost);
      normalizedItems.push({
        materialId: material.id,
        materialName: material.name,
        category: material.category,
        unit: material.unit,
        requiresSerial: false,
        quantity,
        unitCost,
        totalCost: money(Number(quantity) * Number(unitCost)),
        serialNumbers: [],
      });
    }
  }

  return {
    reference: reference || nextWarehouseTransferNumber(),
    notes: notes || '',
    fromWarehouseId: Number(fromWarehouseId),
    toWarehouseId: Number(toWarehouseId),
    fromWarehouse: fromWarehouse.get ? fromWarehouse.get({ plain: true }) : fromWarehouse,
    toWarehouse: toWarehouse.get ? toWarehouse.get({ plain: true }) : toWarehouse,
    totalQuantity: qty(totalQuantity),
    totalValue: money(totalValue),
    items: normalizedItems,
  };
}

async function executeWarehouseTransferPlan(plan, { req = null, actorId = null, approvalId = null } = {}) {
  const result = await sequelize.transaction(async (transaction) => {
    const checked = await buildWarehouseTransferPlan(plan, { transaction });
    const affected = [];

    for (const item of checked.items) {
      if (item.requiresSerial) {
        for (const serialNumber of item.serialNumbers) {
          const asset = await SerializedAsset.findOne({ where: { serialNumber }, transaction });
          if (!asset || asset.ownerType !== 'estoque' || asset.status !== 'em_estoque' || Number(asset.warehouseId) !== Number(checked.fromWarehouseId)) {
            throw new Error(`Serial ${serialNumber} não está mais disponível no estoque de origem.`);
          }
          const beforeWarehouseId = asset.warehouseId;
          asset.warehouseId = Number(checked.toWarehouseId);
          asset.lastMovementAt = new Date();
          asset.notes = [asset.notes, `Transferência aprovada entre estoques ${checked.fromWarehouse.code} → ${checked.toWarehouse.code}`].filter(Boolean).join(' | ');
          await asset.save({ transaction });
          await StockMovement.create({
            type: 'ajuste',
            materialId: item.materialId,
            assetId: asset.id,
            quantity: 1,
            serialNumber,
            fromOwnerType: 'estoque',
            toOwnerType: 'estoque',
            fromWarehouseId: checked.fromWarehouseId,
            toWarehouseId: checked.toWarehouseId,
            reference: checked.reference,
            notes: checked.notes || `Transferência entre estoques aprovada${approvalId ? ` na aprovação #${approvalId}` : ''}.`,
            createdById: actorId || req?.user?.id || null,
          }, { transaction });
          affected.push({ materialId: item.materialId, serialNumber, beforeWarehouseId, afterWarehouseId: checked.toWarehouseId });
        }
      } else {
        await adjustBalance({ materialId: item.materialId, ownerType: 'estoque', technicianId: null, warehouseId: checked.fromWarehouseId, delta: -Number(item.quantity), transaction });
        await adjustBalance({ materialId: item.materialId, ownerType: 'estoque', technicianId: null, warehouseId: checked.toWarehouseId, delta: Number(item.quantity), transaction });
        await StockMovement.create({
          type: 'ajuste',
          materialId: item.materialId,
          quantity: item.quantity,
          fromOwnerType: 'estoque',
          toOwnerType: 'estoque',
          fromWarehouseId: checked.fromWarehouseId,
          toWarehouseId: checked.toWarehouseId,
          reference: checked.reference,
          notes: checked.notes || `Transferência entre estoques aprovada${approvalId ? ` na aprovação #${approvalId}` : ''}.`,
          createdById: actorId || req?.user?.id || null,
        }, { transaction });
        affected.push({ materialId: item.materialId, quantity: item.quantity, fromWarehouseId: checked.fromWarehouseId, toWarehouseId: checked.toWarehouseId });
      }
    }

    return { ...checked, affectedCount: affected.length, affected };
  });

  return result;
}

module.exports = {
  parseSerials,
  nextWarehouseTransferNumber,
  buildWarehouseTransferPlan,
  executeWarehouseTransferPlan,
};
