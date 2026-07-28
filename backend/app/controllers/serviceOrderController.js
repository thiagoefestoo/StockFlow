const sequelize = require('../../config/db');
const { Op } = require('sequelize');
const { ServiceOrder, ServiceOrderMaterial, ServiceOrderEquipmentReplacement, Material, SerializedAsset, StockMovement, Technician, User } = require('../models');
const asyncHandler = require('../utils/asyncHandler');
const { ok, okPaginated, created, fail } = require('../utils/response');
const { paginationFromQuery, paginationMeta } = require('../utils/pagination');
const { money, qty, normalizeDoc } = require('../utils/number');
const { adjustBalance } = require('../services/stockService');
const { writeAudit } = require('../services/auditService');
const { assertUniqueOperationItems } = require('../utils/itemSelectionValidation');

function serviceRequiresSerial(serviceType, addressChangeType) {
  return serviceType === 'instalacao'
    || serviceType === 'troca_onu'
    || (serviceType === 'outro' && addressChangeType === 'com_troca');
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


function equipmentReplacementInclude() {
  return {
    model: ServiceOrderEquipmentReplacement,
    as: 'equipmentReplacements',
    include: [
      { model: SerializedAsset, as: 'oldAsset', include: [Material] },
      { model: SerializedAsset, as: 'newAsset', include: [Material] },
      { model: Material, as: 'oldMaterial' },
      { model: Material, as: 'newMaterial' },
      { model: User, as: 'performedBy', attributes: ['id', 'name', 'email', 'role'] },
    ],
  };
}

function replacementReference(order) {
  const now = new Date();
  const stamp = `${now.getFullYear()}${String(now.getMonth() + 1).padStart(2, '0')}${String(now.getDate()).padStart(2, '0')}-${String(now.getHours()).padStart(2, '0')}${String(now.getMinutes()).padStart(2, '0')}${String(now.getSeconds()).padStart(2, '0')}`;
  return `${order.osNumber}-SUB-${stamp}`;
}

exports.list = asyncHandler(async (req, res) => {
  const where = {};
  if (req.user.role === 'tecnico') where.technicianId = req.user.technicianId || -1;
  if (req.query.search) where[Op.or] = [{ osNumber: { [Op.iLike]: `%${req.query.search}%` } }, { customerName: { [Op.iLike]: `%${req.query.search}%` } }, { customerCpf: { [Op.iLike]: `%${req.query.search}%` } }];
  const pagination = paginationFromQuery(req.query);
  const query = {
    where,
    include: [Technician, { model: ServiceOrderMaterial, include: [Material, SerializedAsset] }, equipmentReplacementInclude()],
    order: [['createdAt', 'DESC']],
    ...(pagination.enabled ? { limit: pagination.limit, offset: pagination.offset } : { limit: 400 }),
  };
  const [orders, total] = await Promise.all([
    ServiceOrder.findAll(query),
    pagination.enabled ? ServiceOrder.count({ where }) : Promise.resolve(0),
  ]);
  return pagination.enabled
    ? okPaginated(res, orders, paginationMeta(total, pagination.page, pagination.pageSize))
    : ok(res, orders);
});

exports.create = asyncHandler(async (req, res) => {
  let { technicianId, osNumber, customerName, customerCpf, customerAddress, city, serviceType = 'instalacao', addressChangeType, status, completedAt, notes, materials = [] } = req.body;
  if (req.user.role === 'tecnico') technicianId = req.user.technicianId;
  if (!technicianId) return fail(res, 400, 'Técnico não identificado.');
  if (!osNumber || !customerName || !customerCpf) return fail(res, 400, 'OS, nome do cliente e número do contrato são obrigatórios.');
  if (serviceType === 'outro' && !['com_troca', 'sem_troca'].includes(addressChangeType)) return fail(res, 400, 'Informe se a mudança de endereço terá troca de equipamento.');
  if (!Array.isArray(materials) || !materials.length) return fail(res, 400, 'Adicione ao menos um material usado na OS.');
  try { assertUniqueOperationItems(materials); } catch (error) { return fail(res, error.statusCode || 400, error.message); }

  const serialRequired = serviceRequiresSerial(serviceType, addressChangeType);
  let totalSerials = 0;
  for (const item of materials) {
    const material = await Material.findByPk(item.materialId);
    if (!material) return fail(res, 404, 'Material não encontrado.');
    const serials = Array.isArray(item.serialNumbers) ? item.serialNumbers.map((s) => String(s).trim()).filter(Boolean) : [];
    if (material.requiresSerial) {
      if (serials.length > 1) return fail(res, 400, 'Selecione apenas 1 serial por OS.');
      if (serials.length === 0) return fail(res, 400, `Para baixar ${material.name}, selecione o serial do equipamento ou remova o item.`);
      totalSerials += serials.length;
    } else if (qty(item.quantity) <= 0) {
      return fail(res, 400, `Informe uma quantidade válida para ${material.name}.`);
    }
  }
  if (serialRequired && totalSerials !== 1) return fail(res, 400, 'Este tipo de serviço exige exatamente 1 serial de equipamento.');
  if (!serialRequired && totalSerials > 1) return fail(res, 400, 'Selecione no máximo 1 serial por OS.');
  const normalizedNotes = composeServiceNotes(notes, serviceType, addressChangeType);

  const order = await sequelize.transaction(async (transaction) => {
    const record = await ServiceOrder.create({
      technicianId,
      osNumber,
      customerName,
      customerCpf: normalizeDoc(customerCpf),
      customerAddress,
      city,
      serviceType,
      status: status || 'concluida',
      completedAt: completedAt || new Date(),
      notes: normalizedNotes,
      createdById: req.user.id,
    }, { transaction });

    for (const item of materials) {
      const material = await Material.findByPk(item.materialId, { transaction });
      if (!material) throw new Error('Material não encontrado.');
      const serials = Array.isArray(item.serialNumbers) ? item.serialNumbers.map((s) => String(s).trim()).filter(Boolean) : [];
      const quantity = qty(material.requiresSerial ? serials.length : item.quantity);
      const unitCost = money(item.unitCost ?? material.unitCost);
      if (quantity <= 0) continue;
      if (material.requiresSerial) {
        for (const serialNumber of serials) {
          const asset = await SerializedAsset.findOne({ where: { serialNumber }, transaction });
          if (!asset || asset.ownerType !== 'tecnico' || Number(asset.technicianId) !== Number(technicianId)) throw new Error(`Serial não está na carga do técnico: ${serialNumber}.`);
          asset.ownerType = 'cliente';
          asset.status = 'instalado';
          asset.technicianId = null;
          asset.warehouseId = null;
          asset.installedAt = completedAt || new Date();
          asset.customerName = customerName;
          asset.customerCpf = normalizeDoc(customerCpf);
          asset.lastMovementAt = new Date();
          await asset.save({ transaction });
          await ServiceOrderMaterial.create({ serviceOrderId: record.id, materialId: material.id, assetId: asset.id, quantity: 1, serialNumber, unitCost: asset.acquisitionCost || unitCost, totalCost: asset.acquisitionCost || unitCost }, { transaction });
          await StockMovement.create({ type: 'baixa_os', materialId: material.id, assetId: asset.id, quantity: 1, serialNumber, fromOwnerType: 'tecnico', toOwnerType: 'cliente', fromTechnicianId: technicianId, reference: osNumber, createdById: req.user.id }, { transaction });
        }
      } else {
        await adjustBalance({ materialId: material.id, ownerType: 'tecnico', technicianId, delta: -quantity, transaction });
        await ServiceOrderMaterial.create({ serviceOrderId: record.id, materialId: material.id, quantity, unitCost, totalCost: money(quantity * unitCost) }, { transaction });
        await StockMovement.create({ type: 'baixa_os', materialId: material.id, quantity, fromOwnerType: 'tecnico', toOwnerType: 'cliente', fromTechnicianId: technicianId, reference: osNumber, createdById: req.user.id }, { transaction });
      }
    }
    await writeAudit({ req, action: 'create', entity: 'ServiceOrder', entityId: record.id, message: `OS ${osNumber} baixada pelo técnico.`, afterData: record.toJSON(), transaction });
    return record;
  });

  return created(res, order, 'OS registrada e materiais baixados.');
});


exports.replacementOptions = asyncHandler(async (req, res) => {
  const order = await ServiceOrder.findByPk(req.params.id, {
    include: [
      Technician,
      { model: ServiceOrderMaterial, include: [Material, SerializedAsset] },
      equipmentReplacementInclude(),
    ],
  });
  if (!order) return fail(res, 404, 'OS não encontrada.');
  if (!order.technicianId) return fail(res, 400, 'A OS não possui técnico responsável.');
  if (req.user.role === 'tecnico' && Number(order.technicianId) !== Number(req.user.technicianId)) {
    return fail(res, 403, 'Você só pode substituir equipamentos das suas próprias ordens de serviço.');
  }

  const installedItems = (order.ServiceOrderMaterials || [])
    .filter((item) => item.SerializedAsset && item.serialNumber)
    .map((item) => ({
      serviceOrderMaterialId: item.id,
      assetId: item.SerializedAsset.id,
      materialId: item.Material?.id,
      materialName: item.Material?.name || 'Equipamento',
      category: item.Material?.category || null,
      serialNumber: item.SerializedAsset.serialNumber,
      mac: item.SerializedAsset.mac || null,
      brand: item.SerializedAsset.brand || null,
      model: item.SerializedAsset.model || null,
      status: item.SerializedAsset.status,
      ownerType: item.SerializedAsset.ownerType,
    }))
    .filter((item) => item.status === 'instalado' && item.ownerType === 'cliente');

  if (!installedItems.length) {
    return fail(res, 400, 'Esta OS não possui equipamento serializado atualmente instalado no cliente.');
  }

  const allowedCategories = Array.from(new Set(installedItems.map((item) => item.category).filter(Boolean)));
  const availableWhere = {
    technicianId: order.technicianId,
    ownerType: 'tecnico',
    status: 'com_tecnico',
  };

  const availableAssets = await SerializedAsset.findAll({
    where: availableWhere,
    include: [{
      model: Material,
      where: allowedCategories.length ? { category: { [Op.in]: allowedCategories } } : undefined,
      required: true,
    }],
    order: [[Material, 'name', 'ASC'], ['serialNumber', 'ASC']],
    limit: 1000,
  });

  return ok(res, {
    order: {
      id: order.id,
      osNumber: order.osNumber,
      customerName: order.customerName,
      customerCpf: order.customerCpf,
      technicianId: order.technicianId,
      technicianName: order.Technician?.name || null,
    },
    installedItems,
    availableAssets,
    replacements: order.equipmentReplacements || [],
  });
});

exports.replaceEquipment = asyncHandler(async (req, res) => {
  const oldAssetId = Number(req.body.oldAssetId || 0);
  const newAssetId = Number(req.body.newAssetId || 0);
  const reason = String(req.body.reason || 'Correção de equipamento baixado na OS').trim();
  const notes = String(req.body.notes || '').trim();

  if (!oldAssetId || !newAssetId) return fail(res, 400, 'Selecione o equipamento atualmente instalado e o novo equipamento.');
  if (oldAssetId === newAssetId) return fail(res, 400, 'O equipamento atual e o novo equipamento precisam ser diferentes.');

  const result = await sequelize.transaction(async (transaction) => {
    const order = await ServiceOrder.findByPk(req.params.id, {
      include: [Technician],
      transaction,
      lock: transaction.LOCK.UPDATE,
    });
    if (!order) throw Object.assign(new Error('OS não encontrada.'), { statusCode: 404 });
    if (!order.technicianId) throw Object.assign(new Error('A OS não possui técnico responsável.'), { statusCode: 400 });
    if (req.user.role === 'tecnico' && Number(order.technicianId) !== Number(req.user.technicianId)) {
      throw Object.assign(new Error('Você só pode substituir equipamentos das suas próprias ordens de serviço.'), { statusCode: 403 });
    }

    const serviceOrderMaterial = await ServiceOrderMaterial.findOne({
      where: { serviceOrderId: order.id, assetId: oldAssetId },
      transaction,
      lock: transaction.LOCK.UPDATE,
    });
    if (!serviceOrderMaterial) throw Object.assign(new Error('O equipamento atual não pertence a esta OS.'), { statusCode: 400 });

    const oldAsset = await SerializedAsset.findByPk(oldAssetId, {
      include: [Material],
      transaction,
      lock: transaction.LOCK.UPDATE,
    });
    const newAsset = await SerializedAsset.findByPk(newAssetId, {
      include: [Material],
      transaction,
      lock: transaction.LOCK.UPDATE,
    });

    if (!oldAsset || !newAsset) throw Object.assign(new Error('Equipamento atual ou novo equipamento não encontrado.'), { statusCode: 404 });
    if (oldAsset.ownerType !== 'cliente' || oldAsset.status !== 'instalado') {
      throw Object.assign(new Error(`O equipamento ${oldAsset.serialNumber} não está instalado em cliente.`), { statusCode: 400 });
    }
    if (newAsset.ownerType !== 'tecnico' || newAsset.status !== 'com_tecnico' || Number(newAsset.technicianId) !== Number(order.technicianId)) {
      throw Object.assign(new Error(`O equipamento ${newAsset.serialNumber} não está disponível na caixa do técnico ${order.Technician?.name || ''}.`), { statusCode: 400 });
    }

    const oldCategory = String(oldAsset.Material?.category || '').trim().toLowerCase();
    const newCategory = String(newAsset.Material?.category || '').trim().toLowerCase();
    if (oldCategory && newCategory && oldCategory !== newCategory) {
      throw Object.assign(new Error(`A substituição deve usar equipamento da mesma categoria. Atual: ${oldAsset.Material?.category}; novo: ${newAsset.Material?.category}.`), { statusCode: 400 });
    }

    const before = {
      serviceOrderMaterial: serviceOrderMaterial.toJSON(),
      oldAsset: oldAsset.toJSON(),
      newAsset: newAsset.toJSON(),
    };
    const reference = replacementReference(order);
    const movementAt = new Date();

    oldAsset.ownerType = 'tecnico';
    oldAsset.status = 'com_tecnico';
    oldAsset.technicianId = order.technicianId;
    oldAsset.warehouseId = null;
    oldAsset.custodyStartedAt = movementAt;
    oldAsset.installedAt = null;
    oldAsset.customerName = null;
    oldAsset.customerCpf = null;
    oldAsset.lastMovementAt = movementAt;
    oldAsset.notes = [oldAsset.notes, `Retornado à caixa do técnico por substituição/correção na OS ${order.osNumber}. Referência ${reference}.`].filter(Boolean).join(' | ');
    await oldAsset.save({ transaction });

    newAsset.ownerType = 'cliente';
    newAsset.status = 'instalado';
    newAsset.technicianId = null;
    newAsset.warehouseId = null;
    newAsset.custodyStartedAt = null;
    newAsset.installedAt = movementAt;
    newAsset.customerName = order.customerName;
    newAsset.customerCpf = order.customerCpf;
    newAsset.lastMovementAt = movementAt;
    newAsset.notes = [newAsset.notes, `Instalado por substituição/correção na OS ${order.osNumber}. Referência ${reference}.`].filter(Boolean).join(' | ');
    await newAsset.save({ transaction });

    serviceOrderMaterial.materialId = newAsset.materialId;
    serviceOrderMaterial.assetId = newAsset.id;
    serviceOrderMaterial.serialNumber = newAsset.serialNumber;
    serviceOrderMaterial.quantity = 1;
    serviceOrderMaterial.unitCost = money(newAsset.acquisitionCost || newAsset.Material?.unitCost || 0);
    serviceOrderMaterial.totalCost = serviceOrderMaterial.unitCost;
    await serviceOrderMaterial.save({ transaction });

    const replacement = await ServiceOrderEquipmentReplacement.create({
      oldSerialNumber: oldAsset.serialNumber,
      newSerialNumber: newAsset.serialNumber,
      reason: reason || null,
      notes: notes || null,
      serviceOrderId: order.id,
      technicianId: order.technicianId,
      oldAssetId: oldAsset.id,
      newAssetId: newAsset.id,
      oldMaterialId: oldAsset.materialId,
      newMaterialId: newAsset.materialId,
      performedById: req.user.id,
    }, { transaction });

    await StockMovement.create({
      type: 'ajuste',
      materialId: oldAsset.materialId,
      assetId: oldAsset.id,
      quantity: 1,
      serialNumber: oldAsset.serialNumber,
      fromOwnerType: 'cliente',
      toOwnerType: 'tecnico',
      toTechnicianId: order.technicianId,
      reference,
      notes: `Equipamento devolvido à caixa do técnico por substituição na OS ${order.osNumber}. ${reason}${notes ? ` | ${notes}` : ''}`,
      createdById: req.user.id,
    }, { transaction });

    await StockMovement.create({
      type: 'ajuste',
      materialId: newAsset.materialId,
      assetId: newAsset.id,
      quantity: 1,
      serialNumber: newAsset.serialNumber,
      fromOwnerType: 'tecnico',
      toOwnerType: 'cliente',
      fromTechnicianId: order.technicianId,
      reference,
      notes: `Novo equipamento instalado por substituição na OS ${order.osNumber}. ${reason}${notes ? ` | ${notes}` : ''}`,
      createdById: req.user.id,
    }, { transaction });

    await writeAudit({
      req,
      action: 'service_order_equipment_replaced',
      entity: 'ServiceOrder',
      entityId: order.id,
      message: `Equipamento da OS ${order.osNumber} substituído: ${oldAsset.serialNumber} por ${newAsset.serialNumber}.`,
      beforeData: before,
      afterData: {
        reference,
        replacement: replacement.toJSON(),
        serviceOrderMaterial: serviceOrderMaterial.toJSON(),
        oldAsset: oldAsset.toJSON(),
        newAsset: newAsset.toJSON(),
      },
      transaction,
    });

    return { order, replacement, reference, oldAsset, newAsset };
  });

  return ok(res, {
    serviceOrderId: result.order.id,
    osNumber: result.order.osNumber,
    reference: result.reference,
    replacement: result.replacement,
    oldEquipment: {
      id: result.oldAsset.id,
      serialNumber: result.oldAsset.serialNumber,
      status: result.oldAsset.status,
      ownerType: result.oldAsset.ownerType,
      technicianId: result.oldAsset.technicianId,
    },
    newEquipment: {
      id: result.newAsset.id,
      serialNumber: result.newAsset.serialNumber,
      status: result.newAsset.status,
      ownerType: result.newAsset.ownerType,
      customerName: result.newAsset.customerName,
    },
  }, 'Equipamento substituído com sucesso e operação registrada no histórico e na auditoria.');
});


exports.update = asyncHandler(async (req, res) => {
  const order = await ServiceOrder.findByPk(req.params.id, { include: [Technician, { model: ServiceOrderMaterial, include: [Material, SerializedAsset] }, equipmentReplacementInclude()] });
  if (!order) return fail(res, 404, 'OS não encontrada.');
  const before = order.toJSON();
  const allowed = ['osNumber', 'customerName', 'customerCpf', 'customerAddress', 'city', 'serviceType', 'status', 'completedAt', 'notes'];
  for (const field of allowed) {
    if (req.body[field] !== undefined) order[field] = field === 'customerCpf' ? normalizeDoc(req.body[field]) : req.body[field];
  }
  await order.save();
  await writeAudit({ req, action: 'update', entity: 'ServiceOrder', entityId: order.id, message: `OS ${order.osNumber} editada pelo admin.`, beforeData: before, afterData: order.toJSON() });
  return ok(res, order, 'OS atualizada.');
});
