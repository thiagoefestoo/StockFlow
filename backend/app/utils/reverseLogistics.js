const { Op } = require('sequelize');

async function reverseWarehouseIds(options = {}) {
  const { Warehouse } = require('../models');
  const rows = await Warehouse.findAll({
    where: { isReverseLogistics: true },
    attributes: ['id'],
    transaction: options.transaction || null,
  });
  return rows.map((row) => Number(row.id)).filter((id) => Number.isFinite(id));
}

function warehouseOutsideReverse(ids = [], field = 'warehouseId') {
  if (!ids.length) return {};
  return {
    [Op.or]: [
      { [field]: null },
      { [field]: { [Op.notIn]: ids } },
    ],
  };
}

function movementOutsideReverse(ids = []) {
  if (!ids.length) return {};
  return {
    [Op.and]: [
      {
        [Op.or]: [
          { fromWarehouseId: null },
          { fromWarehouseId: { [Op.notIn]: ids } },
        ],
      },
      {
        [Op.or]: [
          { toWarehouseId: null },
          { toWarehouseId: { [Op.notIn]: ids } },
        ],
      },
    ],
  };
}

function isReverseWarehouse(warehouse) {
  return warehouse?.isReverseLogistics === true || warehouse?.isReverseLogistics === 1 || warehouse?.isReverseLogistics === '1';
}

module.exports = {
  reverseWarehouseIds,
  warehouseOutsideReverse,
  movementOutsideReverse,
  isReverseWarehouse,
};
