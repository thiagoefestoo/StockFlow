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
} = require('../models');
const asyncHandler = require('../utils/asyncHandler');
const { ok, created, fail } = require('../utils/response');
const { daysBetween, qty, money, normalizeDoc } = require('../utils/number');
const { adjustBalance } = require('../services/stockService');
const { writeAudit } = require('../services/auditService');
const { stockWhereForUser, movementWhereForUser, assertWarehouseAccess } = require('../utils/warehouseAccess');

function parseSerials(value) {
  if (Array.isArray(value)) return value.map((s) => String(s).trim()).filter(Boolean);
  return String(value || '').split(/\n|,|;/).map((s) => s.trim()).filter(Boolean);
}

exports.overview = asyncHandler(async (req, res) => {
  const materials = await Material.findAll({ order: [['name', 'ASC']] });
  const warehouseScope = stockWhereForUser(req.user, req.query.warehouseId);
  const rows = [];
  for (const material of materials) {
    const balanceWhere = { materialId: material.id, ownerType: 'estoque', technicianId: null, ...warehouseScope };
    const assetWhere = { materialId: material.id, ownerType: 'estoque', ...warehouseScope };
    const mainBalance = await StockBalance.sum('quantity', { where: balanceWhere });
    const mainAssets = await SerializedAsset.count({ where: assetWhere });
    const techAssets = await SerializedAsset.count({ where: { materialId: material.id, ownerType: 'tecnico' } });
    const installedAssets = await SerializedAsset.count({ where: { materialId: material.id, ownerType: 'cliente' } });
    const techBalances = await StockBalance.sum('quantity', { where: { materialId: material.id, ownerType: 'tecnico' } });
    rows.push({
      ...material.toJSON(),
      mainStock: material.requiresSerial ? mainAssets : Number(mainBalance || 0),
      technicianStock: material.requiresSerial ? techAssets : Number(techBalances || 0),
      installedStock: material.requiresSerial ? installedAssets : 0,
    });
  }
  return ok(res, rows);
});

exports.assets = asyncHandler(async (req, res) => {
  const where = {};
  if (req.query.status) where.status = req.query.status;
  if (req.query.ownerType) where.ownerType = req.query.ownerType;
  if (req.query.materialId) where.materialId = req.query.materialId;
  if (req.query.technicianId) where.technicianId = req.query.technicianId;
  if ((req.query.ownerType || 'estoque') === 'estoque') Object.assign(where, stockWhereForUser(req.user, req.query.warehouseId));
  if (req.query.serial) where.serialNumber = { [Op.iLike]: `%${req.query.serial}%` };
  const limit = Math.min(Number(req.query.limit || 800), 2000);
  const assets = await SerializedAsset.findAll({ where, include: [Material, Technician, Warehouse], order: [['updatedAt', 'DESC']], limit });
  return ok(res, assets.map((asset) => ({ ...asset.toJSON(), custodyDays: daysBetween(asset.custodyStartedAt) })));
});

exports.movements = asyncHandler(async (req, res) => {
  const where = {};
  const and = [];
  if (req.query.type) where.type = req.query.type;
  if (req.query.materialId) where.materialId = req.query.materialId;
  if (req.query.technicianId) and.push({ [Op.or]: [{ fromTechnicianId: req.query.technicianId }, { toTechnicianId: req.query.technicianId }] });
  const movementScope = movementWhereForUser(req.user, req.query.warehouseId);
  if (movementScope) and.push(movementScope);
  if (req.query.search) {
    const q = `%${req.query.search}%`;
    and.push({ [Op.or]: [{ serialNumber: { [Op.iLike]: q } }, { reference: { [Op.iLike]: q } }, { notes: { [Op.iLike]: q } }] });
  }
  if (and.length) where[Op.and] = and;
  const limit = Math.min(Number(req.query.limit || 1000), 3000);
  const movements = await StockMovement.findAll({
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
    order: [['movementAt', 'DESC']],
    limit,
  });
  return ok(res, movements);
});

