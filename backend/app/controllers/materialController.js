const { Material, StockBalance, SerializedAsset } = require('../models');
const { crudController } = require('./crudHelpers');
const asyncHandler = require('../utils/asyncHandler');
const { ok } = require('../utils/response');

const base = crudController(Material, 'Material');

exports.list = asyncHandler(async (req, res) => {
  const records = await Material.findAll({ order: [['name', 'ASC']] });
  const enriched = [];
  for (const material of records) {
    const mainBalance = await StockBalance.findOne({ where: { materialId: material.id, ownerType: 'estoque', technicianId: null } });
    const assets = await SerializedAsset.count({ where: { materialId: material.id, ownerType: 'estoque' } });
    enriched.push({ ...material.toJSON(), mainStock: material.requiresSerial ? assets : Number(mainBalance?.quantity || 0) });
  }
  return ok(res, enriched);
});
exports.get = base.get;
exports.create = base.create;
exports.update = base.update;
