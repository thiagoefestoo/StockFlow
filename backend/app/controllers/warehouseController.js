const { Op } = require('sequelize');
const { Warehouse, User, Technician, StockBalance, SerializedAsset, Material } = require('../models');
const asyncHandler = require('../utils/asyncHandler');
const { ok, created, fail } = require('../utils/response');
const { writeAudit } = require('../services/auditService');

function userWarehouseFilter(user) {
  if (!user || user.role === 'admin' || user.role === 'supervisor') return {};
  const ids = Array.isArray(user.warehouseIds) ? user.warehouseIds.filter(Boolean) : [];
  if (ids.length) return { id: ids };
  const cities = Array.isArray(user.cityAccess) ? user.cityAccess.filter(Boolean) : [];
  if (cities.length) return { city: { [Op.in]: cities } };
  return { id: -1 };
}

exports.list = asyncHandler(async (req, res) => {
  const where = { ...userWarehouseFilter(req.user) };
  if (req.query.status) where.status = req.query.status;
  if (req.query.q) {
    const q = `%${req.query.q}%`;
    where[Op.or] = [{ name: { [Op.iLike]: q } }, { code: { [Op.iLike]: q } }, { city: { [Op.iLike]: q } }, { region: { [Op.iLike]: q } }];
  }
  const warehouses = await Warehouse.findAll({ where, order: [['status', 'ASC'], ['name', 'ASC']], limit: 500 });
  const withStats = [];
  for (const wh of warehouses) {
    const [balances, assets] = await Promise.all([
      StockBalance.findAll({ where: { warehouseId: wh.id, ownerType: 'estoque' }, include: [Material] }),
      SerializedAsset.findAll({ where: { warehouseId: wh.id, ownerType: 'estoque' }, include: [Material] }),
    ]);
    const consumableValue = balances.reduce((s, b) => s + Number(b.quantity || 0) * Number(b.Material?.unitCost || 0), 0);
    const assetValue = assets.reduce((s, a) => s + Number(a.acquisitionCost || a.Material?.unitCost || 0), 0);
    withStats.push({ ...wh.toJSON(), consumableLines: balances.length, assetCount: assets.length, totalValue: consumableValue + assetValue });
  }
  return ok(res, withStats);
});

exports.get = asyncHandler(async (req, res) => {
  const warehouse = await Warehouse.findByPk(req.params.id);
  if (!warehouse) return fail(res, 404, 'Estoque não encontrado.');
  const [balances, assets, users, technicians] = await Promise.all([
    StockBalance.findAll({ where: { warehouseId: warehouse.id }, include: [Material] }),
    SerializedAsset.findAll({ where: { warehouseId: warehouse.id }, include: [Material], order: [['serialNumber', 'ASC']], limit: 1000 }),
    User.findAll({ where: { warehouseIds: { [Op.contains]: [warehouse.id] } }, attributes: ['id', 'name', 'email', 'role'] }).catch(() => []),
    Technician.findAll({ where: { defaultWarehouseId: warehouse.id }, limit: 200 }),
  ]);
  return ok(res, { warehouse, balances, assets, users, technicians });
});

exports.create = asyncHandler(async (req, res) => {
  const { name, code, region, city, state, address, responsibleName, status = 'ativo', approvalLimit = 0, notes } = req.body;
  if (!name || !code) return fail(res, 400, 'Nome e código do estoque são obrigatórios.');
  const record = await Warehouse.create({ name, code: String(code).toUpperCase().trim(), region, city, state, address, responsibleName, status, approvalLimit, notes });
  await writeAudit({ req, action: 'create', entity: 'Warehouse', entityId: record.id, message: `Estoque ${record.name} criado.`, afterData: record.toJSON() });
  return created(res, record, 'Estoque criado.');
});

exports.update = asyncHandler(async (req, res) => {
  const record = await Warehouse.findByPk(req.params.id);
  if (!record) return fail(res, 404, 'Estoque não encontrado.');
  const before = record.toJSON();
  const fields = ['name', 'code', 'region', 'city', 'state', 'address', 'responsibleName', 'status', 'approvalLimit', 'notes'];
  fields.forEach((field) => { if (req.body[field] !== undefined) record[field] = req.body[field]; });
  if (record.code) record.code = String(record.code).toUpperCase().trim();
  await record.save();
  await writeAudit({ req, action: 'update', entity: 'Warehouse', entityId: record.id, message: `Estoque ${record.name} atualizado.`, beforeData: before, afterData: record.toJSON() });
  return ok(res, record, 'Estoque atualizado.');
});
