const sequelize = require('../../config/db');
const { Material, StockBalance, SerializedAsset, StockMovement, Warehouse } = require('../models');
const { crudController } = require('./crudHelpers');
const asyncHandler = require('../utils/asyncHandler');
const { ok, created, fail } = require('../utils/response');
const { stockWhereForUser, assertWarehouseAccess } = require('../utils/warehouseAccess');
const { adjustBalance } = require('../services/stockService');
const { writeAudit } = require('../services/auditService');
const { money, qty } = require('../utils/number');

const base = crudController(Material, 'Material');

function normalizeSerials(value) {
  if (Array.isArray(value)) return value.map((item) => String(item).trim()).filter(Boolean);
  return String(value || '').split(/\n|,|;/).map((item) => item.trim()).filter(Boolean);
}

exports.list = asyncHandler(async (req, res) => {
  const records = await Material.findAll({ order: [['name', 'ASC']] });
  const warehouseScope = stockWhereForUser(req.user, req.query.warehouseId);
  const enriched = [];
  for (const material of records) {
    const mainBalance = await StockBalance.sum('quantity', { where: { materialId: material.id, ownerType: 'estoque', technicianId: null, ...warehouseScope } });
    const assets = await SerializedAsset.count({ where: { materialId: material.id, ownerType: 'estoque', ...warehouseScope } });
    enriched.push({ ...material.toJSON(), mainStock: material.requiresSerial ? assets : Number(mainBalance || 0) });
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

  if (!payload.sku || !payload.name) return fail(res, 400, 'SKU e nome do material são obrigatórios.');
  if (!initialWarehouseId) return fail(res, 400, 'Selecione o estoque regional onde este material será cadastrado.');

  try { assertWarehouseAccess(req.user, initialWarehouseId, 'Você não tem acesso ao estoque regional informado.'); } catch (error) { return fail(res, error.statusCode || 403, error.message); }

  const warehouse = await Warehouse.findByPk(initialWarehouseId);
  if (!warehouse || warehouse.status !== 'ativo') return fail(res, 404, 'Estoque regional informado não existe ou está inativo.');

  const serials = normalizeSerials(initialSerialNumbers.length ? initialSerialNumbers : initialSerialsText);
  const quantity = payload.requiresSerial ? serials.length : qty(initialQuantity || 0);

  if (payload.requiresSerial && quantity > 0 && serials.length !== quantity) return fail(res, 400, 'A quantidade de seriais precisa bater com a quantidade inicial.');

  const result = await sequelize.transaction(async (transaction) => {
    const material = await Material.create(payload, { transaction });
    const unitCost = money(material.unitCost || 0);

    if (quantity > 0) {
      if (material.requiresSerial) {
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

exports.update = base.update;
