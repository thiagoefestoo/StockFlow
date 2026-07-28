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
const { assertUniqueOperationItems } = require('../utils/itemSelectionValidation');
const { money } = require('../utils/number');
const { normalizeBoolean } = require('../utils/booleans');
const { buildWarehouseTransferPlan } = require('../services/warehouseTransferService');
const { reverseWarehouseSnapshot, reverseWarehouseDetails, reverseWarehouseExportDetails } = require('../services/reverseLogisticsService');
const {
  warehouseListWhere,
  assertWarehouseAccess,
  movementWhereForUser,
  isPrivileged,
} = require('../utils/warehouseAccess');

function nextWarehouseDeleteNumber() {
  const now = new Date();
  const stamp = `${now.getFullYear()}${String(now.getMonth() + 1).padStart(2, '0')}${String(now.getDate()).padStart(2, '0')}-${String(now.getHours()).padStart(2, '0')}${String(now.getMinutes()).padStart(2, '0')}${String(now.getSeconds()).padStart(2, '0')}`;
  return `EXE-${stamp}`;
}

async function warehouseInventorySnapshot(warehouseId, options = {}) {
  const transaction = options.transaction || null;
  const [balances, assets] = await Promise.all([
    StockBalance.findAll({ where: { warehouseId, ownerType: 'estoque' }, include: [Material], transaction }),
    SerializedAsset.findAll({ where: { warehouseId, ownerType: 'estoque' }, include: [Material], transaction }),
  ]);

  const positiveBalances = balances.filter((balance) => Number(balance.quantity || 0) > 0);
  const assetValue = assets.reduce((sum, asset) => sum + Number(asset.acquisitionCost || asset.Material?.unitCost || 0), 0);
  const consumableValue = positiveBalances.reduce((sum, balance) => sum + Number(balance.quantity || 0) * Number(balance.Material?.unitCost || 0), 0);

  return {
    hasItems: positiveBalances.length > 0 || assets.length > 0,
    consumableLines: positiveBalances.length,
    assetCount: assets.length,
    totalValue: money(assetValue + consumableValue),
    balances: positiveBalances.map((balance) => ({
      materialId: balance.materialId,
      materialName: balance.Material?.name || 'Material',
      category: balance.Material?.category || '-',
      quantity: Number(balance.quantity || 0),
      unit: balance.Material?.unit || '',
      unitCost: Number(balance.Material?.unitCost || 0),
      totalCost: money(Number(balance.quantity || 0) * Number(balance.Material?.unitCost || 0)),
    })),
    assets: assets.map((asset) => ({
      assetId: asset.id,
      materialId: asset.materialId,
      materialName: asset.Material?.name || 'Equipamento',
      category: asset.Material?.category || '-',
      serialNumber: asset.serialNumber,
      status: asset.status,
      value: Number(asset.acquisitionCost || asset.Material?.unitCost || 0),
    })),
  };
}

async function warehouseStats(warehouse) {
  if (warehouse.isReverseLogistics) {
    return {
      consumableLines: 0,
      assetCount: 0,
      totalValue: null,
      reverseStatsRestrictedToDetails: true,
    };
  }

  const snapshot = await warehouseInventorySnapshot(warehouse.id);
  return {
    consumableLines: snapshot.consumableLines,
    assetCount: snapshot.assetCount,
    totalValue: snapshot.totalValue,
  };
}

exports.list = asyncHandler(async (req, res) => {
  const where = { ...warehouseListWhere(req.user) };
  if (req.query.status) where.status = req.query.status;
  if (req.query.operationalOnly === 'true') where.isReverseLogistics = false;
  if (req.query.reverseOnly === 'true') where.isReverseLogistics = true;
  if (req.query.q) {
    const q = `%${req.query.q}%`;
    where[Op.or] = [
      { name: { [Op.iLike]: q } },
      { code: { [Op.iLike]: q } },
      { city: { [Op.iLike]: q } },
      { region: { [Op.iLike]: q } },
    ];
  }
  const warehouses = await Warehouse.findAll({ where, order: [['isReverseLogistics', 'ASC'], ['status', 'ASC'], ['city', 'ASC'], ['name', 'ASC']], limit: 500 });
  const withStats = [];
  for (const warehouse of warehouses) {
    withStats.push({ ...warehouse.toJSON(), ...(await warehouseStats(warehouse)) });
  }
  return ok(res, withStats);
});

