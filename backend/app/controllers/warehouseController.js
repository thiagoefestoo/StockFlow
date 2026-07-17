const sequelize = require('../../config/db');
const { Op } = require('sequelize');
const {
  Warehouse,
  User,
  Technician,
  StockBalance,
  SerializedAsset,
  Material,
  StockMovement,
  ApprovalRequest,
} = require('../models');
const asyncHandler = require('../utils/asyncHandler');
const { ok, created, fail } = require('../utils/response');
const { writeAudit } = require('../services/auditService');
const { adjustBalance } = require('../services/stockService');
const { money } = require('../utils/number');
const { buildWarehouseTransferPlan } = require('../services/warehouseTransferService');
const {
  warehouseListWhere,
  assertWarehouseAccess,
  stockWhereForUser,
  movementWhereForUser,
  isPrivileged,
} = require('../utils/warehouseAccess');

function parseSerials(value) {
  if (Array.isArray(value)) return value.map((s) => String(s).trim()).filter(Boolean);
  return String(value || '').split(/\n|,|;/).map((s) => s.trim()).filter(Boolean);
}

function nextWarehouseTransferNumber() {
  const now = new Date();
  const stamp = `${now.getFullYear()}${String(now.getMonth() + 1).padStart(2, '0')}${String(now.getDate()).padStart(2, '0')}-${String(now.getHours()).padStart(2, '0')}${String(now.getMinutes()).padStart(2, '0')}${String(now.getSeconds()).padStart(2, '0')}`;
  return `TE-${stamp}`;
}

async function warehouseStats(warehouse) {
  const [balances, assets] = await Promise.all([
    StockBalance.findAll({ where: { warehouseId: warehouse.id, ownerType: 'estoque' }, include: [Material] }),
    SerializedAsset.findAll({ where: { warehouseId: warehouse.id, ownerType: 'estoque' }, include: [Material] }),
  ]);
  const consumableValue = balances.reduce((s, b) => s + Number(b.quantity || 0) * Number(b.Material?.unitCost || 0), 0);
  const assetValue = assets.reduce((s, a) => s + Number(a.acquisitionCost || a.Material?.unitCost || 0), 0);
  return { consumableLines: balances.length, assetCount: assets.length, totalValue: money(consumableValue + assetValue) };
}

exports.list = asyncHandler(async (req, res) => {
  const where = { ...warehouseListWhere(req.user) };
  if (req.query.status) where.status = req.query.status;
  if (req.query.q) {
    const q = `%${req.query.q}%`;
    where[Op.or] = [
      { name: { [Op.iLike]: q } },
      { code: { [Op.iLike]: q } },
      { city: { [Op.iLike]: q } },
      { region: { [Op.iLike]: q } },
    ];
  }
  const warehouses = await Warehouse.findAll({ where, order: [['status', 'ASC'], ['city', 'ASC'], ['name', 'ASC']], limit: 500 });
  const withStats = [];
  for (const wh of warehouses) {
    withStats.push({ ...wh.toJSON(), ...(await warehouseStats(wh)) });
  }
  return ok(res, withStats);
});