exports.technicianBox = asyncHandler(async (req, res) => {
  const technician = await Technician.findByPk(req.params.id, { include: [ContractorCompany] });
  if (!technician) return fail(res, 404, 'Técnico não encontrado.');
  const assets = await SerializedAsset.findAll({
    where: { technicianId: technician.id, ownerType: 'tecnico' },
    include: [Material, Warehouse],
    order: [['custodyStartedAt', 'ASC'], ['serialNumber', 'ASC']],
  });
  const balances = await StockBalance.findAll({
    where: { technicianId: technician.id, ownerType: 'tecnico' },
    include: [Material, Warehouse],
    order: [[Material, 'name', 'ASC']],
  });
  const movements = await StockMovement.findAll({
    where: { [Op.or]: [{ fromTechnicianId: technician.id }, { toTechnicianId: technician.id }] },
    include: [Material, SerializedAsset, { model: User, as: 'createdBy', attributes: ['id', 'name', 'email', 'role'] }, { model: Technician, as: 'fromTechnician' }, { model: Technician, as: 'toTechnician' }],
    order: [['movementAt', 'DESC']],
    limit: 250,
  });
  const orders = await ServiceOrder.findAll({
    where: { technicianId: technician.id },
    include: [{ model: ServiceOrderMaterial, include: [Material, SerializedAsset] }],
    order: [['createdAt', 'DESC']],
    limit: 80,
  });

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

function nextReturnNumber() {
  const now = new Date();
  const stamp = `${now.getFullYear()}${String(now.getMonth() + 1).padStart(2, '0')}${String(now.getDate()).padStart(2, '0')}-${String(now.getHours()).padStart(2, '0')}${String(now.getMinutes()).padStart(2, '0')}${String(now.getSeconds()).padStart(2, '0')}`;
  return `RETORNO-${stamp}`;
}

exports.returnFromTechnician = asyncHandler(async (req, res) => {
  const { technicianId, reference, notes, warehouseId, attachmentName, attachmentData, signatureResponsible } = req.body;
  const items = Array.isArray(req.body.items) ? req.body.items : [];
  const targetWarehouseId = warehouseId || null;
  if (!technicianId) return fail(res, 400, 'Técnico é obrigatório.');
  if (!targetWarehouseId) return fail(res, 400, 'Selecione o estoque de destino para retorno do material.');
  if (!items.length) return fail(res, 400, 'Selecione pelo menos um item da caixa do técnico para retornar ao estoque.');
  const technician = await Technician.findByPk(technicianId);
  if (!technician) return fail(res, 404, 'Técnico não encontrado.');
  const targetWarehouse = await Warehouse.findByPk(targetWarehouseId);
  if (!targetWarehouse) return fail(res, 404, 'Estoque de destino não encontrado.');
  if (targetWarehouse.status && targetWarehouse.status !== 'ativo') return fail(res, 400, 'O estoque de destino precisa estar ativo.');
  try { assertWarehouseAccess(req.user, targetWarehouseId, 'Você não tem acesso ao estoque de destino.'); } catch (error) { return fail(res, error.statusCode || 403, error.message); }

  const result = await sequelize.transaction(async (transaction) => {
    let totalQuantity = 0;
    let totalValue = 0;
    const movementReference = reference || nextReturnNumber();
    const affected = [];

    const transfer = await Transfer.create({
      transferNumber: movementReference,
      technicianId,
      deliveredAt: new Date(),
      status: attachmentData ? 'assinado' : 'pendente_assinatura',
      signedAt: attachmentData ? new Date() : null,
      attachmentName: attachmentName || null,
      attachmentData: attachmentData || null,
      signatureResponsible: signatureResponsible || null,
      notes: `RETORNO DA CAIXA DO TÉCNICO PARA ESTOQUE. ${notes || ''}`.trim(),
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
        if (!serials.length) continue;
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
          await StockMovement.create({ type: 'retorno_tecnico', materialId: material.id, assetId: asset.id, quantity: 1, serialNumber, fromOwnerType: 'tecnico', toOwnerType: 'estoque', fromTechnicianId: technicianId, toWarehouseId: targetWarehouseId, reference: movementReference, notes: notes || 'Retorno administrativo da caixa do técnico.', createdById: req.user.id }, { transaction });
          totalQuantity += 1;
          totalValue += Number(cost);
          affected.push({ serialNumber, before: beforeAsset, after: asset.toJSON() });
        }
      } else {
        const quantity = qty(item.quantity);
        if (quantity <= 0) continue;
        await adjustBalance({ materialId: material.id, ownerType: 'tecnico', technicianId, delta: -quantity, transaction });
        await adjustBalance({ materialId: material.id, ownerType: 'estoque', technicianId: null, warehouseId: targetWarehouseId, delta: quantity, transaction });
        const totalCost = money(quantity * unitCost);
        await TransferItem.create({ transferId: transfer.id, materialId: material.id, quantity, unitCost, totalCost }, { transaction });
        await StockMovement.create({ type: 'retorno_tecnico', materialId: material.id, quantity, fromOwnerType: 'tecnico', toOwnerType: 'estoque', fromTechnicianId: technicianId, toWarehouseId: targetWarehouseId, reference: movementReference, notes: notes || 'Retorno administrativo da caixa do técnico.', createdById: req.user.id }, { transaction });
        totalQuantity += quantity;
        totalValue += Number(totalCost);
        affected.push({ materialId: material.id, quantity });
      }
    }

    if (!affected.length || totalQuantity <= 0) throw new Error('Nenhum item válido foi selecionado para retorno ao estoque.');

    transfer.totalQuantity = qty(totalQuantity);
    transfer.totalValue = money(totalValue);
    await transfer.save({ transaction });

    await Notification.create({
      role: 'admin',
      type: 'estoque',
      severity: 'info',
      title: `Retorno registrado ${transfer.transferNumber}`,
      message: `${qty(totalQuantity)} item(ns) retornaram da caixa de ${technician.name} para o estoque ${targetWarehouse.name}.`,
      route: '/transferencias',
      metadata: { transferId: transfer.id, technicianId: Number(technicianId), warehouseId: targetWarehouseId, totalQuantity: qty(totalQuantity) },
    }, { transaction });

    await writeAudit({
      req,
      action: 'return_to_stock',
      entity: 'Transfer',
      entityId: transfer.id,
      message: `Guia ${transfer.transferNumber} retornou ${qty(totalQuantity)} item(ns) da caixa de ${technician.name} para o estoque ${targetWarehouse.name}.`,
      afterData: { ...transfer.toJSON(), warehouse: targetWarehouse.toJSON(), totalQuantity: qty(totalQuantity), totalValue: money(totalValue), affected },
      transaction,
    });
    return { ...transfer.toJSON(), reference: movementReference, transferId: transfer.id, affectedCount: affected.length };
  });

  return created(res, result, 'Material devolvido da caixa do técnico para o estoque e guia de retorno gerada em Transferências.');
});


exports.moveFromTechnicianToClient = asyncHandler(async (req, res) => {
  let { technicianId, osNumber, customerName, customerCpf, customerAddress, city, serviceType = 'outro', completedAt, reference, notes, items = [] } = req.body;
  if (req.user.role === 'tecnico') technicianId = req.user.technicianId;
  if (!technicianId) return fail(res, 400, 'Técnico é obrigatório.');
  if (!items.length) {
    const defaults = await StockBalance.findAll({ where: { technicianId, ownerType: 'tecnico' }, include: [Material] });
    items = defaults.filter((row) => ['drop', 'cabo', 'conector', 'esticador'].includes(String(row.Material?.category || '').toLowerCase())).map((row) => ({ materialId: row.materialId, quantity: Math.min(Number(row.quantity || 0), row.Material?.category === 'drop' || row.Material?.category === 'cabo' ? 50 : 2) })).filter((item) => item.quantity > 0);
    if (!items.length) return fail(res, 400, 'Informe itens ou mantenha materiais padrão disponíveis na caixa do técnico.');
  }
  if (!customerName || !customerCpf) return fail(res, 400, 'Nome do cliente e número do contrato são obrigatórios.');
  const technician = await Technician.findByPk(technicianId);
  if (!technician) return fail(res, 404, 'Técnico não encontrado.');

  const result = await sequelize.transaction(async (transaction) => {
    let totalQuantity = 0;
    let totalValue = 0;
    const movementReference = osNumber || reference || `CLIENTE-${new Date().toISOString().replace(/[-:TZ.]/g, '').slice(0, 14)}`;
    let order = null;
    if (osNumber) {
      order = await ServiceOrder.create({
        technicianId,
        osNumber,
        customerName,
        customerCpf: normalizeDoc(customerCpf),
        customerAddress,
        city,
        serviceType,
        status: 'concluida',
        completedAt: completedAt || new Date(),
        notes,
        createdById: req.user.id,
      }, { transaction });
    }

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
          asset.notes = [asset.notes, notes ? `Transferido para cliente: ${notes}` : null].filter(Boolean).join(' | ');
          await asset.save({ transaction });
          if (order) await ServiceOrderMaterial.create({ serviceOrderId: order.id, materialId: material.id, assetId: asset.id, quantity: 1, serialNumber, unitCost: cost, totalCost: cost }, { transaction });
          await StockMovement.create({ type: 'baixa_os', materialId: material.id, assetId: asset.id, quantity: 1, serialNumber, fromOwnerType: 'tecnico', toOwnerType: 'cliente', fromTechnicianId: technicianId, reference: movementReference, notes: notes || 'Movimentação administrativa da caixa do técnico para cliente.', createdById: req.user.id }, { transaction });
          totalQuantity += 1;
          totalValue += Number(cost);
          affected.push({ serialNumber, customerName });
        }
      } else {
        const quantity = qty(item.quantity);
        if (quantity <= 0) continue;
        await adjustBalance({ materialId: material.id, ownerType: 'tecnico', technicianId, delta: -quantity, transaction });
        const totalCost = money(quantity * unitCost);
        if (order) await ServiceOrderMaterial.create({ serviceOrderId: order.id, materialId: material.id, quantity, unitCost, totalCost }, { transaction });
        await StockMovement.create({ type: 'baixa_os', materialId: material.id, quantity, fromOwnerType: 'tecnico', toOwnerType: 'cliente', fromTechnicianId: technicianId, reference: movementReference, notes: notes || 'Movimentação administrativa da caixa do técnico para cliente.', createdById: req.user.id }, { transaction });
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
      afterData: { reference: movementReference, osId: order?.id || null, customerName, customerCpf: normalizeDoc(customerCpf), totalQuantity: qty(totalQuantity), totalValue: money(totalValue), affected },
      transaction,
    });

    return { reference: movementReference, osId: order?.id || null, totalQuantity: qty(totalQuantity), totalValue: money(totalValue), affectedCount: affected.length };
  });

  return created(res, result, 'Material movimentado da caixa do técnico para o cliente.');
});


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
    include: [
      Technician,
      Warehouse,
      { model: TransferItem, include: [Material, SerializedAsset] },
      { model: User, as: 'createdBy', attributes: ['id', 'name', 'email', 'role'] },
    ],
    order: [['deliveredAt', 'DESC'], ['createdAt', 'DESC']],
    limit: 400,
  });
  return ok(res, rows);
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
  } = req.body;

  if (!technicianId) return fail(res, 400, 'Selecione o técnico responsável pela perda.');
  if (!String(reason || '').trim()) return fail(res, 400, 'Informe o motivo da perda/desconto.');
  if (!Array.isArray(items) || !items.length) return fail(res, 400, 'Adicione ao menos um material perdido.');

  const technician = await Technician.findByPk(technicianId);
  if (!technician) return fail(res, 404, 'Técnico não encontrado.');

  const result = await sequelize.transaction(async (transaction) => {
    const reference = nextLossNumber();
    const record = await Transfer.create({
      transferNumber: reference,
      technicianId,
      deliveredAt: occurredAt || new Date(),
      status: attachmentData ? 'assinado' : 'pendente_assinatura',
      signedAt: attachmentData ? new Date() : null,
      attachmentName: attachmentName || null,
      attachmentData: attachmentData || null,
      signatureResponsible: signatureResponsible || technician.name,
      notes: `GUIA DE PERDA/DESCONTO. Motivo: ${reason}. ${notes || ''}`.trim(),
      stampText: 'Reconheço a perda do(s) material(is) listado(s), autorizo a conferência/desconto conforme política interna e declaro ciência da baixa em minha caixa técnica.',
      createdById: req.user.id,
    }, { transaction });

    let totalQuantity = 0;
    let totalValue = 0;
    const affected = [];

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
          affected.push({ materialId: material.id, materialName: material.name, serialNumber, value: cost, before: beforeAsset, after: asset.toJSON() });
        }
      } else {
        const quantity = qty(item.quantity);
        if (quantity <= 0) throw new Error(`Informe uma quantidade válida para ${material.name}.`);
        await adjustBalance({ materialId: material.id, ownerType: 'tecnico', technicianId, delta: -quantity, transaction });
        const totalCost = money(quantity * unitCost);

        await TransferItem.create({
          transferId: record.id,
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
        affected.push({ materialId: material.id, materialName: material.name, quantity, value: totalCost });
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
      message: `${technician.name} teve ${qty(totalQuantity)} item(ns) baixados por perda/desconto no valor de ${new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(money(totalValue))}.`,
      route: '/perdas-tecnico',
      metadata: { transferId: record.id, reference, technicianId },
    }, { transaction });

    await writeAudit({
      req,
      action: 'technician_loss',
      entity: 'TechnicianLoss',
      entityId: record.id,
      message: `Perda/desconto ${reference} baixou ${qty(totalQuantity)} item(ns) da caixa de ${technician.name}.`,
      afterData: { transfer: record.toJSON(), technician: technician.toJSON(), reason, notes, totalQuantity: qty(totalQuantity), totalValue: money(totalValue), affected },
      transaction,
    });

    return record;
  });

  return created(res, result, 'Perda registrada, material baixado da caixa do técnico e guia gerada.');
});


