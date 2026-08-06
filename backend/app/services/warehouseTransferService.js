const sequelize = require('../../config/db');
const {
  Material,
  SerializedAsset,
  StockBalance,
  StockMovement,
  Warehouse,
} = require('../models');
const { money, qty } = require('../utils/number');
const { nextOperationNumber } = require('../utils/operationReference');
const { assertUniqueOperationItems } = require('../utils/itemSelectionValidation');

function parseSerials(value) {
  if (Array.isArray(value)) {
    return value.map((serial) => String(serial || '').trim()).filter(Boolean);
  }

  return String(value || '')
    .split(/\r?\n|,|;|\t/)
    .map((serial) => serial.trim())
    .filter(Boolean);
}

function nextWarehouseTransferNumber() {
  return nextOperationNumber('TE');
}

function preparedPlanInput(input = {}) {
  return Boolean(
    String(input.operationNumber || '').trim()
    || Object.prototype.hasOwnProperty.call(input, 'operationReference'),
  );
}

function operationIdentity(input = {}) {
  const prepared = preparedPlanInput(input);
  const operationNumber = String(
    input.operationNumber
    || (prepared ? input.reference : '')
    || nextWarehouseTransferNumber(),
  ).trim();

  const operationReference = String(
    Object.prototype.hasOwnProperty.call(input, 'operationReference')
      ? input.operationReference
      : (prepared ? '' : input.reference),
  ).trim() || 'Transferência entre estoques';

  return {
    operationNumber,
    operationReference,
  };
}

function lockOption(transaction, enabled) {
  if (!transaction || !enabled) return {};
  return { lock: transaction.LOCK.UPDATE };
}

