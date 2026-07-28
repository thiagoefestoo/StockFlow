const { Op } = require('sequelize');
const {
  ReverseLogisticsEntry,
  ReverseLogisticsItem,
  ReverseLogisticsExit,
  ReverseLogisticsExitItem,
  User,
} = require('../models');
const { money, qty } = require('../utils/number');

function inventoryGroupKey(item) {
  return [
    String(item.code || '').trim().toUpperCase(),
    String(item.description || '').trim().toUpperCase(),
    String(item.unit || 'un').trim().toLowerCase(),
    Number(item.unitCost || 0).toFixed(2),
    item.serialNumber ? 'serial' : 'quantity',
  ].join('|');
}

function groupReverseInventory(rows = []) {
  const groups = new Map();

  for (const row of rows) {
    const data = row.toJSON ? row.toJSON() : row;
    const key = inventoryGroupKey(data);
    if (!groups.has(key)) {
      groups.set(key, {
        inventoryKey: key,
        code: data.code,
        description: data.description,
        unit: data.unit || 'un',
        unitCost: Number(data.unitCost || 0),
        condition: data.condition || 'usado',
        requiresSerial: !!data.serialNumber,
        quantity: 0,
        totalValue: 0,
        serials: [],
        itemIds: [],
        firstReceivedAt: data.receivedAt || data.createdAt,
        lastReceivedAt: data.receivedAt || data.createdAt,
      });
    }

    const group = groups.get(key);
    const quantity = Number(data.quantity || 0);
    group.quantity += quantity;
    group.totalValue = money(group.totalValue + quantity * Number(data.unitCost || 0));
    group.itemIds.push(data.id);
    if (data.serialNumber) {
      group.serials.push({
        itemId: data.id,
        serialNumber: data.serialNumber,
        condition: data.condition,
        receivedAt: data.receivedAt || data.createdAt,
        notes: data.notes || null,
      });
    }
    const receivedAt = data.receivedAt || data.createdAt;
    if (receivedAt && (!group.firstReceivedAt || new Date(receivedAt) < new Date(group.firstReceivedAt))) group.firstReceivedAt = receivedAt;
    if (receivedAt && (!group.lastReceivedAt || new Date(receivedAt) > new Date(group.lastReceivedAt))) group.lastReceivedAt = receivedAt;
  }

  return Array.from(groups.values())
    .map((group) => ({
      ...group,
      quantity: qty(group.quantity),
      serials: group.serials.sort((a, b) => String(a.serialNumber).localeCompare(String(b.serialNumber), 'pt-BR')),
    }))
    .sort((a, b) => String(a.description).localeCompare(String(b.description), 'pt-BR'));
}

async function reverseWarehouseSnapshot(warehouseId, options = {}) {
  const transaction = options.transaction || null;
  const rows = await ReverseLogisticsItem.findAll({
    where: {
      warehouseId,
      status: 'em_estoque',
      quantity: { [Op.gt]: 0 },
    },
    order: [['description', 'ASC'], ['serialNumber', 'ASC'], ['receivedAt', 'ASC']],
    transaction,
  });
  const inventory = groupReverseInventory(rows);
  const assetCount = rows.filter((row) => !!row.serialNumber).length;
  const consumableLines = inventory.filter((group) => !group.requiresSerial).length;
  const totalValue = money(rows.reduce((sum, row) => sum + Number(row.quantity || 0) * Number(row.unitCost || 0), 0));
  const totalQuantity = qty(rows.reduce((sum, row) => sum + Number(row.quantity || 0), 0));

  return {
    hasItems: rows.length > 0,
    rows,
    inventory,
    assetCount,
    consumableLines,
    totalValue,
    totalQuantity,
  };
}

function buildReverseBi(snapshot, entries, exits) {
  const receivedQuantity = qty(entries.reduce((sum, row) => sum + Number(row.totalQuantity || 0), 0));
  const receivedValue = money(entries.reduce((sum, row) => sum + Number(row.totalValue || 0), 0));
  const exitedQuantity = qty(exits.reduce((sum, row) => sum + Number(row.totalQuantity || 0), 0));
  const exitedValue = money(exits.reduce((sum, row) => sum + Number(row.totalValue || 0), 0));
  const lastEntryAt = entries[0]?.receivedAt || entries[0]?.createdAt || null;
  const lastExitAt = exits[0]?.createdAt || null;
  const lastMovementAt = [lastEntryAt, lastExitAt]
    .filter(Boolean)
    .sort((a, b) => new Date(b) - new Date(a))[0] || null;

  return {
    totalValue: snapshot.totalValue,
    totalQuantity: snapshot.totalQuantity,
    assetCount: snapshot.assetCount,
    consumableLines: snapshot.consumableLines,
    incomingEntries: entries.length,
    reverseOutgoingMovements: exits.length,
    receivedQuantity,
    receivedValue,
    exitedQuantity,
    exitedValue,
    lastMovementAt,
  };
}

async function reverseWarehouseDetails(warehouseId) {
  const [snapshot, entries, exits] = await Promise.all([
    reverseWarehouseSnapshot(warehouseId),
    ReverseLogisticsEntry.findAll({
      where: { warehouseId },
      attributes: { exclude: ['proofAttachmentData'] },
      include: [{ model: User, as: 'createdBy', attributes: ['id', 'name', 'email', 'role'] }],
      order: [['receivedAt', 'DESC'], ['createdAt', 'DESC']],
      limit: 500,
    }),
    ReverseLogisticsExit.findAll({
      where: { warehouseId },
      include: [
        { model: ReverseLogisticsExitItem, as: 'items' },
        { model: User, as: 'createdBy', attributes: ['id', 'name', 'email', 'role'] },
      ],
      order: [['createdAt', 'DESC']],
      limit: 500,
    }),
  ]);

  return {
    inventory: snapshot.inventory,
    entries,
    exits,
    bi: buildReverseBi(snapshot, entries, exits),
  };
}

async function reverseWarehouseExportDetails(warehouseId) {
  const [snapshot, entries, exits] = await Promise.all([
    reverseWarehouseSnapshot(warehouseId),
    ReverseLogisticsEntry.findAll({
      where: { warehouseId },
      attributes: { exclude: ['proofAttachmentData'] },
      include: [
        { model: ReverseLogisticsItem, as: 'items' },
        { model: User, as: 'createdBy', attributes: ['id', 'name', 'email', 'role'] },
      ],
      order: [['receivedAt', 'DESC'], ['createdAt', 'DESC']],
    }),
    ReverseLogisticsExit.findAll({
      where: { warehouseId },
      include: [
        { model: ReverseLogisticsExitItem, as: 'items' },
        { model: User, as: 'createdBy', attributes: ['id', 'name', 'email', 'role'] },
      ],
      order: [['createdAt', 'DESC']],
    }),
  ]);

  return {
    inventory: snapshot.inventory,
    entries,
    exits,
    bi: buildReverseBi(snapshot, entries, exits),
  };
}

module.exports = {
  groupReverseInventory,
  reverseWarehouseSnapshot,
  reverseWarehouseDetails,
  reverseWarehouseExportDetails,
};