exports.serialLife = asyncHandler(async (req, res) => {
  const serial = String(req.params.serial || req.query.serial || '').trim();
  if (!serial) return fail(res, 400, 'Informe o serial para consulta.');
  const asset = await SerializedAsset.findOne({ where: { serialNumber: serial }, include: [Material, Technician, Warehouse] });
  if (!asset) return fail(res, 404, 'Serial não encontrado no patrimônio.');
  const [movements, transferItems, osItems] = await Promise.all([
    StockMovement.findAll({ where: { serialNumber: serial }, include: [Material, SerializedAsset, { model: Technician, as: 'fromTechnician' }, { model: Technician, as: 'toTechnician' }, { model: Warehouse, as: 'fromWarehouse' }, { model: Warehouse, as: 'toWarehouse' }, { model: User, as: 'createdBy', attributes: ['id', 'name', 'email', 'role'] }], order: [['movementAt', 'ASC']] }),
    TransferItem.findAll({ where: { serialNumber: serial }, include: [{ model: Transfer, include: [Technician, Warehouse] }, Material], order: [['createdAt', 'ASC']] }),
    ServiceOrderMaterial.findAll({ where: { serialNumber: serial }, include: [{ model: ServiceOrder, include: [Technician, Warehouse] }, Material], order: [['createdAt', 'ASC']] }),
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
