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
const { assertUniqueOperationItems } = require('../utils/itemSelectionValidation');
const { adjustBalance } = require('../services/stockService');
const { money, qty } = require('../utils/number');
const { isTrue, normalizeBoolean } = require('../utils/booleans');
const { buildWarehouseTransferPlan } = require('../services/warehouseTransferService');
const {
  warehouseListWhere,
  assertWarehouseAccess,
  movementWhereForUser,
  isPrivileged,
} = require('../utils/warehouseAccess');

function parseSerials(value) {
  if (Array.isArray(value)) return value.map((s) => String(s).trim()).filter(Boolean);
  return String(value || '').split(/\n|,|;/).map((s) => s.trim()).filter(Boolean);
}

function nextWarehouseDeleteNumber() {
  const now = new Date();
  const stamp = `${now.getFullYear()}${String(now.getMonth() + 1).padStart(2, '0')}${String(now.getDate()).padStart(2, '0')}-${String(now.getHours()).padStart(2, '0')}${String(now.getMinutes()).padStart(2, '0')}${String(now.getSeconds()).padStart(2, '0')}`;
  return `EXE-${stamp}`;
}

function nextReverseExitNumber() {
  const now = new Date();
  const stamp = `${now.getFullYear()}${String(now.getMonth() + 1).padStart(2, '0')}${String(now.getDate()).padStart(2, '0')}-${String(now.getHours()).padStart(2, '0')}${String(now.getMinutes()).padStart(2, '0')}${String(now.getSeconds()).padStart(2, '0')}`;
  return `LR-SAIDA-${stamp}`;
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
  const reverseOutgoing = movements.filter((movement) => movement.type === 'saida_logistica_reversa');

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
      reverseOutgoingMovements: reverseOutgoing.length,
      lastMovementAt: movements[0]?.movementAt || null,
    },
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

  const inventory = await warehouseInventorySnapshot(warehouse.id);
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

