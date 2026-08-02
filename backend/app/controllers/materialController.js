const sequelize = require('../../config/db');
const { Op } = require('sequelize');
const { Material, StockBalance, SerializedAsset, StockMovement, Warehouse } = require('../models');
const { crudController } = require('./crudHelpers');
const asyncHandler = require('../utils/asyncHandler');
const { ok, created, fail } = require('../utils/response');
const { stockWhereForUser, assertWarehouseAccess, warehouseListWhere } = require('../utils/warehouseAccess');
const { adjustBalance } = require('../services/stockService');
const { writeAudit } = require('../services/auditService');
const { money, qty } = require('../utils/number');
const { normalizeBoolean, isTrue } = require('../utils/booleans');

const base = crudController(Material, 'Material');


const BOOLEAN_FIELDS = [
  'requiresSerial',
  'active',
  'allowTechnicianTransfer',
  'allowCustomerInstall',
  'requiresReturnOnRemoval',
  'autoLowStockAlert',
];

function normalizeMaterialPayload(payload = {}, current = {}) {
  const normalized = { ...payload };
  for (const field of BOOLEAN_FIELDS) {
    if (Object.prototype.hasOwnProperty.call(normalized, field)) {
      normalized[field] = normalizeBoolean(normalized[field], Boolean(current[field]));
    }
  }
  return normalized;
}

function normalizeSerials(value) {
  if (Array.isArray(value)) return value.map((item) => String(item).trim()).filter(Boolean);
  return String(value || '').split(/\n|,|;/).map((item) => item.trim()).filter(Boolean);
}

exports.list = asyncHandler(async (req, res) => {
  const materialWhere = {};
  if (req.query.category) materialWhere.category = req.query.category;
  if (String(req.query.activeOnly || '').toLowerCase() === 'true') materialWhere.active = true;
  if (req.query.search) {
    const search = `%${String(req.query.search).trim()}%`;
    materialWhere[Op.or] = [
      { sku: { [Op.iLike]: search } },
      { name: { [Op.iLike]: search } },
      { commercialName: { [Op.iLike]: search } },
    ];
  }

  const requestedWarehouseId = Number(req.query.warehouseId || 0);
  const warehouseScope = stockWhereForUser(req.user, requestedWarehouseId || null);
  const warehouseFilters = [warehouseListWhere(req.user), { isReverseLogistics: false }];
  if (requestedWarehouseId > 0) warehouseFilters.push({ id: requestedWarehouseId });
  if (req.query.city) warehouseFilters.push({ city: { [Op.iLike]: String(req.query.city).trim() } });
  const visibleWarehouseWhere = { [Op.and]: warehouseFilters };

  const [records, visibleWarehouses] = await Promise.all([
    Material.findAll({ where: materialWhere, order: [['name', 'ASC']] }),
    Warehouse.findAll({
      where: visibleWarehouseWhere,
      attributes: ['id', 'name', 'code', 'city', 'region', 'state', 'status'],
      order: [['city', 'ASC'], ['name', 'ASC']],
    }),
  ]);

  const visibleWarehouseIds = visibleWarehouses.map((warehouse) => Number(warehouse.id));
  const stockAnd = [warehouseScope];
  if (visibleWarehouseIds.length) stockAnd.push({ warehouseId: { [Op.in]: visibleWarehouseIds } });
  else stockAnd.push({ warehouseId: -1 });

  const [balances, assets] = await Promise.all([
    StockBalance.findAll({
      where: {
        ownerType: 'estoque',
        technicianId: null,
        quantity: { [Op.gt]: 0 },
        [Op.and]: stockAnd,
      },
      attributes: ['materialId', 'warehouseId', 'quantity'],
    }),
    SerializedAsset.findAll({
      where: {
        ownerType: 'estoque',
        status: 'em_estoque',
        [Op.and]: stockAnd,
      },
      attributes: ['materialId', 'warehouseId'],
    }),
  ]);

  const balancesByMaterialWarehouse = new Map();
  const assetsByMaterialWarehouse = new Map();
  for (const balance of balances) {
    const key = `${balance.materialId}:${balance.warehouseId || 0}`;
    balancesByMaterialWarehouse.set(key, Number(balancesByMaterialWarehouse.get(key) || 0) + Number(balance.quantity || 0));
  }
  for (const asset of assets) {
    const key = `${asset.materialId}:${asset.warehouseId || 0}`;
    assetsByMaterialWarehouse.set(key, Number(assetsByMaterialWarehouse.get(key) || 0) + 1);
  }

  let enriched = records.map((material) => {
    const serialized = isTrue(material.requiresSerial);
    const stockMap = serialized ? assetsByMaterialWarehouse : balancesByMaterialWarehouse;
    const warehouseStocks = visibleWarehouses.map((warehouse) => ({
      warehouseId: warehouse.id,
      warehouseName: warehouse.name,
      warehouseCode: warehouse.code,
      city: warehouse.city,
      state: warehouse.state,
      region: warehouse.region,
      quantity: Number(stockMap.get(`${material.id}:${warehouse.id}`) || 0),
    }));
    const mainStock = warehouseStocks.reduce((sum, row) => sum + Number(row.quantity || 0), 0);
    return { ...material.toJSON(), mainStock, availableQuantity: mainStock, warehouseStocks };
  });

  if (String(req.query.transferableOnly || '').toLowerCase() === 'true') {
    enriched = enriched.filter((material) => (
      String(material.category || '').toLowerCase() !== 'ferramenta'
      && material.active !== false
      && material.allowTechnicianTransfer !== false
      && String(material.movementPolicy || 'livre').toLowerCase() !== 'bloqueado'
    ));
  }
  if (String(req.query.availableOnly || '').toLowerCase() === 'true') {
    enriched = enriched.filter((material) => Number(material.mainStock || 0) > 0);
  }
  if (req.query.stockStatus === 'positive') enriched = enriched.filter((material) => Number(material.mainStock || 0) > 0);
  if (req.query.stockStatus === 'zero') enriched = enriched.filter((material) => Number(material.mainStock || 0) <= 0);
  if (req.query.stockStatus === 'low') {
    enriched = enriched.filter((material) => Number(material.minStock || 0) > 0 && Number(material.mainStock || 0) <= Number(material.minStock || 0));
  }

  return ok(res, enriched);
});

