const sequelize = require('../../config/db');
const { Op } = require('sequelize');
const {
  Material,
  StockBalance,
  SerializedAsset,
  Technician,
  ContractorCompany,
  StockMovement,
  User,
  ServiceOrder,
  ServiceOrderMaterial,
  Warehouse,
  Transfer,
  TransferItem,
  Notification,
  TechnicianTool,
} = require('../models');
const asyncHandler = require('../utils/asyncHandler');
const { ok, okPaginated, created, fail } = require('../utils/response');
const { paginationFromQuery, paginationMeta } = require('../utils/pagination');
const { daysBetween, qty, money, normalizeDoc } = require('../utils/number');
const { adjustBalance } = require('../services/stockService');
const { writeAudit } = require('../services/auditService');
const { assertUniqueOperationItems } = require('../utils/itemSelectionValidation');
const { stockWhereForUser, movementWhereForUser, assertWarehouseAccess, isPrivileged } = require('../utils/warehouseAccess');
const { assertTechnicianAccess, filterTechniciansForUser } = require('../utils/technicianAccess');
const { reverseWarehouseIds, movementOutsideReverse } = require('../utils/reverseLogistics');
const { normalizeServiceOrderCity, resolveServiceOrderLocation } = require('../utils/serviceOrderLocation');
const { nextOperationNumber } = require('../utils/operationReference');

function parseSerials(value) {
  if (Array.isArray(value)) return value.map((s) => String(s).trim()).filter(Boolean);
  return String(value || '').split(/\n|,|;/).map((s) => s.trim()).filter(Boolean);
}

function serviceRequiresSerial(serviceType, addressChangeType) {
  return serviceType === 'instalacao'
    || serviceType === 'troca_onu'
    || (serviceType === 'outro' && addressChangeType === 'com_troca');
}

function nextAutomaticServiceOrderNumber(technicianId) {
  const stamp = Date.now().toString(36).toUpperCase();
  const suffix = Math.random().toString(36).slice(2, 7).toUpperCase();
  return `BAIXA-${technicianId}-${stamp}-${suffix}`;
}

function composeServiceNotes(notes, serviceType, addressChangeType) {
  const addressLabel = addressChangeType === 'com_troca'
    ? 'com troca de equipamento'
    : addressChangeType === 'sem_troca'
      ? 'sem troca de equipamento'
      : '';
  const addressNote = serviceType === 'outro' && addressLabel ? `Mudança de endereço: ${addressLabel}.` : '';
  return [addressNote, String(notes || '').trim()].filter(Boolean).join(' | ');
}

exports.overview = asyncHandler(async (req, res) => {
  const materials = await Material.findAll({ order: [['createdAt', 'DESC'], ['id', 'DESC']] });
  const requestedWarehouseId = Number(req.query.warehouseId || 0);
  const warehouseScope = stockWhereForUser(req.user, requestedWarehouseId || null);
  const allTechnicians = await Technician.findAll({ attributes: ['id', 'defaultWarehouseId', 'serviceCities'] });
  const visibleTechnicians = filterTechniciansForUser(req.user, allTechnicians)
    .filter((technician) => !requestedWarehouseId || Number(technician.defaultWarehouseId || 0) === requestedWarehouseId);
  const visibleTechnicianIds = visibleTechnicians.map((technician) => Number(technician.id));
  const restrictTechnicianStock = !isPrivileged(req.user) || requestedWarehouseId > 0;
  const technicianScope = restrictTechnicianStock
    ? { technicianId: visibleTechnicianIds.length ? { [Op.in]: visibleTechnicianIds } : -1 }
    : {};
  const reverseIds = await reverseWarehouseIds();
  const operationalWarehouseScope = reverseIds.length ? { warehouseId: { [Op.notIn]: reverseIds } } : {};
  const rows = [];
  for (const material of materials) {
    const balanceWhere = { materialId: material.id, ownerType: 'estoque', technicianId: null, [Op.and]: [warehouseScope, operationalWarehouseScope] };
    const assetWhere = { materialId: material.id, ownerType: 'estoque', status: 'em_estoque', [Op.and]: [warehouseScope, operationalWarehouseScope] };
    const mainBalance = await StockBalance.sum('quantity', { where: balanceWhere });
    const mainAssets = await SerializedAsset.count({ where: assetWhere });
    const techAssets = await SerializedAsset.count({ where: { materialId: material.id, ownerType: 'tecnico', ...technicianScope } });
    const installedAssets = isPrivileged(req.user) && !requestedWarehouseId
      ? await SerializedAsset.count({ where: { materialId: material.id, ownerType: 'cliente' } })
      : await ServiceOrderMaterial.count({
        where: { materialId: material.id, assetId: { [Op.ne]: null } },
        include: [{ model: ServiceOrder, required: true, where: warehouseScope }],
        distinct: true,
        col: 'assetId',
      });
    const techBalances = await StockBalance.sum('quantity', { where: { materialId: material.id, ownerType: 'tecnico', ...technicianScope } });
    rows.push({
      ...material.toJSON(),
      mainStock: material.requiresSerial ? mainAssets : Number(mainBalance || 0),
      technicianStock: material.category === 'ferramenta' ? 0 : (material.requiresSerial ? techAssets : Number(techBalances || 0)),
      installedStock: material.category === 'ferramenta' ? 0 : (material.requiresSerial ? installedAssets : 0),
    });
  }
  return ok(res, rows);
});

exports.assets = asyncHandler(async (req, res) => {
  const where = {};
  const and = [];
  const reverseIds = await reverseWarehouseIds();
  const requestedOwnerType = String(req.query.ownerType || '').trim().toLowerCase();
  if (req.query.status) where.status = req.query.status;
  if (requestedOwnerType) where.ownerType = requestedOwnerType;
  if (req.query.materialId) where.materialId = req.query.materialId;
  if (req.query.serial) where.serialNumber = { [Op.iLike]: `%${req.query.serial}%` };

  const allTechnicians = await Technician.findAll({
    attributes: ['id', 'defaultWarehouseId', 'serviceCities'],
    include: [{ model: Warehouse, as: 'defaultWarehouse', attributes: ['id', 'city'] }],
  });
  const visibleTechnicianIds = filterTechniciansForUser(req.user, allTechnicians).map((technician) => Number(technician.id));

  if (req.query.technicianId) {
    const requestedTechnicianId = Number(req.query.technicianId);
    if (!isPrivileged(req.user) && !visibleTechnicianIds.includes(requestedTechnicianId)) {
      and.push({ technicianId: -1 });
    } else {
      and.push({ technicianId: requestedTechnicianId });
    }
  }

  const warehouseScopes = [stockWhereForUser(req.user, req.query.warehouseId)];
  if (reverseIds.length) warehouseScopes.push({ warehouseId: { [Op.notIn]: reverseIds } });
  const warehouseAssetScope = { [Op.and]: warehouseScopes };
  const technicianAssetScope = { technicianId: visibleTechnicianIds.length ? { [Op.in]: visibleTechnicianIds } : -1 };

  let clientAssetIds = [];
  if (!isPrivileged(req.user) && (!requestedOwnerType || requestedOwnerType === 'cliente')) {
    const serviceOrderRows = await ServiceOrderMaterial.findAll({
      attributes: ['assetId'],
      where: { assetId: { [Op.ne]: null } },
      include: [{
        model: ServiceOrder,
        attributes: [],
        required: true,
        where: stockWhereForUser(req.user, req.query.warehouseId),
      }],
      raw: true,
      limit: 5000,
    });
    clientAssetIds = [...new Set(serviceOrderRows.map((row) => Number(row.assetId)).filter(Boolean))];
  }
  const clientAssetScope = isPrivileged(req.user)
    ? {}
    : { id: clientAssetIds.length ? { [Op.in]: clientAssetIds } : -1 };

  if (requestedOwnerType === 'estoque' || (!requestedOwnerType && req.query.warehouseId)) {
    and.push(warehouseAssetScope);
  } else if (requestedOwnerType === 'tecnico') {
    and.push(technicianAssetScope);
  } else if (requestedOwnerType === 'cliente') {
    and.push(clientAssetScope);
  } else if (!requestedOwnerType && !isPrivileged(req.user)) {
    and.push({
      [Op.or]: [
        { ownerType: 'estoque', ...warehouseAssetScope },
        { ownerType: 'tecnico', ...technicianAssetScope },
        { ownerType: 'cliente', ...clientAssetScope },
      ],
    });
  }

  if (and.length) where[Op.and] = and;
  const pagination = paginationFromQuery(req.query);
  const limit = pagination.enabled ? pagination.limit : Math.min(Number(req.query.limit || 800), 2000);
  const [assets, total] = await Promise.all([
    SerializedAsset.findAll({ where, include: [Material, Technician, Warehouse], order: [['updatedAt', 'DESC'], ['createdAt', 'DESC'], ['id', 'DESC']], limit, ...(pagination.enabled ? { offset: pagination.offset } : {}) }),
    pagination.enabled ? SerializedAsset.count({ where }) : Promise.resolve(0),
  ]);
  const data = assets.map((asset) => ({ ...asset.toJSON(), custodyDays: daysBetween(asset.custodyStartedAt) }));
  return pagination.enabled
    ? okPaginated(res, data, paginationMeta(total, pagination.page, pagination.pageSize))
    : ok(res, data);
});