exports.get = asyncHandler(async (req, res) => {
  const warehouse = await Warehouse.findByPk(req.params.id);
  if (!warehouse) return fail(res, 404, 'Estoque não encontrado.');
  try { assertWarehouseAccess(req.user, warehouse.id); } catch (error) { return fail(res, error.statusCode || 403, error.message); }

  const movementScope = movementWhereForUser(req.user, warehouse.id);
  const [balances, assets, users, technicians, movements] = await Promise.all([
    StockBalance.findAll({ where: { warehouseId: warehouse.id, ownerType: 'estoque' }, include: [Material], order: [[Material, 'name', 'ASC']] }),
    SerializedAsset.findAll({ where: { warehouseId: warehouse.id, ownerType: 'estoque' }, include: [Material], order: [['serialNumber', 'ASC']], limit: 1500 }),
    User.findAll({ where: { warehouseIds: { [Op.contains]: [warehouse.id] } }, attributes: ['id', 'name', 'email', 'role', 'status', 'warehouseIds', 'approvalLimit'], order: [['role', 'ASC'], ['name', 'ASC']] }).catch(() => []),
    Technician.findAll({ where: { defaultWarehouseId: warehouse.id }, limit: 500, order: [['name', 'ASC']] }),
    StockMovement.findAll({
      where: movementScope || { [Op.or]: [{ fromWarehouseId: warehouse.id }, { toWarehouseId: warehouse.id }] },
      include: [
        Material,
        SerializedAsset,
        { model: Warehouse, as: 'fromWarehouse' },
        { model: Warehouse, as: 'toWarehouse' },
        { model: User, as: 'createdBy', attributes: ['id', 'name', 'email', 'role'] },
        { model: Technician, as: 'toTechnician' },
        { model: Technician, as: 'fromTechnician' },
      ],
      order: [['movementAt', 'DESC']],
      limit: 500,
    }),
  ]);

  const consumableValue = balances.reduce((s, b) => s + Number(b.quantity || 0) * Number(b.Material?.unitCost || 0), 0);
  const assetValue = assets.reduce((s, a) => s + Number(a.acquisitionCost || a.Material?.unitCost || 0), 0);
  const incoming = movements.filter((m) => Number(m.toWarehouseId) === Number(warehouse.id));
  const outgoing = movements.filter((m) => Number(m.fromWarehouseId) === Number(warehouse.id));
  const toTechnicians = movements.filter((m) => m.toOwnerType === 'tecnico' || m.toTechnicianId);
  const returned = movements.filter((m) => m.type === 'retorno_tecnico');

  return ok(res, {
    warehouse,
    balances,
    assets,
    users,
    technicians,
    movements,
    bi: {
      totalValue: money(consumableValue + assetValue),
      consumableValue: money(consumableValue),
      assetValue: money(assetValue),
      assetCount: assets.length,
      consumableLines: balances.length,
      linkedUsers: users.length,
      linkedTechnicians: technicians.length,
      incomingMovements: incoming.length,
      outgoingMovements: outgoing.length,
      technicianTransfers: toTechnicians.length,
      returns: returned.length,
      lastMovementAt: movements[0]?.movementAt || null,
    },
  });
});

exports.create = asyncHandler(async (req, res) => {
  const { name, code, region, city, state, address, responsibleName, status = 'ativo', approvalLimit = 0, notes } = req.body;
  if (!name || !code) return fail(res, 400, 'Nome e número/código do estoque são obrigatórios.');
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

exports.transferStock = asyncHandler(async (req, res) => {
  const { fromWarehouseId, toWarehouseId, reference, notes, items = [] } = req.body;

  try {
    // Administrador e supervisor podem solicitar entre quaisquer estoques ativos.
    // Estoquista pode solicitar reposição para estoque ao qual tem acesso, mas a execução só ocorre após aprovação do admin.
    if (!isPrivileged(req.user)) {
      assertWarehouseAccess(req.user, toWarehouseId, 'Você só pode solicitar reposição para um estoque vinculado ao seu usuário.');
    }
  } catch (error) {
    return fail(res, error.statusCode || 403, error.message);
  }

  let plan;
  try {
    plan = await buildWarehouseTransferPlan({ fromWarehouseId, toWarehouseId, reference, notes, items });
  } catch (error) {
    return fail(res, 400, error.message);
  }

  const approval = await ApprovalRequest.create({
    workflowCode: plan.reference,
    entityType: 'warehouse_transfer',
    entityId: plan.reference,
    title: `Aprovar transferência ${plan.reference}`,
    description: `Transferência de ${plan.fromWarehouse.name} para ${plan.toWarehouse.name}.`,
    status: 'pendente',
    priority: Number(plan.totalValue || 0) >= 500 ? 'alta' : 'media',
    amount: plan.totalValue,
    requestedById: req.user.id,
    payload: {
      ...plan,
      requestedByName: req.user.name,
      requestedByEmail: req.user.email,
      approvalRequired: true,
      approvalReason: 'Transferência entre estoques exige aprovação do administrador antes de movimentar saldo.',
    },
  });

  await writeAudit({
    req,
    action: 'warehouse_transfer_requested',
    entity: 'ApprovalRequest',
    entityId: approval.id,
    message: `Solicitada aprovação para transferência ${plan.reference} de ${plan.fromWarehouse.name} para ${plan.toWarehouse.name}.`,
    afterData: approval.toJSON(),
  });

  return created(res, { approval, plan }, 'Transferência enviada para aprovação do administrador. O saldo só será movimentado após aprovação.');
});
