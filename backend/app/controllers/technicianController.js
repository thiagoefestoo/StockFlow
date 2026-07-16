const { Op } = require('sequelize');
const {
  Technician,
  ContractorCompany,
  SerializedAsset,
  StockBalance,
  Material,
  Transfer,
  TransferItem,
  ServiceOrder,
  StockMovement,
  User,
} = require('../models');
const { crudController } = require('./crudHelpers');
const asyncHandler = require('../utils/asyncHandler');
const { ok, fail } = require('../utils/response');
const { money, daysBetween } = require('../utils/number');

const base = crudController(Technician, 'Técnico', [ContractorCompany]);

exports.list = asyncHandler(async (req, res) => {
  const technicians = await Technician.findAll({ include: [ContractorCompany], order: [['name', 'ASC']] });
  const data = [];
  for (const technician of technicians) {
    const assetCount = await SerializedAsset.count({ where: { technicianId: technician.id, ownerType: 'tecnico' } });
    const assetValue = await SerializedAsset.sum('acquisitionCost', { where: { technicianId: technician.id, ownerType: 'tecnico' } });
    const balances = await StockBalance.findAll({ where: { technicianId: technician.id, ownerType: 'tecnico' }, include: [Material] });
    const consumableValue = balances.reduce((sum, row) => sum + Number(row.quantity || 0) * Number(row.Material?.unitCost || 0), 0);
    data.push({
      ...technician.toJSON(),
      assetCount,
      assetValue: money(assetValue),
      consumableValue: money(consumableValue),
      totalCustodyValue: money(Number(assetValue || 0) + consumableValue),
    });
  }
  return ok(res, data);
});

exports.get = base.get;
exports.create = base.create;
exports.update = base.update;

exports.stock = asyncHandler(async (req, res) => {
  const technician = await Technician.findByPk(req.params.id, { include: [ContractorCompany] });
  if (!technician) return fail(res, 404, 'Técnico não encontrado.');

  const assets = await SerializedAsset.findAll({
    where: { technicianId: technician.id, ownerType: 'tecnico' },
    include: [Material],
    order: [['custodyStartedAt', 'ASC']],
  });

  const balances = await StockBalance.findAll({
    where: { technicianId: technician.id, ownerType: 'tecnico' },
    include: [Material],
    order: [[Material, 'name', 'ASC']],
  });

  const movements = await StockMovement.findAll({
    where: { [Op.or]: [{ fromTechnicianId: technician.id }, { toTechnicianId: technician.id }] },
    include: [
      Material,
      SerializedAsset,
      { model: Technician, as: 'fromTechnician' },
      { model: Technician, as: 'toTechnician' },
      { model: User, as: 'createdBy', attributes: ['id', 'name', 'email', 'role'] },
    ],
    order: [['movementAt', 'DESC']],
    limit: 80,
  });

  const transfers = await Transfer.findAll({
    where: { technicianId: technician.id },
    include: [{ model: TransferItem, include: [Material, SerializedAsset] }],
    order: [['deliveredAt', 'DESC']],
    limit: 30,
  });

  const orders = await ServiceOrder.findAll({
    where: { technicianId: technician.id },
    order: [['createdAt', 'DESC']],
    limit: 40,
  });

  const assetsValue = assets.reduce((sum, asset) => sum + Number(asset.acquisitionCost || 0), 0);
  const consumableValue = balances.reduce((sum, row) => sum + Number(row.quantity || 0) * Number(row.Material?.unitCost || 0), 0);
  const grouped = {};
  for (const asset of assets) {
    const key = asset.Material?.name || 'Equipamento serializado';
    grouped[key] = grouped[key] || { material: key, quantity: 0, value: 0, serials: [] };
    grouped[key].quantity += 1;
    grouped[key].value += Number(asset.acquisitionCost || 0);
    grouped[key].serials.push(asset.serialNumber);
  }
  for (const balance of balances) {
    const key = balance.Material?.name || 'Material consumível';
    grouped[key] = grouped[key] || { material: key, quantity: 0, value: 0, serials: [] };
    grouped[key].quantity += Number(balance.quantity || 0);
    grouped[key].value += Number(balance.quantity || 0) * Number(balance.Material?.unitCost || 0);
  }

  return ok(res, {
    technician,
    assets: assets.map((asset) => ({ ...asset.toJSON(), custodyDays: daysBetween(asset.custodyStartedAt) })),
    balances,
    movements,
    transfers,
    orders,
    summary: {
      assetsCount: assets.length,
      consumableLines: balances.length,
      transfersCount: transfers.length,
      ordersCount: orders.length,
      openOrders: orders.filter((order) => ['aberta', 'pendente'].includes(order.status)).length,
      oldCustody: assets.filter((asset) => daysBetween(asset.custodyStartedAt) >= 60).length,
      assetsValue: money(assetsValue),
      consumableValue: money(consumableValue),
      totalValue: money(assetsValue + consumableValue),
    },
    groupedMaterials: Object.values(grouped).map((row) => ({ ...row, value: money(row.value) })),
  });
});