exports.movements = asyncHandler(async (req, res) => {
  const where = {};
  const and = [];
  if (req.query.type) where.type = req.query.type;
  if (req.query.materialId) where.materialId = req.query.materialId;
  if (req.query.technicianId) and.push({ [Op.or]: [{ fromTechnicianId: req.query.technicianId }, { toTechnicianId: req.query.technicianId }] });
  const movementScope = movementWhereForUser(req.user, req.query.warehouseId);
  if (isPrivileged(req.user)) {
    if (movementScope) and.push(movementScope);
  } else {
    const allTechnicians = await Technician.findAll({
      attributes: ['id', 'defaultWarehouseId', 'serviceCities'],
      include: [{ model: Warehouse, as: 'defaultWarehouse', attributes: ['id', 'city'] }],
    });
    const visibleTechnicianIds = filterTechniciansForUser(req.user, allTechnicians).map((technician) => Number(technician.id));
    const accessOptions = [];
    if (movementScope?.[Op.or]) accessOptions.push(...movementScope[Op.or]);
    else if (movementScope) accessOptions.push(movementScope);
    accessOptions.push(
      { fromTechnicianId: visibleTechnicianIds.length ? { [Op.in]: visibleTechnicianIds } : -1 },
      { toTechnicianId: visibleTechnicianIds.length ? { [Op.in]: visibleTechnicianIds } : -1 },
    );
    and.push({ [Op.or]: accessOptions });
  }
  const reverseIds = await reverseWarehouseIds();
  and.push(movementOutsideReverse(reverseIds));
  if (req.query.search) {
    const q = `%${req.query.search}%`;
    and.push({ [Op.or]: [{ serialNumber: { [Op.iLike]: q } }, { reference: { [Op.iLike]: q } }, { notes: { [Op.iLike]: q } }] });
  }
  if (and.length) where[Op.and] = and;
  const pagination = paginationFromQuery(req.query);
  const limit = pagination.enabled ? pagination.limit : Math.min(Number(req.query.limit || 1000), 3000);
  const [movements, total] = await Promise.all([
    StockMovement.findAll({
      include: [
        Material,
        SerializedAsset,
        { model: Technician, as: 'fromTechnician' },
        { model: Technician, as: 'toTechnician' },
        { model: Warehouse, as: 'fromWarehouse' },
        { model: Warehouse, as: 'toWarehouse' },
        { model: User, as: 'createdBy', attributes: ['id', 'name', 'email', 'role'] },
      ],
      where,
      order: [['movementAt', 'DESC'], ['createdAt', 'DESC'], ['id', 'DESC']],
      limit,
      ...(pagination.enabled ? { offset: pagination.offset } : {}),
    }),
    pagination.enabled ? StockMovement.count({ where }) : Promise.resolve(0),
  ]);
  return pagination.enabled
    ? okPaginated(res, movements, paginationMeta(total, pagination.page, pagination.pageSize))
    : ok(res, movements);
});


exports.returnHistory = asyncHandler(async (req, res) => {
  const where = { transferType: 'retorno' };
  const and = [];

  if (req.query.status === 'cancelado') {
    where.status = 'cancelado';
  } else if (req.query.status === 'assinado') {
    where.status = 'assinado';
    and.push({ [Op.and]: [{ attachmentName: { [Op.ne]: null } }, { attachmentName: { [Op.ne]: '' } }] });
  } else if (req.query.status === 'pendente_assinatura') {
    and.push({
      [Op.or]: [
        { status: 'pendente_assinatura' },
        {
          [Op.and]: [
            { status: 'assinado' },
            { [Op.or]: [{ attachmentName: null }, { attachmentName: '' }] },
          ],
        },
      ],
    });
  }
  if (req.query.technicianId) where.technicianId = Number(req.query.technicianId);

  if (req.query.search) {
    const q = `%${String(req.query.search).trim()}%`;
    and.push({
      [Op.or]: [
        { transferNumber: { [Op.iLike]: q } },
        { notes: { [Op.iLike]: q } },
        { signatureResponsible: { [Op.iLike]: q } },
      ],
    });
  }

  const requestedWarehouseId = Number(req.query.warehouseId || 0);
  const warehouseScope = stockWhereForUser(req.user, requestedWarehouseId || null);
  const allTechnicians = await Technician.findAll({
    attributes: ['id', 'defaultWarehouseId', 'serviceCities'],
    include: [{ model: Warehouse, as: 'defaultWarehouse', attributes: ['id', 'city'] }],
  });
  const visibleTechnicianIds = filterTechniciansForUser(req.user, allTechnicians)
    .map((technician) => Number(technician.id));

  if (req.user?.role === 'tecnico') {
    and.push({ technicianId: Number(req.user.technicianId || -1) });
  } else if (isPrivileged(req.user)) {
    if (requestedWarehouseId > 0) and.push(warehouseScope);
  } else {
    and.push({
      [Op.or]: [
        warehouseScope,
        { technicianId: visibleTechnicianIds.length ? { [Op.in]: visibleTechnicianIds } : -1 },
      ],
    });
  }

  if (and.length) where[Op.and] = and;

  const pagination = paginationFromQuery(req.query, { defaultPageSize: 15, maxPageSize: 100 });
  const limit = pagination.enabled ? pagination.limit : Math.min(Number(req.query.limit || 100), 300);
  const include = [
    Technician,
    Warehouse,
    { model: User, as: 'createdBy', attributes: ['id', 'name', 'email', 'role'] },
    { model: TransferItem, include: [Material, SerializedAsset] },
  ];

  const [returns, total] = await Promise.all([
    Transfer.findAll({
      where,
      attributes: { exclude: ['attachmentData'] },
      include,
      order: [['deliveredAt', 'DESC'], ['createdAt', 'DESC'], ['id', 'DESC']],
      limit,
      ...(pagination.enabled ? { offset: pagination.offset } : {}),
    }),
    pagination.enabled ? Transfer.count({ where }) : Promise.resolve(0),
  ]);

  return pagination.enabled
    ? okPaginated(res, returns, paginationMeta(total, pagination.page, pagination.pageSize))
    : ok(res, returns);
});