async function buildWarehouseTransferPlan(input = {}, options = {}) {
  const {
    fromWarehouseId,
    toWarehouseId,
    notes,
    items = [],
  } = input;

  if (!fromWarehouseId || !toWarehouseId) {
    throw new Error('Informe estoque de origem e destino.');
  }

  if (Number(fromWarehouseId) === Number(toWarehouseId)) {
    throw new Error('Origem e destino precisam ser diferentes.');
  }

  if (!Array.isArray(items) || !items.length) {
    throw new Error('Informe ao menos um item para transferir.');
  }

  assertUniqueOperationItems(items);

  const transaction = options.transaction || null;
  const shouldLockInventory = Boolean(options.lockInventory && transaction);
  const isPrepared = preparedPlanInput(input);
  const { operationNumber, operationReference } = operationIdentity(input);

  const [fromWarehouse, toWarehouse] = await Promise.all([
    Warehouse.findByPk(fromWarehouseId, { transaction }),
    Warehouse.findByPk(toWarehouseId, { transaction }),
  ]);

  if (!fromWarehouse || !toWarehouse) {
    throw new Error('Estoque de origem ou destino não encontrado.');
  }

  if (
    String(fromWarehouse.status || '').toLowerCase() !== 'ativo'
    || String(toWarehouse.status || '').toLowerCase() !== 'ativo'
  ) {
    throw new Error('Só é possível transferir entre estoques ativos.');
  }

  if (fromWarehouse.isReverseLogistics || toWarehouse.isReverseLogistics) {
    throw new Error('Estoque de logística reversa não participa de transferências entre estoques.');
  }

  const normalizedItems = [];
  let totalQuantity = 0;
  let totalValue = 0;

  for (const raw of items) {
    const material = await Material.findByPk(raw.materialId, { transaction });

    if (!material) {
      throw new Error('Material não encontrado.');
    }

    if (material.active === false) {
      throw new Error(`O material ${material.name} está inativo.`);
    }

    const snapshotUnitCost = isPrepared && raw.unitCost !== undefined
      ? raw.unitCost
      : material.unitCost;
    const unitCost = money(snapshotUnitCost);

    if (material.requiresSerial) {
      const serialNumbers = parseSerials(raw.serialNumbers);

      if (!serialNumbers.length) {
        throw new Error(`Selecione ao menos um serial de ${material.name}.`);
      }

      const serialDetails = [];

      for (const serialNumber of serialNumbers) {
        const asset = await SerializedAsset.findOne({
          where: {
            serialNumber,
            materialId: material.id,
            warehouseId: Number(fromWarehouseId),
            ownerType: 'estoque',
            status: 'em_estoque',
          },
          transaction,
          ...lockOption(transaction, shouldLockInventory),
        });

        if (!asset) {
          throw new Error(
            `Serial ${serialNumber} não está disponível para ${material.name} no estoque de origem.`,
          );
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
        totalCost: money(
          serialDetails.reduce((sum, asset) => sum + Number(asset.value || 0), 0),
        ),
        serialNumbers,
        serialDetails,
      });

      continue;
    }

    const quantity = qty(raw.quantity);

    if (quantity <= 0) {
      throw new Error(`Quantidade inválida para ${material.name}.`);
    }

    const balance = await StockBalance.findOne({
      where: {
        materialId: material.id,
        ownerType: 'estoque',
        technicianId: null,
        warehouseId: Number(fromWarehouseId),
      },
      transaction,
      ...lockOption(transaction, shouldLockInventory),
    });

    if (!balance || Number(balance.quantity || 0) < Number(quantity)) {
      throw new Error(
        `Saldo insuficiente para ${material.name} no estoque de origem. `
        + `Disponível: ${balance?.quantity || 0}.`,
      );
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

  return {
    reference: operationNumber,
    operationNumber,
    operationReference,
    notes: String(notes || '').trim(),
    fromWarehouseId: Number(fromWarehouseId),
    toWarehouseId: Number(toWarehouseId),
    fromWarehouse: fromWarehouse.get
      ? fromWarehouse.get({ plain: true })
      : fromWarehouse,
    toWarehouse: toWarehouse.get
      ? toWarehouse.get({ plain: true })
      : toWarehouse,
    totalQuantity: qty(totalQuantity),
    totalValue: money(totalValue),
    items: normalizedItems,
  };
}

async function getLockedBalances({
  materialId,
  fromWarehouseId,
  toWarehouseId,
  transaction,
}) {
  await StockBalance.findOrCreate({
    where: {
      materialId,
      ownerType: 'estoque',
      technicianId: null,
      warehouseId: Number(toWarehouseId),
    },
    defaults: {
      quantity: 0,
      warehouseId: Number(toWarehouseId),
    },
    transaction,
  });

  const balances = await StockBalance.findAll({
    where: {
      materialId,
      ownerType: 'estoque',
      technicianId: null,
      warehouseId: [Number(fromWarehouseId), Number(toWarehouseId)],
    },
    order: [['warehouseId', 'ASC'], ['id', 'ASC']],
    transaction,
    lock: transaction.LOCK.UPDATE,
  });

  return {
    sourceBalance: balances.find(
      (balance) => Number(balance.warehouseId) === Number(fromWarehouseId),
    ),
    targetBalance: balances.find(
      (balance) => Number(balance.warehouseId) === Number(toWarehouseId),
    ),
  };
}

async function executeWarehouseTransferPlan(
  plan,
  {
    req = null,
    actorId = null,
    approvalId = null,
    transaction: externalTransaction = null,
  } = {},
) {
  const run = async (transaction) => {
    const checked = await buildWarehouseTransferPlan(plan, {
      transaction,
      lockInventory: true,
    });

    const affected = [];
    const orderedItems = [...checked.items].sort(
      (left, right) => Number(left.materialId) - Number(right.materialId),
    );

    for (const item of orderedItems) {
      if (item.requiresSerial) {
        const orderedSerials = [...item.serialNumbers].sort((left, right) => (
          String(left).localeCompare(String(right), 'pt-BR')
        ));

        for (const serialNumber of orderedSerials) {
          const asset = await SerializedAsset.findOne({
            where: {
              serialNumber,
              materialId: item.materialId,
              warehouseId: Number(checked.fromWarehouseId),
              ownerType: 'estoque',
              status: 'em_estoque',
            },
            transaction,
            lock: transaction.LOCK.UPDATE,
          });

          if (!asset) {
            throw new Error(
              `Serial ${serialNumber} não está mais disponível no estoque de origem.`,
            );
          }

          const beforeWarehouseId = asset.warehouseId;
          asset.warehouseId = Number(checked.toWarehouseId);
          asset.lastMovementAt = new Date();
          asset.notes = [
            asset.notes,
            `Transferência entre estoques ${checked.fromWarehouse.code} → ${checked.toWarehouse.code}`,
            `Operação ${checked.operationNumber}`,
            `Referência ${checked.operationReference}`,
          ].filter(Boolean).join(' | ');

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
            reference: checked.operationNumber,
            notes: [
              'Transferência entre estoques.',
              `Referência: ${checked.operationReference}.`,
              checked.notes || null,
              approvalId ? `Aprovação #${approvalId}.` : null,
            ].filter(Boolean).join(' '),
            createdById: actorId || req?.user?.id || null,
          }, { transaction });

          affected.push({
            materialId: item.materialId,
            serialNumber,
            beforeWarehouseId,
            afterWarehouseId: checked.toWarehouseId,
          });
        }

        continue;
      }

      const { sourceBalance, targetBalance } = await getLockedBalances({
        materialId: item.materialId,
        fromWarehouseId: checked.fromWarehouseId,
        toWarehouseId: checked.toWarehouseId,
        transaction,
      });

      if (
        !sourceBalance
        || Number(sourceBalance.quantity || 0) < Number(item.quantity)
      ) {
        throw new Error(
          `Saldo insuficiente para ${item.materialName} no estoque de origem. `
          + `Disponível: ${sourceBalance?.quantity || 0}.`,
        );
      }

      if (!targetBalance) {
        throw new Error(
          `Não foi possível preparar o saldo de ${item.materialName} no estoque de destino.`,
        );
      }

      sourceBalance.quantity = qty(
        Number(sourceBalance.quantity || 0) - Number(item.quantity),
      );
      targetBalance.quantity = qty(
        Number(targetBalance.quantity || 0) + Number(item.quantity),
      );

      await sourceBalance.save({ transaction });
      await targetBalance.save({ transaction });

      await StockMovement.create({
        type: 'ajuste',
        materialId: item.materialId,
        quantity: item.quantity,
        fromOwnerType: 'estoque',
        toOwnerType: 'estoque',
        fromWarehouseId: checked.fromWarehouseId,
        toWarehouseId: checked.toWarehouseId,
        reference: checked.operationNumber,
        notes: [
          'Transferência entre estoques.',
          `Referência: ${checked.operationReference}.`,
          checked.notes || null,
          approvalId ? `Aprovação #${approvalId}.` : null,
        ].filter(Boolean).join(' '),
        createdById: actorId || req?.user?.id || null,
      }, { transaction });

      affected.push({
        materialId: item.materialId,
        quantity: item.quantity,
        fromWarehouseId: checked.fromWarehouseId,
        toWarehouseId: checked.toWarehouseId,
      });
    }

    return {
      ...checked,
      affectedCount: affected.length,
      affected,
    };
  };

  if (externalTransaction) {
    return run(externalTransaction);
  }

  return sequelize.transaction(run);
}

module.exports = {
  parseSerials,
  nextWarehouseTransferNumber,
  buildWarehouseTransferPlan,
  executeWarehouseTransferPlan,
};