exports.get = base.get;

exports.create = asyncHandler(async (req, res) => {
  const {
    initialWarehouseId,
    initialQuantity = 0,
    initialSerialNumbers = [],
    initialSerialsText = '',
    ...payload
  } = req.body;

  const normalizedPayload = normalizeMaterialPayload(payload);

  if (!normalizedPayload.sku || !normalizedPayload.name) return fail(res, 400, 'SKU e nome do material são obrigatórios.');
  if (!initialWarehouseId) return fail(res, 400, 'Selecione o estoque regional onde este material será cadastrado.');

  try { assertWarehouseAccess(req.user, initialWarehouseId, 'Você não tem acesso ao estoque regional informado.'); } catch (error) { return fail(res, error.statusCode || 403, error.message); }

  const warehouse = await Warehouse.findByPk(initialWarehouseId);
  if (!warehouse || warehouse.status !== 'ativo') return fail(res, 404, 'Estoque regional informado não existe ou está inativo.');
  if (warehouse.isReverseLogistics) return fail(res, 400, 'O cadastro inicial de material não pode usar estoque de logística reversa. Cadastre o material e utilize a tela Entrada em Estoque.');

  const serials = normalizeSerials(initialSerialNumbers.length ? initialSerialNumbers : initialSerialsText);
  const requiresSerial = isTrue(normalizedPayload.requiresSerial);
  // Materiais sem serial não recebem saldo no cadastro do catálogo. A quantidade real
  // deve nascer exclusivamente pela tela Entrada em Estoque, evitando a unidade extra.
  const quantity = requiresSerial ? serials.length : 0;

  if (requiresSerial && quantity > 0 && serials.length !== quantity) return fail(res, 400, 'A quantidade de seriais precisa bater com a quantidade inicial.');

  const result = await sequelize.transaction(async (transaction) => {
    const material = await Material.create(normalizedPayload, { transaction });
    const unitCost = money(material.unitCost || 0);

    if (quantity > 0) {
      if (isTrue(material.requiresSerial)) {
        for (const serialNumber of serials) {
          const existing = await SerializedAsset.findOne({ where: { serialNumber }, transaction });
          if (existing) throw new Error(`Serial duplicado: ${serialNumber}.`);
          const asset = await SerializedAsset.create({
            materialId: material.id,
            serialNumber,
            ownerType: 'estoque',
            status: 'em_estoque',
            warehouseId: initialWarehouseId,
            acquisitionCost: unitCost,
            lastMovementAt: new Date(),
            notes: `Cadastro inicial direto no estoque ${warehouse.name}.`,
          }, { transaction });
          await StockMovement.create({
            type: 'entrada',
            materialId: material.id,
            assetId: asset.id,
            quantity: 1,
            serialNumber,
            toOwnerType: 'estoque',
            toWarehouseId: initialWarehouseId,
            reference: `CAD-MAT-${material.sku}`,
            notes: `Cadastro inicial do material no estoque ${warehouse.name}.`,
            createdById: req.user.id,
          }, { transaction });
        }
      } else {
        await adjustBalance({ materialId: material.id, ownerType: 'estoque', technicianId: null, warehouseId: initialWarehouseId, delta: quantity, transaction });
        await StockMovement.create({
          type: 'entrada',
          materialId: material.id,
          quantity,
          toOwnerType: 'estoque',
          toWarehouseId: initialWarehouseId,
          reference: `CAD-MAT-${material.sku}`,
          notes: `Cadastro inicial do material no estoque ${warehouse.name}.`,
          createdById: req.user.id,
        }, { transaction });
      }
    }

    await writeAudit({
      req,
      action: 'create',
      entity: 'Material',
      entityId: material.id,
      message: `Material ${material.name} cadastrado diretamente no estoque ${warehouse.name}.`,
      afterData: { ...material.toJSON(), initialWarehouse: warehouse.toJSON(), initialQuantity: quantity, initialSerials: serials },
      transaction,
    });

    return material;
  });

  return created(res, result, 'Material cadastrado no estoque regional.');
});

exports.update = asyncHandler(async (req, res) => {
  const material = await Material.findByPk(req.params.id);
  if (!material) return fail(res, 404, 'Material não encontrado.');

  const before = material.toJSON();
  const payload = normalizeMaterialPayload(req.body, before);

  await material.update(payload);
  await writeAudit({
    req,
    action: 'update',
    entity: 'Material',
    entityId: material.id,
    message: `Material ${material.name} atualizado.`,
    beforeData: before,
    afterData: material.toJSON(),
  });

  return ok(res, material, 'Material atualizado.');
});