exports.technicianBox = asyncHandler(async (req, res) => {
  const technician = await Technician.findByPk(req.params.id, { include: [ContractorCompany, { model: Warehouse, as: 'defaultWarehouse' }] });
  if (!technician) return fail(res, 404, 'Técnico não encontrado.');
  try { assertTechnicianAccess(req.user, technician); } catch (error) { return fail(res, error.statusCode || 403, error.message); }

  const operationalView = String(req.query.view || '').trim().toLowerCase() === 'operational';
  const operationalMaterialInclude = {
    model: Material,
    attributes: ['id', 'sku', 'name', 'category', 'unit', 'requiresSerial', 'unitCost', 'maxQuantityPerServiceOrder', 'allowCustomerInstall', 'requiresReturnOnRemoval'],
  };
  const operationalWarehouseInclude = { model: Warehouse, attributes: ['id', 'name', 'code', 'city', 'state', 'region'] };
  const assetIncludes = operationalView ? [operationalMaterialInclude, operationalWarehouseInclude] : [Material, Warehouse];

  const rawAssets = await SerializedAsset.findAll({
    where: { technicianId: technician.id, ownerType: 'tecnico' },
    include: assetIncludes,
    order: [['updatedAt', 'DESC'], ['createdAt', 'DESC'], ['id', 'DESC']],
  });
  const rawBalances = await StockBalance.findAll({
    where: { technicianId: technician.id, ownerType: 'tecnico' },
    include: assetIncludes,
    order: [['updatedAt', 'DESC'], ['createdAt', 'DESC'], ['id', 'DESC']],
  });
  // Ferramentas ficam somente na ficha de custódia, separadas da caixa técnica.
  const assets = rawAssets.filter((asset) => String(asset.Material?.category || '').toLowerCase() !== 'ferramenta');
  const balances = rawBalances.filter((balance) => String(balance.Material?.category || '').toLowerCase() !== 'ferramenta');

  const assetsValue = assets.reduce((sum, asset) => sum + Number(asset.acquisitionCost || asset.Material?.unitCost || 0), 0);
  const consumableValue = balances.reduce((sum, row) => sum + Number(row.quantity || 0) * Number(row.Material?.unitCost || 0), 0);
  const grouped = {};
  for (const asset of assets) {
    const key = asset.materialId;
    grouped[key] = grouped[key] || { materialId: asset.materialId, material: asset.Material?.name || 'Equipamento', category: asset.Material?.category, unit: asset.Material?.unit, requiresSerial: true, quantity: 0, value: 0, serials: [] };
    grouped[key].quantity += 1;
    grouped[key].value += Number(asset.acquisitionCost || asset.Material?.unitCost || 0);
    grouped[key].serials.push(asset.serialNumber);
  }
  for (const balance of balances) {
    const key = balance.materialId;
    grouped[key] = grouped[key] || { materialId: balance.materialId, material: balance.Material?.name || 'Material', category: balance.Material?.category, unit: balance.Material?.unit, requiresSerial: false, quantity: 0, value: 0, serials: [] };
    grouped[key].quantity += Number(balance.quantity || 0);
    grouped[key].value += Number(balance.quantity || 0) * Number(balance.Material?.unitCost || 0);
  }

  if (operationalView) {
    return ok(res, {
      technician,
      assets: assets.map((asset) => ({ ...asset.toJSON(), custodyDays: daysBetween(asset.custodyStartedAt) })),
      balances,
      movements: [],
      orders: [],
      groupedMaterials: Object.values(grouped).map((row) => ({ ...row, value: money(row.value) })),
      summary: {
        assetsCount: assets.length,
        consumableLines: balances.length,
        totalQuantity: Object.values(grouped).reduce((sum, row) => sum + Number(row.quantity || 0), 0),
        assetsValue: money(assetsValue),
        consumableValue: money(consumableValue),
        totalValue: money(assetsValue + consumableValue),
        oldCustody: assets.filter((asset) => daysBetween(asset.custodyStartedAt) >= 60).length,
        movementsCount: 0,
        ordersCount: 0,
      },
    });
  }

  const rawMovements = await StockMovement.findAll({
    where: { [Op.or]: [{ fromTechnicianId: technician.id }, { toTechnicianId: technician.id }] },
    include: [Material, SerializedAsset, { model: User, as: 'createdBy', attributes: ['id', 'name', 'email', 'role'] }, { model: Technician, as: 'fromTechnician' }, { model: Technician, as: 'toTechnician' }],
    order: [['movementAt', 'DESC'], ['createdAt', 'DESC'], ['id', 'DESC']],
    limit: 250,
  });
  const movements = rawMovements.filter((movement) => String(movement.Material?.category || '').toLowerCase() !== 'ferramenta' && movement.toOwnerType !== 'ficha_tecnico' && movement.fromOwnerType !== 'ficha_tecnico');
  const orders = await ServiceOrder.findAll({
    where: { technicianId: technician.id },
    include: [{ model: ServiceOrderMaterial, include: [Material, SerializedAsset] }],
    order: [['createdAt', 'DESC'], ['id', 'DESC']],
    limit: 80,
  });

  return ok(res, {
    technician,
    assets: assets.map((asset) => ({ ...asset.toJSON(), custodyDays: daysBetween(asset.custodyStartedAt) })),
    balances,
    movements,
    orders,
    groupedMaterials: Object.values(grouped).map((row) => ({ ...row, value: money(row.value) })),
    summary: {
      assetsCount: assets.length,
      consumableLines: balances.length,
      totalQuantity: Object.values(grouped).reduce((sum, row) => sum + Number(row.quantity || 0), 0),
      assetsValue: money(assetsValue),
      consumableValue: money(consumableValue),
      totalValue: money(assetsValue + consumableValue),
      oldCustody: assets.filter((asset) => daysBetween(asset.custodyStartedAt) >= 60).length,
      movementsCount: movements.length,
      ordersCount: orders.length,
    },
  });
});