exports.get = asyncHandler(async (req, res) => {
  const warehouse = await Warehouse.findByPk(req.params.id);
  if (!warehouse) return fail(res, 404, 'Estoque não encontrado.');
  try { assertWarehouseAccess(req.user, warehouse.id); } catch (error) { return fail(res, error.statusCode || 403, error.message); }

  if (warehouse.isReverseLogistics) {
    const [details, users] = await Promise.all([
      reverseWarehouseDetails(warehouse.id),
      User.findAll({
        where: { warehouseIds: { [Op.contains]: [warehouse.id] } },
        attributes: ['id', 'name', 'email', 'role', 'status', 'warehouseIds', 'approvalLimit'],
        order: [['role', 'ASC'], ['name', 'ASC']],
      }).catch(() => []),
    ]);

    return ok(res, {
      warehouse,
      users,
      technicians: [],
      balances: [],
      assets: [],
      movements: [],
      reverseInventory: details.inventory,
      reverseEntries: details.entries,
      reverseExits: details.exits,
      bi: {
        ...details.bi,
        linkedUsers: users.length,
        linkedTechnicians: 0,
        incomingMovements: details.bi.incomingEntries,
        outgoingMovements: details.bi.reverseOutgoingMovements,
        technicianTransfers: 0,
        returns: 0,
      },
    });
  }

  const movementScope = movementWhereForUser(req.user, warehouse.id);
  const [balancesRaw, assets, users, technicians, movements] = await Promise.all([
    StockBalance.findAll({ where: { warehouseId: warehouse.id, ownerType: 'estoque' }, include: [Material], order: [[Material, 'name', 'ASC']] }),
    SerializedAsset.findAll({ where: { warehouseId: warehouse.id, ownerType: 'estoque' }, include: [Material], order: [['serialNumber', 'ASC']], limit: 2500 }),
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
      limit: 800,
    }),
  ]);

  const balances = balancesRaw.filter((row) => Number(row.quantity || 0) > 0);
  const consumableValue = balances.reduce((sum, row) => sum + Number(row.quantity || 0) * Number(row.Material?.unitCost || 0), 0);
  const assetValue = assets.reduce((sum, asset) => sum + Number(asset.acquisitionCost || asset.Material?.unitCost || 0), 0);
  const incoming = movements.filter((movement) => Number(movement.toWarehouseId) === Number(warehouse.id));
  const outgoing = movements.filter((movement) => Number(movement.fromWarehouseId) === Number(warehouse.id));
  const toTechnicians = movements.filter((movement) => movement.toOwnerType === 'tecnico' || movement.toTechnicianId);
  const returned = movements.filter((movement) => movement.type === 'retorno_tecnico');

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
      reverseOutgoingMovements: 0,
      lastMovementAt: movements[0]?.movementAt || null,
    },
  });
});

exports.reverseExport = asyncHandler(async (req, res) => {
  const warehouse = await Warehouse.findByPk(req.params.id);
  if (!warehouse) return fail(res, 404, 'Estoque não encontrado.');
  if (!warehouse.isReverseLogistics) return fail(res, 400, 'A exportação isolada é exclusiva de estoque de logística reversa.');
  try { assertWarehouseAccess(req.user, warehouse.id); } catch (error) { return fail(res, error.statusCode || 403, error.message); }

  const details = await reverseWarehouseExportDetails(warehouse.id);
  return ok(res, {
    warehouse,
    reverseInventory: details.inventory,
    reverseEntries: details.entries,
    reverseExits: details.exits,
    bi: details.bi,
  });
});

exports.create = asyncHandler(async (req, res) => {
  const { name, code, region, city, state, address, responsibleName, status = 'ativo', approvalLimit = 0, notes } = req.body;
  if (!name || !code) return fail(res, 400, 'Nome e número/código do estoque são obrigatórios.');
  const isReverseLogistics = normalizeBoolean(req.body.isReverseLogistics, false);
  const record = await Warehouse.create({
    name,
    code: String(code).toUpperCase().trim(),
    region,
    city,
    state,
    address,
    responsibleName,
    status,
    approvalLimit: isReverseLogistics ? 0 : approvalLimit,
    isReverseLogistics,
    notes,
  });
  await writeAudit({
    req,
    action: 'create',
    entity: 'Warehouse',
    entityId: record.id,
    message: `${isReverseLogistics ? 'Estoque de logística reversa' : 'Estoque'} ${record.name} criado.`,
    afterData: record.toJSON(),
  });
  return created(res, record, isReverseLogistics ? 'Estoque de logística reversa criado.' : 'Estoque criado.');
});

exports.update = asyncHandler(async (req, res) => {
  const record = await Warehouse.findByPk(req.params.id);
  if (!record) return fail(res, 404, 'Estoque não encontrado.');
  const before = record.toJSON();
  if (req.body.isReverseLogistics !== undefined) {
    const requestedType = normalizeBoolean(req.body.isReverseLogistics, record.isReverseLogistics);
    if (requestedType !== Boolean(record.isReverseLogistics)) {
      return fail(res, 400, 'O tipo do estoque é definido na criação e não pode ser alterado depois. Crie uma nova unidade com o tipo correto.');
    }
  }
  const fields = ['name', 'code', 'region', 'city', 'state', 'address', 'responsibleName', 'status', 'approvalLimit', 'notes'];
  fields.forEach((field) => { if (req.body[field] !== undefined) record[field] = req.body[field]; });
  if (record.isReverseLogistics) record.approvalLimit = 0;
  if (record.code) record.code = String(record.code).toUpperCase().trim();
  await record.save();
  await writeAudit({ req, action: 'update', entity: 'Warehouse', entityId: record.id, message: `Estoque ${record.name} atualizado.`, beforeData: before, afterData: record.toJSON() });
  return ok(res, record, 'Estoque atualizado.');
});