exports.reverseExit = asyncHandler(async (req, res) => {
  const warehouse = await Warehouse.findByPk(req.params.id);
  if (!warehouse) return fail(res, 404, 'Estoque não encontrado.');
  if (!warehouse.isReverseLogistics) return fail(res, 400, 'Esta operação é exclusiva de estoque de logística reversa.');
  if (warehouse.status !== 'ativo') return fail(res, 400, 'O estoque de logística reversa precisa estar ativo.');
  try { assertWarehouseAccess(req.user, warehouse.id); } catch (error) { return fail(res, error.statusCode || 403, error.message); }

  const items = Array.isArray(req.body.items) ? req.body.items : [];
  const supplierName = String(req.body.supplierName || '').trim();
  const documentNumber = String(req.body.documentNumber || '').trim();
  const notes = String(req.body.notes || '').trim();
  const reference = String(req.body.reference || '').trim() || nextReverseExitNumber();

  if (!supplierName) return fail(res, 400, 'Informe a empresa fornecedora que receberá o material recolhido.');
  if (!documentNumber) return fail(res, 400, 'Informe o número do romaneio, protocolo ou documento de entrega.');
  if (!items.length) return fail(res, 400, 'Adicione ao menos um material à saída de logística reversa.');
  try { assertUniqueOperationItems(items); } catch (error) { return fail(res, error.statusCode || 400, error.message); }

  const result = await sequelize.transaction(async (transaction) => {
    let totalQuantity = 0;
    let totalValue = 0;
    const affected = [];
    const usedSerials = new Set();

    for (const item of items) {
      const material = await Material.findByPk(item.materialId, { transaction });
      if (!material) throw new Error('Material não encontrado.');
      const unitCost = money(material.unitCost || 0);

      if (isTrue(material.requiresSerial)) {
        const serialNumbers = parseSerials(item.serialNumbers);
        if (!serialNumbers.length) throw new Error(`Selecione ao menos um serial de ${material.name}.`);
        for (const serialNumber of serialNumbers) {
          const serialKey = serialNumber.toUpperCase();
          if (usedSerials.has(serialKey)) throw new Error(`Serial repetido na saída: ${serialNumber}.`);
          usedSerials.add(serialKey);

          const asset = await SerializedAsset.findOne({
            where: { serialNumber: { [Op.iLike]: serialNumber } },
            transaction,
            lock: transaction.LOCK.UPDATE,
          });
          if (!asset || Number(asset.materialId) !== Number(material.id) || asset.ownerType !== 'estoque' || asset.status !== 'em_estoque' || Number(asset.warehouseId) !== Number(warehouse.id)) {
            throw new Error(`Serial ${serialNumber} não está disponível neste estoque de logística reversa.`);
          }

          const before = asset.toJSON();
          const value = money(asset.acquisitionCost || unitCost);
          asset.ownerType = 'fornecedor';
          asset.status = 'devolvido';
          asset.warehouseId = null;
          asset.technicianId = null;
          asset.lastMovementAt = new Date();
          asset.notes = [asset.notes, `Entregue ao fornecedor ${supplierName}. Documento ${documentNumber}. Referência ${reference}.`].filter(Boolean).join(' | ');
          await asset.save({ transaction });

          await StockMovement.create({
            type: 'saida_logistica_reversa',
            materialId: material.id,
            assetId: asset.id,
            quantity: 1,
            serialNumber: asset.serialNumber,
            fromOwnerType: 'estoque',
            toOwnerType: 'fornecedor',
            fromWarehouseId: warehouse.id,
            reference,
            notes: `Saída de logística reversa para ${supplierName}. Documento ${documentNumber}.${notes ? ` ${notes}` : ''}`,
            createdById: req.user.id,
          }, { transaction });

          totalQuantity += 1;
          totalValue += Number(value);
          affected.push({ materialId: material.id, materialName: material.name, serialNumber: asset.serialNumber, quantity: 1, value, before, after: asset.toJSON() });
        }
      } else {
        const quantity = qty(item.quantity);
        if (quantity <= 0) throw new Error(`Informe uma quantidade válida para ${material.name}.`);
        const balance = await StockBalance.findOne({
          where: { materialId: material.id, ownerType: 'estoque', technicianId: null, warehouseId: warehouse.id },
          transaction,
          lock: transaction.LOCK.UPDATE,
        });
        if (!balance || Number(balance.quantity || 0) < Number(quantity)) {
          throw new Error(`Saldo insuficiente para ${material.name}. Disponível: ${balance?.quantity || 0}.`);
        }
        const beforeQuantity = Number(balance.quantity || 0);
        const updated = await adjustBalance({ materialId: material.id, ownerType: 'estoque', technicianId: null, warehouseId: warehouse.id, delta: -Number(quantity), transaction });
        const value = money(Number(quantity) * Number(unitCost));

        await StockMovement.create({
          type: 'saida_logistica_reversa',
          materialId: material.id,
          quantity,
          fromOwnerType: 'estoque',
          toOwnerType: 'fornecedor',
          fromWarehouseId: warehouse.id,
          reference,
          notes: `Saída de logística reversa para ${supplierName}. Documento ${documentNumber}.${notes ? ` ${notes}` : ''}`,
          createdById: req.user.id,
        }, { transaction });

        totalQuantity += Number(quantity);
        totalValue += Number(value);
        affected.push({ materialId: material.id, materialName: material.name, quantity: Number(quantity), unitCost, value, beforeQuantity, afterQuantity: Number(updated.quantity || 0) });
      }
    }

    await writeAudit({
      req,
      action: 'reverse_logistics_exit',
      entity: 'Warehouse',
      entityId: warehouse.id,
      message: `Saída de logística reversa ${reference} registrada no estoque ${warehouse.name} para ${supplierName}.`,
      beforeData: { warehouseId: warehouse.id, warehouseName: warehouse.name },
      afterData: { reference, supplierName, documentNumber, notes, totalQuantity: qty(totalQuantity), totalValue: money(totalValue), affected },
      transaction,
    });

    return { reference, supplierName, documentNumber, totalQuantity: qty(totalQuantity), totalValue: money(totalValue), affectedCount: affected.length };
  });

  return created(res, result, 'Saída de logística reversa registrada no histórico e na auditoria.');
});