exports.returnFromTechnician = asyncHandler(async (req, res) => {
  const { technicianId, reference, notes, warehouseId, attachmentName, attachmentData, signatureResponsible } = req.body;
  const items = Array.isArray(req.body.items) ? req.body.items : [];
  const targetWarehouseId = warehouseId || null;
  if (!technicianId) return fail(res, 400, 'Técnico é obrigatório.');
  if (!targetWarehouseId) return fail(res, 400, 'Selecione o estoque de destino para retorno do material.');
  if (!items.length) return fail(res, 400, 'Selecione pelo menos um item da caixa do técnico para retornar ao estoque.');
  try { assertUniqueOperationItems(items); } catch (error) { return fail(res, error.statusCode || 400, error.message); }
  const technician = await Technician.findByPk(technicianId, { include: [{ model: Warehouse, as: 'defaultWarehouse' }] });
  if (!technician) return fail(res, 404, 'Técnico não encontrado.');
  try { assertTechnicianAccess(req.user, technician); } catch (error) { return fail(res, error.statusCode || 403, error.message); }
  const targetWarehouse = await Warehouse.findByPk(targetWarehouseId);
  if (!targetWarehouse) return fail(res, 404, 'Estoque de destino não encontrado.');
  if (targetWarehouse.status && targetWarehouse.status !== 'ativo') return fail(res, 400, 'O estoque de destino precisa estar ativo.');
  if (targetWarehouse.isReverseLogistics) return fail(res, 400, 'Retorno de técnico não pode ser enviado ao estoque de logística reversa.');
  try { assertWarehouseAccess(req.user, targetWarehouseId, 'Você não tem acesso ao estoque de destino.'); } catch (error) { return fail(res, error.statusCode || 403, error.message); }

  const result = await sequelize.transaction(async (transaction) => {
    let totalQuantity = 0;
    let totalValue = 0;
    const guideNumber = nextOperationNumber('RETORNO');
    const operationReference = String(reference || '').trim() || 'Devolução de material';
    const affected = [];
    let zeroQuantityLines = 0;

    const transfer = await Transfer.create({
      transferNumber: guideNumber,
      technicianId,
      deliveredAt: new Date(),
      status: attachmentData ? 'assinado' : 'pendente_assinatura',
      signedAt: attachmentData ? new Date() : null,
      attachmentName: attachmentName || null,
      attachmentData: attachmentData || null,
      signatureResponsible: signatureResponsible || null,
      notes: [
        'RETORNO DA CAIXA DO TÉCNICO PARA ESTOQUE.',
        `REFERÊNCIA: ${operationReference}.`,
        notes ? `MOTIVO/OBSERVAÇÃO: ${String(notes).trim()}` : null,
      ].filter(Boolean).join(' '),
      transferType: 'retorno',
      stampText: 'Declaro que os materiais listados foram devolvidos pelo técnico e conferidos para retorno ao estoque informado.',
      createdById: req.user.id,
      warehouseId: targetWarehouseId,
    }, { transaction });

    const usedSerials = new Set();

    for (const item of items) {
      const material = await Material.findByPk(item.materialId, { transaction });
      if (!material) throw new Error('Material não encontrado.');
      const unitCost = money(item.unitCost ?? material.unitCost);
      if (material.requiresSerial) {
        const serials = parseSerials(item.serialNumbers);
        if (!serials.length) {
          await TransferItem.create({ transferId: transfer.id, materialId: material.id, itemDescription: material.name, quantity: 0, unitCost, totalCost: 0 }, { transaction });
          zeroQuantityLines += 1;
          affected.push({ materialId: material.id, materialName: material.name, quantity: 0, notReturned: true });
          continue;
        }
        for (const serialNumber of serials) {
          const serialKey = String(serialNumber).trim().toUpperCase();
          if (usedSerials.has(serialKey)) throw new Error(`Serial repetido no retorno: ${serialNumber}.`);
          usedSerials.add(serialKey);

          const asset = await SerializedAsset.findOne({ where: { serialNumber }, transaction });
          if (!asset || asset.ownerType !== 'tecnico' || Number(asset.technicianId) !== Number(technicianId)) throw new Error(`Serial não está na caixa do técnico: ${serialNumber}.`);
          const beforeAsset = asset.toJSON();
          const cost = money(asset.acquisitionCost || unitCost);
          asset.ownerType = 'estoque';
          asset.status = 'em_estoque';
          asset.technicianId = null;
          asset.warehouseId = targetWarehouseId;
          asset.custodyStartedAt = null;
          asset.lastMovementAt = new Date();
          asset.notes = [asset.notes, notes ? `Retorno ao estoque: ${notes}` : null].filter(Boolean).join(' | ');
          await asset.save({ transaction });
          await TransferItem.create({ transferId: transfer.id, materialId: material.id, assetId: asset.id, quantity: 1, unitCost: cost, totalCost: cost, serialNumber }, { transaction });
          await StockMovement.create({ type: 'retorno_tecnico', materialId: material.id, assetId: asset.id, quantity: 1, serialNumber, fromOwnerType: 'tecnico', toOwnerType: 'estoque', fromTechnicianId: technicianId, toWarehouseId: targetWarehouseId, reference: guideNumber, notes: `Referência: ${operationReference}. ${notes || 'Retorno administrativo da caixa do técnico.'}`, createdById: req.user.id }, { transaction });
          totalQuantity += 1;
          totalValue += Number(cost);
          affected.push({ serialNumber, before: beforeAsset, after: asset.toJSON() });
        }
      } else {
        const quantity = qty(item.quantity);
        if (quantity < 0) throw new Error(`A quantidade de ${material.name} não pode ser negativa.`);
        if (quantity === 0) {
          await TransferItem.create({ transferId: transfer.id, materialId: material.id, itemDescription: material.name, quantity: 0, unitCost, totalCost: 0 }, { transaction });
          zeroQuantityLines += 1;
          affected.push({ materialId: material.id, materialName: material.name, quantity: 0, notReturned: true });
          continue;
        }
        await adjustBalance({ materialId: material.id, ownerType: 'tecnico', technicianId, delta: -quantity, transaction });
        await adjustBalance({ materialId: material.id, ownerType: 'estoque', technicianId: null, warehouseId: targetWarehouseId, delta: quantity, transaction });
        const totalCost = money(quantity * unitCost);
        await TransferItem.create({ transferId: transfer.id, materialId: material.id, quantity, unitCost, totalCost }, { transaction });
        await StockMovement.create({ type: 'retorno_tecnico', materialId: material.id, quantity, fromOwnerType: 'tecnico', toOwnerType: 'estoque', fromTechnicianId: technicianId, toWarehouseId: targetWarehouseId, reference: guideNumber, notes: `Referência: ${operationReference}. ${notes || 'Retorno administrativo da caixa do técnico.'}`, createdById: req.user.id }, { transaction });
        totalQuantity += quantity;
        totalValue += Number(totalCost);
        affected.push({ materialId: material.id, quantity });
      }
    }

    if (!affected.length) throw new Error('Nenhum item válido foi selecionado para retorno ao estoque.');

    transfer.totalQuantity = qty(totalQuantity);
    transfer.totalValue = money(totalValue);
    await transfer.save({ transaction });

    await Notification.create({
      role: 'admin',
      type: 'estoque',
      severity: 'info',
      title: `Retorno registrado ${transfer.transferNumber}`,
      message: `${qty(totalQuantity)} item(ns) retornaram da caixa de ${technician.name} para o estoque ${targetWarehouse.name}.${zeroQuantityLines ? ` ${zeroQuantityLines} linha(s) foi(ram) registrada(s) com quantidade 0, sem movimentação de saldo.` : ''}`,
      route: '/transferencias',
      metadata: { transferId: transfer.id, technicianId: Number(technicianId), warehouseId: targetWarehouseId, totalQuantity: qty(totalQuantity) },
    }, { transaction });

    await writeAudit({
      req,
      action: 'return_to_stock',
      entity: 'Transfer',
      entityId: transfer.id,
      message: `Guia ${transfer.transferNumber} retornou ${qty(totalQuantity)} item(ns) da caixa de ${technician.name} para o estoque ${targetWarehouse.name}. Referência: ${operationReference}.${zeroQuantityLines ? ` ${zeroQuantityLines} linha(s) registrada(s) com quantidade 0.` : ''}`,
      afterData: {
        ...transfer.toJSON(),
        operationReference,
        warehouse: targetWarehouse.toJSON(),
        totalQuantity: qty(totalQuantity),
        totalValue: money(totalValue),
        zeroQuantityLines,
        affected,
      },
      transaction,
    });
    return {
      ...transfer.toJSON(),
      reference: operationReference,
      transferId: transfer.id,
      affectedCount: affected.length,
      zeroQuantityLines,
    };
  });

  return created(res, result, 'Material devolvido da caixa do técnico para o estoque e guia de retorno gerada em Transferências.');
});