exports.requestDelete = asyncHandler(async (req, res) => {
  const warehouse = await Warehouse.findByPk(req.params.id);
  if (!warehouse) return fail(res, 404, 'Estoque não encontrado.');

  const inventory = warehouse.isReverseLogistics
    ? await reverseWarehouseSnapshot(warehouse.id)
    : await warehouseInventorySnapshot(warehouse.id);
  if (inventory.hasItems) {
    const suggestion = warehouse.isReverseLogistics
      ? 'Registre a saída dos materiais para o fornecedor antes de pedir a exclusão.'
      : 'Use Transferir entre estoques para mover o saldo e os seriais para outra unidade.';
    return fail(res, 409, `Não é possível solicitar exclusão: este estoque ainda possui materiais ou equipamentos. ${suggestion}`, { data: { inventory, suggestion } });
  }

  const pending = await ApprovalRequest.findOne({ where: { entityType: 'warehouse_delete', entityId: String(warehouse.id), status: 'pendente' } });
  if (pending) return fail(res, 409, 'Já existe uma solicitação de exclusão pendente para este estoque.');

  const approvalCode = nextWarehouseDeleteNumber();
  const approval = await ApprovalRequest.create({
    workflowCode: approvalCode,
    entityType: 'warehouse_delete',
    entityId: String(warehouse.id),
    title: `Aprovar exclusão do estoque ${warehouse.code}`,
    description: `Exclusão solicitada para o estoque vazio ${warehouse.name} (${warehouse.city || warehouse.region || warehouse.code}).`,
    status: 'pendente',
    priority: 'alta',
    amount: 0,
    requestedById: req.user.id,
    payload: {
      operation: 'warehouse_delete',
      approvalRequired: true,
      approvalReason: 'A exclusão de estoque exige aprovação do administrador e só pode ocorrer quando o estoque estiver vazio.',
      warehouseId: warehouse.id,
      warehouse: warehouse.get({ plain: true }),
      inventory,
      requestedByName: req.user.name,
      requestedByEmail: req.user.email,
      notes: req.body?.notes || '',
    },
  });

  await writeAudit({ req, action: 'warehouse_delete_requested', entity: 'ApprovalRequest', entityId: approval.id, message: `Solicitada aprovação para exclusão do estoque ${warehouse.name}.`, afterData: approval.toJSON() });
  return created(res, { approval, inventory }, 'Solicitação de exclusão enviada para aprovação do administrador.');
});

exports.transferStock = asyncHandler(async (req, res) => {
  const { fromWarehouseId, toWarehouseId, items = [] } = req.body;
  try { assertUniqueOperationItems(items); } catch (error) { return fail(res, error.statusCode || 400, error.message); }

  const [fromWarehouse, toWarehouse] = await Promise.all([
    Warehouse.findByPk(fromWarehouseId),
    Warehouse.findByPk(toWarehouseId),
  ]);
  if (!fromWarehouse || !toWarehouse) return fail(res, 404, 'Estoque de origem ou destino não encontrado.');
  if (fromWarehouse.isReverseLogistics || toWarehouse.isReverseLogistics) {
    return fail(res, 400, 'Estoque de logística reversa não participa de transferências. Use apenas entrada e saída para fornecedor.');
  }

  try {
    if (!isPrivileged(req.user)) assertWarehouseAccess(req.user, toWarehouseId, 'Você só pode solicitar reposição para um estoque vinculado ao seu usuário.');
  } catch (error) {
    return fail(res, error.statusCode || 403, error.message);
  }

  let plan;
  try { plan = await buildWarehouseTransferPlan(req.body); } catch (error) { return fail(res, 400, error.message); }

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
    payload: { ...plan, requestedByName: req.user.name, requestedByEmail: req.user.email, approvalRequired: true, approvalReason: 'Transferência entre estoques exige aprovação do administrador antes de movimentar saldo.' },
  });

  await writeAudit({ req, action: 'warehouse_transfer_requested', entity: 'ApprovalRequest', entityId: approval.id, message: `Solicitada aprovação para transferência ${plan.reference} de ${plan.fromWarehouse.name} para ${plan.toWarehouse.name}.`, afterData: approval.toJSON() });
  return created(res, { approval, plan }, 'Transferência enviada para aprovação do administrador. O saldo só será movimentado após aprovação.');
});
