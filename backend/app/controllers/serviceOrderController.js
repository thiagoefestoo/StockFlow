const sequelize = require('../../config/db');
const { Op } = require('sequelize');
const { ServiceOrder, ServiceOrderMaterial, Material, SerializedAsset, StockMovement, Technician } = require('../models');
const asyncHandler = require('../utils/asyncHandler');
const { ok, created, fail } = require('../utils/response');
const { money, qty, normalizeDoc } = require('../utils/number');
const { adjustBalance } = require('../services/stockService');
const { writeAudit } = require('../services/auditService');

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

exports.list = asyncHandler(async (req, res) => {
  const where = {};
  if (req.user.role === 'tecnico') where.technicianId = req.user.technicianId || -1;
  if (req.query.search) where[Op.or] = [{ osNumber: { [Op.iLike]: `%${req.query.search}%` } }, { customerName: { [Op.iLike]: `%${req.query.search}%` } }, { customerCpf: { [Op.iLike]: `%${req.query.search}%` } }];
  const orders = await ServiceOrder.findAll({ where, include: [Technician, { model: ServiceOrderMaterial, include: [Material, SerializedAsset] }], order: [['createdAt', 'DESC']], limit: 400 });
  return ok(res, orders);
});

exports.create = asyncHandler(async (req, res) => {
  let { technicianId, osNumber, customerName, customerCpf, customerAddress, city, serviceType = 'instalacao', addressChangeType, status, completedAt, notes, materials = [] } = req.body;
  if (req.user.role === 'tecnico') technicianId = req.user.technicianId;
  if (!technicianId) return fail(res, 400, 'Técnico não identificado.');
  if (!osNumber || !customerName || !customerCpf) return fail(res, 400, 'OS, nome do cliente e número do contrato são obrigatórios.');
  if (serviceType === 'outro' && !['com_troca', 'sem_troca'].includes(addressChangeType)) return fail(res, 400, 'Informe se a mudança de endereço terá troca de equipamento.');
  if (!Array.isArray(materials) || !materials.length) return fail(res, 400, 'Adicione ao menos um material usado na OS.');

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


exports.update = asyncHandler(async (req, res) => {
  const order = await ServiceOrder.findByPk(req.params.id, { include: [Technician, { model: ServiceOrderMaterial, include: [Material, SerializedAsset] }] });
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