exports.moveFromTechnicianToClient = asyncHandler(async (req, res) => {
  let { technicianId, osNumber, customerName, customerCpf, customerAddress, city, serviceType = 'outro', addressChangeType, completedAt, reference, notes, items = [] } = req.body;
  if (req.user.role === 'tecnico') technicianId = req.user.technicianId;
  if (!technicianId) return fail(res, 400, 'Técnico é obrigatório.');
  if (!items.length) {
    const defaults = await StockBalance.findAll({ where: { technicianId, ownerType: 'tecnico' }, include: [Material] });
    items = defaults.filter((row) => ['drop', 'cabo', 'conector', 'esticador'].includes(String(row.Material?.category || '').toLowerCase())).map((row) => ({ materialId: row.materialId, quantity: Math.min(Number(row.quantity || 0), row.Material?.category === 'drop' || row.Material?.category === 'cabo' ? 50 : 2) })).filter((item) => item.quantity > 0);
    if (!items.length) return fail(res, 400, 'Informe itens ou mantenha materiais padrão disponíveis na caixa do técnico.');
  }
  try { assertUniqueOperationItems(items); } catch (error) { return fail(res, error.statusCode || 400, error.message); }
  if (!customerName || !customerCpf) return fail(res, 400, 'Nome do cliente e número do contrato são obrigatórios.');
  if (serviceType === 'outro' && !['com_troca', 'sem_troca'].includes(addressChangeType)) return fail(res, 400, 'Informe se a mudança de endereço terá troca de equipamento.');
  let operationalLocation;
  try { operationalLocation = await resolveServiceOrderLocation(technicianId); } catch (error) { return fail(res, error.statusCode || 400, error.message); }
  try { assertTechnicianAccess(req.user, operationalLocation.technician); } catch (error) { return fail(res, error.statusCode || 403, error.message); }
  let serviceOrderCity;
  try { serviceOrderCity = normalizeServiceOrderCity(city); } catch (error) { return fail(res, error.statusCode || 400, error.message); }
  const technician = operationalLocation.technician;

  const serialRequired = serviceRequiresSerial(serviceType, addressChangeType);
  let totalSerials = 0;
  for (const item of items) {
    const material = await Material.findByPk(item.materialId);
    if (!material) return fail(res, 404, 'Material não encontrado.');
    const serials = parseSerials(item.serialNumbers);
    if (material.requiresSerial) {
      if (serials.length > 1) return fail(res, 400, 'Selecione apenas 1 serial por OS.');
      if (!serials.length) return fail(res, 400, `Para baixar ${material.name}, selecione o serial do equipamento ou remova o item.`);
      totalSerials += serials.length;
    } else if (qty(item.quantity) <= 0) {
      return fail(res, 400, `Informe uma quantidade válida para ${material.name}.`);
    }
  }
  if (serialRequired && totalSerials !== 1) return fail(res, 400, 'Este tipo de serviço exige exatamente 1 serial de equipamento.');
  if (!serialRequired && totalSerials > 1) return fail(res, 400, 'Selecione no máximo 1 serial por OS.');
  const normalizedNotes = composeServiceNotes(notes, serviceType, addressChangeType);

  const result = await sequelize.transaction(async (transaction) => {
    let totalQuantity = 0;
    let totalValue = 0;
    const serviceOrderNumber = String(osNumber || '').trim() || nextAutomaticServiceOrderNumber(technicianId);
    const movementReference = reference || serviceOrderNumber;
    const order = await ServiceOrder.create({
      technicianId,
      osNumber: serviceOrderNumber,
      customerName,
      customerCpf: normalizeDoc(customerCpf),
      customerAddress,
      city: serviceOrderCity,
      warehouseId: operationalLocation.warehouse.id,
      serviceType,
      status: 'concluida',
      completedAt: completedAt || new Date(),
      notes: normalizedNotes,
      createdById: req.user.id,
    }, { transaction });

    const affected = [];
    for (const item of items) {
      const material = await Material.findByPk(item.materialId, { transaction });
      if (!material) throw new Error('Material não encontrado.');
      const unitCost = money(item.unitCost ?? material.unitCost);
      if (material.requiresSerial) {
        const serials = parseSerials(item.serialNumbers);
        if (!serials.length) continue;
        for (const serialNumber of serials) {
          const asset = await SerializedAsset.findOne({ where: { serialNumber }, transaction });
          if (!asset || asset.ownerType !== 'tecnico' || Number(asset.technicianId) !== Number(technicianId)) throw new Error(`Serial não está na caixa do técnico: ${serialNumber}.`);
          const cost = money(asset.acquisitionCost || unitCost);
          asset.ownerType = 'cliente';
          asset.status = 'instalado';
          asset.installedAt = completedAt || new Date();
          asset.customerName = customerName;
          asset.customerCpf = normalizeDoc(customerCpf);
          asset.lastMovementAt = new Date();
          asset.notes = [asset.notes, normalizedNotes ? `Transferido para cliente: ${normalizedNotes}` : null].filter(Boolean).join(' | ');
          await asset.save({ transaction });
          await ServiceOrderMaterial.create({ serviceOrderId: order.id, materialId: material.id, assetId: asset.id, quantity: 1, serialNumber, unitCost: cost, totalCost: cost }, { transaction });
          await StockMovement.create({ type: 'baixa_os', materialId: material.id, assetId: asset.id, quantity: 1, serialNumber, fromOwnerType: 'tecnico', toOwnerType: 'cliente', fromTechnicianId: technicianId, reference: movementReference, notes: normalizedNotes || 'Movimentação administrativa da caixa do técnico para cliente.', createdById: req.user.id }, { transaction });
          totalQuantity += 1;
          totalValue += Number(cost);
          affected.push({ serialNumber, customerName });
        }
      } else {
        const quantity = qty(item.quantity);
        if (quantity <= 0) continue;
        await adjustBalance({ materialId: material.id, ownerType: 'tecnico', technicianId, delta: -quantity, transaction });
        const totalCost = money(quantity * unitCost);
        await ServiceOrderMaterial.create({ serviceOrderId: order.id, materialId: material.id, quantity, unitCost, totalCost }, { transaction });
        await StockMovement.create({ type: 'baixa_os', materialId: material.id, quantity, fromOwnerType: 'tecnico', toOwnerType: 'cliente', fromTechnicianId: technicianId, reference: movementReference, notes: normalizedNotes || 'Movimentação administrativa da caixa do técnico para cliente.', createdById: req.user.id }, { transaction });
        totalQuantity += quantity;
        totalValue += totalCost;
        affected.push({ materialId: material.id, quantity, customerName });
      }
    }

    await writeAudit({
      req,
      action: 'move_to_client',
      entity: 'TechnicianBox',
      entityId: String(technicianId),
      message: `${qty(totalQuantity)} item(ns) da caixa de ${technician.name} transferidos para cliente ${customerName}.`,
      afterData: { reference: movementReference, osId: order?.id || null, customerName, customerCpf: normalizeDoc(customerCpf), city: serviceOrderCity, warehouseId: operationalLocation.warehouse.id, totalQuantity: qty(totalQuantity), totalValue: money(totalValue), affected },
      transaction,
    });

    return { reference: movementReference, osId: order?.id || null, totalQuantity: qty(totalQuantity), totalValue: money(totalValue), affectedCount: affected.length };
  });

  return created(res, result, 'Material movimentado da caixa do técnico para o cliente.');
});


const LOSS_MAX_ATTACHMENTS_PER_REQUEST = 8;
const LOSS_MAX_ATTACHMENTS_PER_RECORD = 30;
const LOSS_MAX_ATTACHMENT_PAYLOAD_LENGTH = 18 * 1024 * 1024;

function normalizeLossAttachmentEntry(entry = {}) {
  const name = String(entry.name || entry.attachmentName || '').trim();
  const data = String(entry.data || entry.attachmentData || '').trim();
  if (!name || !data) return null;
  if (!/^data:(image\/[^;,]+|application\/pdf)[;,]/i.test(data)) return null;
  return {
    name: name.slice(0, 255),
    data,
    uploadedAt: entry.uploadedAt || new Date().toISOString(),
  };
}

function readLossAttachments(loss) {
  const source = loss?.toJSON ? loss.toJSON() : (loss || {});
  const raw = source.attachmentData;

  if (raw) {
    try {
      const parsed = JSON.parse(raw);
      const entries = Array.isArray(parsed)
        ? parsed
        : (Array.isArray(parsed?.attachments) ? parsed.attachments : []);
      const normalized = entries.map(normalizeLossAttachmentEntry).filter(Boolean);
      if (normalized.length) return normalized;
    } catch (_) {
      // Formato legado: um único data URL salvo diretamente na coluna.
    }

    const legacy = normalizeLossAttachmentEntry({
      name: source.attachmentName || 'documento-anexado',
      data: raw,
      uploadedAt: source.signedAt || source.updatedAt || source.createdAt,
    });
    return legacy ? [legacy] : [];
  }

  const summary = String(source.attachmentName || '').trim();
  const multipleMatch = summary.match(/^(\d+)\s+arquivos?\s+anexados?$/i);
  if (multipleMatch) {
    return Array.from({ length: Number(multipleMatch[1]) }, (_, index) => ({
      name: `Anexo ${index + 1}`,
      data: '',
    }));
  }
  return summary ? [{ name: summary, data: '' }] : [];
}

function lossAttachmentSummary(attachments = []) {
  if (!attachments.length) return null;
  if (attachments.length === 1) return attachments[0].name;
  return `${attachments.length} arquivos anexados`;
}

function lossWithAttachments(loss, includeData = false) {
  const payload = loss?.toJSON ? loss.toJSON() : { ...(loss || {}) };
  const attachments = readLossAttachments(payload);
  payload.attachmentCount = attachments.length;
  payload.attachmentNames = attachments.map((item) => item.name);
  if (includeData) payload.attachments = attachments;
  delete payload.attachmentData;
  return payload;
}

function isTechnicianLossRecord(loss) {
  return String(loss?.transferNumber || '').toUpperCase().startsWith('PERDA-');
}

function canAccessTechnicianLoss(user, loss) {
  if (isPrivileged(user)) return true;
  if (loss?.warehouseId) {
    try {
      assertWarehouseAccess(user, loss.warehouseId);
      return true;
    } catch (_) {
      // Continua pela cidade do técnico.
    }
  }
  return Boolean(
    loss?.Technician
      && filterTechniciansForUser(user, [loss.Technician]).length > 0,
  );
}

function prepareIncomingLossAttachments(body = {}) {
  const legacyProvided = Boolean(body.attachmentName || body.attachmentData);
  const requested = Array.isArray(body.attachments)
    ? body.attachments
    : (legacyProvided ? [{ attachmentName: body.attachmentName, attachmentData: body.attachmentData }] : []);

  if (requested.length > LOSS_MAX_ATTACHMENTS_PER_REQUEST) {
    const error = new Error(`Envie no máximo ${LOSS_MAX_ATTACHMENTS_PER_REQUEST} arquivos por vez.`);
    error.statusCode = 400;
    throw error;
  }

  const normalized = requested.map(normalizeLossAttachmentEntry).filter(Boolean);
  if (normalized.length !== requested.length) {
    const error = new Error('Envie somente arquivos PDF ou imagens válidas, todos com nome e conteúdo.');
    error.statusCode = 400;
    throw error;
  }

  return normalized;
}

function serializeLossAttachments(attachments = []) {
  if (!attachments.length) return null;
  const serialized = JSON.stringify(attachments);
  if (serialized.length > LOSS_MAX_ATTACHMENT_PAYLOAD_LENGTH) {
    const error = new Error('O conjunto de anexos excede o limite permitido. Reduza o tamanho ou envie menos arquivos por vez.');
    error.statusCode = 413;
    throw error;
  }
  return serialized;
}

function nextLossNumber() {
  const now = new Date();
  const stamp = `${now.getFullYear()}${String(now.getMonth() + 1).padStart(2, '0')}${String(now.getDate()).padStart(2, '0')}-${String(now.getHours()).padStart(2, '0')}${String(now.getMinutes()).padStart(2, '0')}${String(now.getSeconds()).padStart(2, '0')}`;
  return `PERDA-${stamp}`;
}

exports.losses = asyncHandler(async (req, res) => {
  const where = { transferNumber: { [Op.iLike]: 'PERDA-%' } };
  if (req.query.technicianId) where.technicianId = req.query.technicianId;
  const rows = await Transfer.findAll({
    where,
    attributes: { exclude: ['attachmentData'] },
    include: [
      Technician,
      Warehouse,
      { model: TransferItem, include: [Material, SerializedAsset, TechnicianTool] },
      { model: User, as: 'createdBy', attributes: ['id', 'name', 'email', 'role'] },
    ],
    order: [['deliveredAt', 'DESC'], ['createdAt', 'DESC'], ['id', 'DESC']],
    limit: 400,
  });
  const visibleRows = isPrivileged(req.user)
    ? rows
    : rows.filter((row) => row.Technician && filterTechniciansForUser(req.user, [row.Technician]).length > 0);
  return ok(res, visibleRows.map((row) => lossWithAttachments(row, false)));
});

exports.getTechnicianLoss = asyncHandler(async (req, res) => {
  const loss = await Transfer.findByPk(req.params.id, {
    attributes: { exclude: ['attachmentData'] },
    include: [
      Technician,
      Warehouse,
      { model: TransferItem, include: [Material, SerializedAsset, TechnicianTool] },
      { model: User, as: 'createdBy', attributes: ['id', 'name', 'email', 'role'] },
    ],
  });
  if (!loss || !isTechnicianLossRecord(loss)) return fail(res, 404, 'Perda/desconto não encontrada.');
  if (!canAccessTechnicianLoss(req.user, loss)) return fail(res, 403, 'Você não tem acesso à cidade desta perda.');
  return ok(res, lossWithAttachments(loss, false));
});

exports.getTechnicianLossAttachment = asyncHandler(async (req, res) => {
  const loss = await Transfer.findByPk(req.params.id, {
    attributes: ['id', 'transferNumber', 'warehouseId', 'technicianId', 'attachmentName', 'attachmentData', 'signedAt', 'createdAt', 'updatedAt'],
    include: [Technician],
  });
  if (!loss || !isTechnicianLossRecord(loss)) return fail(res, 404, 'Perda/desconto não encontrada.');
  if (!canAccessTechnicianLoss(req.user, loss)) return fail(res, 403, 'Você não tem acesso à cidade desta perda.');

  const attachments = readLossAttachments(loss);
  const index = Number(req.params.index);
  if (!Number.isInteger(index) || index < 0 || index >= attachments.length) {
    return fail(res, 404, 'Anexo não encontrado nesta perda.');
  }
  return ok(res, attachments[index]);
});

exports.appendTechnicianLossAttachments = asyncHandler(async (req, res) => {
  const loss = await Transfer.findByPk(req.params.id, { include: [Technician] });
  if (!loss || !isTechnicianLossRecord(loss)) return fail(res, 404, 'Perda/desconto não encontrada.');
  if (!canAccessTechnicianLoss(req.user, loss)) return fail(res, 403, 'Você não tem acesso à cidade desta perda.');

  let incomingAttachments;
  try {
    incomingAttachments = prepareIncomingLossAttachments(req.body);
  } catch (error) {
    return fail(res, error.statusCode || 400, error.message);
  }
  if (!incomingAttachments.length) return fail(res, 400, 'Selecione pelo menos um arquivo PDF ou imagem válido.');

  const before = lossWithAttachments(loss, false);
  const existingAttachments = readLossAttachments(loss);
  const combinedAttachments = [...existingAttachments, ...incomingAttachments];
  if (combinedAttachments.length > LOSS_MAX_ATTACHMENTS_PER_RECORD) {
    return fail(res, 400, `Uma perda pode possuir no máximo ${LOSS_MAX_ATTACHMENTS_PER_RECORD} anexos.`);
  }

  let serializedAttachments;
  try {
    serializedAttachments = serializeLossAttachments(combinedAttachments);
  } catch (error) {
    return fail(res, error.statusCode || 413, error.message);
  }

  loss.status = 'assinado';
  loss.signedAt = loss.signedAt || new Date();
  loss.attachmentName = lossAttachmentSummary(combinedAttachments);
  loss.attachmentData = serializedAttachments;
  loss.signatureResponsible = req.body.signatureResponsible || loss.signatureResponsible || 'Documentos de reconhecimento anexados';
  await loss.save();

  const safeLoss = lossWithAttachments(loss, false);
  await writeAudit({
    req,
    action: 'loss_attachments_append',
    entity: 'TechnicianLoss',
    entityId: loss.id,
    message: `${incomingAttachments.length} documento(s) anexado(s) à perda ${loss.transferNumber}. Total de anexos: ${combinedAttachments.length}.`,
    beforeData: before,
    afterData: safeLoss,
  });
  return ok(res, safeLoss, `${incomingAttachments.length} documento(s) anexado(s) com sucesso.`);
});

exports.registerTechnicianLoss = asyncHandler(async (req, res) => {
  const {
    technicianId,
    reason,
    notes,
    occurredAt,
    attachmentName,
    attachmentData,
    signatureResponsible,
    items = [],
    toolIds = [],
  } = req.body;
  const lossType = req.body.lossType === 'ferramenta' ? 'ferramenta' : 'material';

  if (!technicianId) return fail(res, 400, 'Selecione o técnico responsável pela perda.');
  if (!String(reason || '').trim()) return fail(res, 400, 'Informe o motivo da perda/desconto.');
  if (lossType === 'material' && (!Array.isArray(items) || !items.length)) {
    return fail(res, 400, 'Adicione ao menos um material perdido.');
  }
  if (lossType === 'material') {
    try { assertUniqueOperationItems(items); } catch (error) { return fail(res, error.statusCode || 400, error.message); }
  }
  if (lossType === 'ferramenta' && (!Array.isArray(toolIds) || !toolIds.length)) {
    return fail(res, 400, 'Selecione ao menos uma ferramenta da ficha do técnico.');
  }

  let initialAttachments;
  let serializedInitialAttachments;
  try {
    initialAttachments = prepareIncomingLossAttachments(req.body);
    serializedInitialAttachments = serializeLossAttachments(initialAttachments);
  } catch (error) {
    return fail(res, error.statusCode || 400, error.message);
  }

  const technician = await Technician.findByPk(technicianId, { include: [{ model: Warehouse, as: 'defaultWarehouse' }] });
  if (!technician) return fail(res, 404, 'Técnico não encontrado.');
  try { assertTechnicianAccess(req.user, technician); } catch (error) { return fail(res, error.statusCode || 403, error.message); }

  const result = await sequelize.transaction(async (transaction) => {
    const reference = nextLossNumber();
    const typeLabel = lossType === 'ferramenta' ? 'FERRAMENTA' : 'MATERIAL';
    const record = await Transfer.create({
      transferNumber: reference,
      technicianId,
      deliveredAt: occurredAt || new Date(),
      status: initialAttachments.length ? 'assinado' : 'pendente_assinatura',
      signedAt: initialAttachments.length ? new Date() : null,
      attachmentName: lossAttachmentSummary(initialAttachments),
      attachmentData: serializedInitialAttachments,
      signatureResponsible: signatureResponsible || technician.name,
      notes: `GUIA DE PERDA/DESCONTO DE ${typeLabel}. Motivo: ${reason}. ${notes || ''}`.trim(),
      stampText: 'Reconheço a perda do(s) item(ns) listado(s), autorizo a conferência/desconto conforme política interna e declaro ciência da baixa em minha ficha de responsabilidade.',
      createdById: req.user.id,
    }, { transaction });

    let totalQuantity = 0;
    let totalValue = 0;
    const affected = [];

    if (lossType === 'ferramenta') {
      const normalizedToolIds = [...new Set(toolIds.map((id) => Number(id)).filter((id) => Number.isInteger(id) && id > 0))];
      if (!normalizedToolIds.length) throw new Error('Selecione ao menos uma ferramenta válida.');

      const tools = await TechnicianTool.findAll({
        where: {
          id: { [Op.in]: normalizedToolIds },
          technicianId,
          status: 'com_tecnico',
        },
        transaction,
        lock: transaction.LOCK.UPDATE,
      });

      if (tools.length !== normalizedToolIds.length) {
        throw new Error('Uma ou mais ferramentas não estão disponíveis na ficha deste técnico. Atualize a página e tente novamente.');
      }

      for (const tool of tools) {
        const beforeTool = tool.toJSON();
        const cost = money(tool.referenceValue || 0);

        await TransferItem.create({
          transferId: record.id,
          itemType: 'ferramenta',
          itemDescription: tool.name,
          technicianToolId: tool.id,
          quantity: 1,
          unitCost: cost,
          totalCost: cost,
          serialNumber: tool.serialNumber,
        }, { transaction });

        tool.status = 'perdida';
        tool.removedAt = new Date();
        tool.removalReason = `Perda/desconto ${reference}. Motivo: ${reason}. ${notes || ''}`.trim();
        tool.removedById = req.user.id;
        tool.notes = [tool.notes, `Baixada por perda/desconto ${reference}.`].filter(Boolean).join(' | ');
        await tool.save({ transaction });

        totalQuantity += 1;
        totalValue += Number(cost);
        affected.push({
          itemType: 'ferramenta',
          technicianToolId: tool.id,
          itemName: tool.name,
          serialNumber: tool.serialNumber,
          value: cost,
          before: beforeTool,
          after: tool.toJSON(),
        });
      }
    } else {
      for (const item of items) {
        const material = await Material.findByPk(item.materialId, { transaction });
        if (!material) throw new Error('Material não encontrado.');
        const unitCost = money(item.unitCost ?? material.unitCost);

        if (material.requiresSerial) {
          const serials = parseSerials(item.serialNumbers);
          if (!serials.length) throw new Error(`Selecione o serial perdido de ${material.name}.`);
          const repeated = serials.filter((serial, index) => serials.findIndex((s) => String(s).toUpperCase() === String(serial).toUpperCase()) !== index);
          if (repeated.length) throw new Error(`Serial repetido na perda: ${[...new Set(repeated)].join(', ')}.`);

          for (const serialNumber of serials) {
            const asset = await SerializedAsset.findOne({ where: { serialNumber }, transaction });
            if (!asset || asset.ownerType !== 'tecnico' || Number(asset.technicianId) !== Number(technicianId)) {
              throw new Error(`Serial não está sob responsabilidade do técnico: ${serialNumber}.`);
            }
            const beforeAsset = asset.toJSON();
            const cost = money(asset.acquisitionCost || unitCost);

            await TransferItem.create({
              transferId: record.id,
              itemType: 'material',
              itemDescription: material.name,
              materialId: material.id,
              assetId: asset.id,
              quantity: 1,
              unitCost: cost,
              totalCost: cost,
              serialNumber,
            }, { transaction });

            asset.ownerType = 'fornecedor';
            asset.status = 'perdido';
            asset.technicianId = null;
            asset.warehouseId = null;
            asset.lastMovementAt = new Date();
            asset.notes = [asset.notes, `Perda/desconto ${reference}: ${reason}`, notes].filter(Boolean).join(' | ');
            await asset.save({ transaction });

            await StockMovement.create({
              type: 'perda',
              materialId: material.id,
              assetId: asset.id,
              quantity: 1,
              serialNumber,
              fromOwnerType: 'tecnico',
              toOwnerType: 'perda',
              fromTechnicianId: technicianId,
              reference,
              notes: `Perda lançada para desconto do técnico ${technician.name}. Motivo: ${reason}. ${notes || ''}`.trim(),
              createdById: req.user.id,
            }, { transaction });

            totalQuantity += 1;
            totalValue += Number(cost);
            affected.push({ itemType: 'material', materialId: material.id, materialName: material.name, serialNumber, value: cost, before: beforeAsset, after: asset.toJSON() });
          }
        } else {
          const quantity = qty(item.quantity);
          if (quantity <= 0) throw new Error(`Informe uma quantidade válida para ${material.name}.`);
          await adjustBalance({ materialId: material.id, ownerType: 'tecnico', technicianId, delta: -quantity, transaction });
          const totalCost = money(quantity * unitCost);

          await TransferItem.create({
            transferId: record.id,
            itemType: 'material',
            itemDescription: material.name,
            materialId: material.id,
            quantity,
            unitCost,
            totalCost,
          }, { transaction });

          await StockMovement.create({
            type: 'perda',
            materialId: material.id,
            quantity,
            fromOwnerType: 'tecnico',
            toOwnerType: 'perda',
            fromTechnicianId: technicianId,
            reference,
            notes: `Perda lançada para desconto do técnico ${technician.name}. Motivo: ${reason}. ${notes || ''}`.trim(),
            createdById: req.user.id,
          }, { transaction });

          totalQuantity += quantity;
          totalValue += totalCost;
          affected.push({ itemType: 'material', materialId: material.id, materialName: material.name, quantity, value: totalCost });
        }
      }
    }

    record.totalQuantity = qty(totalQuantity);
    record.totalValue = money(totalValue);
    await record.save({ transaction });

    await Notification.create({
      role: 'admin',
      type: 'patrimonio',
      severity: 'danger',
      title: `Perda registrada ${reference}`,
      message: `${technician.name} teve ${qty(totalQuantity)} item(ns) de ${lossType === 'ferramenta' ? 'ferramenta' : 'material'} baixado(s) por perda/desconto no valor de ${new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(money(totalValue))}.`,
      route: '/perdas-tecnico',
      metadata: { transferId: record.id, reference, technicianId, lossType },
    }, { transaction });

    await writeAudit({
      req,
      action: lossType === 'ferramenta' ? 'technician_tool_loss' : 'technician_loss',
      entity: 'TechnicianLoss',
      entityId: record.id,
      message: `Perda/desconto ${reference} baixou ${qty(totalQuantity)} item(ns) de ${lossType === 'ferramenta' ? 'ferramenta' : 'material'} da responsabilidade de ${technician.name}.`,
      afterData: { transfer: lossWithAttachments(record, false), technician: technician.toJSON(), lossType, reason, notes, totalQuantity: qty(totalQuantity), totalValue: money(totalValue), affected },
      transaction,
    });

    return record;
  });

  return created(res, result, `Perda registrada, ${lossType === 'ferramenta' ? 'ferramenta baixada da ficha' : 'material baixado da caixa'} do técnico e guia gerada.`);
});


exports.serialLife = asyncHandler(async (req, res) => {
  const serial = String(req.params.serial || req.query.serial || '').trim();
  if (!serial) return fail(res, 400, 'Informe o serial para consulta.');
  const asset = await SerializedAsset.findOne({ where: { serialNumber: serial }, include: [Material, Technician, Warehouse] });
  if (!asset) return fail(res, 404, 'Serial não encontrado no patrimônio.');

  if (!isPrivileged(req.user)) {
    try {
      if (asset.ownerType === 'estoque') {
        assertWarehouseAccess(req.user, asset.warehouseId, 'Você não tem acesso à cidade deste equipamento.');
      } else if (asset.ownerType === 'tecnico') {
        const technician = await Technician.findByPk(asset.technicianId, { include: [{ model: Warehouse, as: 'defaultWarehouse' }] });
        assertTechnicianAccess(req.user, technician, 'Você não tem acesso à cidade deste equipamento.');
      } else if (asset.ownerType === 'cliente') {
        const installedItem = await ServiceOrderMaterial.findOne({
          where: { assetId: asset.id },
          include: [{ model: ServiceOrder, include: [Warehouse] }],
          order: [['createdAt', 'DESC'], ['id', 'DESC']],
        });
        assertWarehouseAccess(req.user, installedItem?.ServiceOrder?.warehouseId, 'Você não tem acesso à cidade deste equipamento.');
      } else {
        throw Object.assign(new Error('Você não tem acesso à cidade deste equipamento.'), { statusCode: 403 });
      }
    } catch (error) {
      return fail(res, error.statusCode || 403, error.message);
    }
  }

  const [movements, transferItems, osItems] = await Promise.all([
    StockMovement.findAll({ where: { serialNumber: serial }, include: [Material, SerializedAsset, { model: Technician, as: 'fromTechnician' }, { model: Technician, as: 'toTechnician' }, { model: Warehouse, as: 'fromWarehouse' }, { model: Warehouse, as: 'toWarehouse' }, { model: User, as: 'createdBy', attributes: ['id', 'name', 'email', 'role'] }], order: [['movementAt', 'DESC'], ['createdAt', 'DESC'], ['id', 'DESC']] }),
    TransferItem.findAll({ where: { serialNumber: serial }, include: [{ model: Transfer, attributes: { exclude: ['attachmentData', 'stampText'] }, include: [Technician, Warehouse] }, Material], order: [['createdAt', 'DESC'], ['id', 'DESC']] }),
    ServiceOrderMaterial.findAll({ where: { serialNumber: serial }, include: [{ model: ServiceOrder, include: [Technician, Warehouse] }, Material], order: [['createdAt', 'DESC'], ['id', 'DESC']] }),
  ]);
  return ok(res, {
    asset: { ...asset.toJSON(), custodyDays: daysBetween(asset.custodyStartedAt) },
    lifecycle: movements,
    transfers: transferItems,
    serviceOrders: osItems,
    summary: {
      serial,
      material: asset.Material?.name,
      currentOwner: asset.ownerType,
      status: asset.status,
      technician: asset.Technician?.name || null,
      warehouse: asset.Warehouse?.name || null,
      customerName: asset.customerName || null,
      acquisitionCost: asset.acquisitionCost || asset.Material?.unitCost || 0,
      movementCount: movements.length,
      firstMovement: movements[0]?.movementAt || null,
      lastMovement: movements[movements.length - 1]?.movementAt || null,
    },
  });
});
