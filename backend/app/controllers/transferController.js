const sequelize = require('../../config/db');
const { Op } = require('sequelize');
const { Transfer, TransferItem, Technician, Material, SerializedAsset, StockMovement, Warehouse, MaterialRequest, MaterialRequestItem, Notification, TechnicianTool } = require('../models');
const asyncHandler = require('../utils/asyncHandler');
const { ok, okPaginated, created, fail } = require('../utils/response');
const { paginationFromQuery, paginationMeta } = require('../utils/pagination');
const { money, qty } = require('../utils/number');
const { adjustBalance } = require('../services/stockService');
const { writeAudit } = require('../services/auditService');
const { stockWhereForUser, assertWarehouseAccess, isPrivileged } = require('../utils/warehouseAccess');
const { assertTechnicianAccess, filterTechniciansForUser } = require('../utils/technicianAccess');
const { hasModuleAccess } = require('../config/modulePermissions');
const { assertUniqueOperationItems } = require('../utils/itemSelectionValidation');

const transferInclude = [
  Technician,
  { model: Technician, as: 'fromTechnician' },
  Warehouse,
  { model: TransferItem, include: [Material, SerializedAsset, TechnicianTool] },
];


const MAX_ATTACHMENTS_PER_REQUEST = 8;
const MAX_ATTACHMENTS_PER_TRANSFER = 30;
const MAX_ATTACHMENT_PAYLOAD_LENGTH = 18 * 1024 * 1024;

function normalizeAttachmentEntry(entry = {}) {
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

function readTransferAttachments(transfer) {
  const source = transfer?.toJSON ? transfer.toJSON() : (transfer || {});
  const raw = source.attachmentData;
  if (!raw) return [];

  try {
    const parsed = JSON.parse(raw);
    const entries = Array.isArray(parsed) ? parsed : (Array.isArray(parsed?.attachments) ? parsed.attachments : []);
    const normalized = entries.map(normalizeAttachmentEntry).filter(Boolean);
    if (normalized.length) return normalized;
  } catch (_) {
    // Formato legado: um unico data URL salvo diretamente na coluna.
  }

  const legacy = normalizeAttachmentEntry({
    name: source.attachmentName || 'documento-anexado',
    data: raw,
    uploadedAt: source.signedAt || source.updatedAt || source.createdAt,
  });
  return legacy ? [legacy] : [];
}

function transferWithAttachments(transfer, includeData = false) {
  const payload = transfer?.toJSON ? transfer.toJSON() : { ...(transfer || {}) };
  const attachments = readTransferAttachments(payload);
  payload.attachmentCount = attachments.length;
  payload.attachmentNames = attachments.map((item) => item.name);
  if (includeData) payload.attachments = attachments;
  delete payload.attachmentData;
  return payload;
}


async function estimateTransferValue(items = [], sourceWarehouseId) {
  let totalValue = 0;
  for (const item of items) {
    const material = await Material.findByPk(item.materialId);
    if (!material) throw new Error('Material não encontrado.');
    if (String(material.category || '').toLowerCase() === 'ferramenta') {
      throw new Error(`A ferramenta ${material.name} deve ser entregue pela ficha do técnico, em Técnicos > Detalhes > Adicionar ferramentas.`);
    }
    const unitCost = money(item.unitCost ?? material.unitCost);
    if (material.requiresSerial) {
      const serials = Array.isArray(item.serialNumbers) ? item.serialNumbers.map((value) => String(value).trim()).filter(Boolean) : [];
      for (const serialNumber of serials) {
        const asset = await SerializedAsset.findOne({ where: { serialNumber, warehouseId: sourceWarehouseId, ownerType: 'estoque', status: 'em_estoque' } });
        totalValue += Number(asset?.acquisitionCost || unitCost);
      }
    } else {
      totalValue += qty(item.quantity) * unitCost;
    }
  }
  return money(totalValue);
}

function nextNumber() {
  const now = new Date();
  const stamp = `${now.getFullYear()}${String(now.getMonth() + 1).padStart(2, '0')}${String(now.getDate()).padStart(2, '0')}-${String(now.getHours()).padStart(2, '0')}${String(now.getMinutes()).padStart(2, '0')}${String(now.getSeconds()).padStart(2, '0')}`;
  return `GUIA-${stamp}`;
}

exports.list = asyncHandler(async (req, res) => {
  const transferNumberWhere = { transferNumber: { [Op.notILike]: 'PERDA-%' } };
  const warehouseScope = stockWhereForUser(req.user, req.query.warehouseId);
  const allTechnicians = await Technician.findAll({ attributes: ['id', 'defaultWarehouseId', 'serviceCities'] });
  const visibleTechnicianIds = filterTechniciansForUser(req.user, allTechnicians).map((technician) => Number(technician.id));
  let where;

  if (req.user?.role === 'tecnico') {
    const technicianId = Number(req.user.technicianId || -1);
    where = {
      ...transferNumberWhere,
      [Op.or]: [
        { technicianId },
        { fromTechnicianId: technicianId },
      ],
    };
  } else if (isPrivileged(req.user)) {
    where = { ...warehouseScope, ...transferNumberWhere };
  } else {
    where = {
      ...transferNumberWhere,
      [Op.or]: [
        warehouseScope,
        { technicianId: visibleTechnicianIds.length ? { [Op.in]: visibleTechnicianIds } : -1 },
        { fromTechnicianId: visibleTechnicianIds.length ? { [Op.in]: visibleTechnicianIds } : -1 },
      ],
    };
  }
  const pagination = paginationFromQuery(req.query);
  const [transfers, total] = await Promise.all([
    Transfer.findAll({
      where,
      attributes: { exclude: ['attachmentData'] },
      include: transferInclude,
      order: [['deliveredAt', 'DESC']],
      ...(pagination.enabled ? { limit: pagination.limit, offset: pagination.offset } : { limit: 300 }),
    }),
    pagination.enabled ? Transfer.count({ where }) : Promise.resolve(0),
  ]);
  return pagination.enabled
    ? okPaginated(res, transfers, paginationMeta(total, pagination.page, pagination.pageSize))
    : ok(res, transfers);
});

function canAccessTransfer(user, transfer) {
  if (isPrivileged(user)) return true;
  if (user?.role === 'tecnico') {
    const technicianId = Number(user.technicianId || 0);
    return Number(transfer.technicianId || 0) === technicianId || Number(transfer.fromTechnicianId || 0) === technicianId;
  }
  if (transfer.warehouseId) {
    try { assertWarehouseAccess(user, transfer.warehouseId); return true; } catch (_) { /* segue pela cidade do técnico */ }
  }
  return [transfer.Technician, transfer.fromTechnician].filter(Boolean).some((technician) => filterTechniciansForUser(user, [technician]).length > 0);
}

exports.get = asyncHandler(async (req, res) => {
  const transfer = await Transfer.findByPk(req.params.id, {
    attributes: { exclude: ['attachmentData'] },
    include: transferInclude,
  });
  if (!transfer) return fail(res, 404, 'Transferência não encontrada.');
  if (!canAccessTransfer(req.user, transfer)) return fail(res, 403, 'Você não tem acesso à cidade desta transferência.');

  const payload = transfer.toJSON();
  const summary = String(payload.attachmentName || '').trim();
  const multipleMatch = summary.match(/^(\d+)\s+arquivos?\s+anexados?$/i);
  payload.attachmentCount = multipleMatch
    ? Number(multipleMatch[1])
    : (summary ? 1 : 0);
  payload.attachmentNames = summary && !multipleMatch ? [summary] : [];
  delete payload.attachmentData;

  return ok(res, payload);
});

exports.getAttachment = asyncHandler(async (req, res) => {
  const transfer = await Transfer.findByPk(req.params.id, {
    attributes: ['id', 'transferNumber', 'warehouseId', 'technicianId', 'fromTechnicianId', 'attachmentName', 'attachmentData', 'signedAt', 'createdAt', 'updatedAt'],
    include: [Technician, { model: Technician, as: 'fromTechnician' }],
  });
  if (!transfer) return fail(res, 404, 'Transferência não encontrada.');
  if (!canAccessTransfer(req.user, transfer)) return fail(res, 403, 'Você não tem acesso à cidade desta transferência.');

  const attachments = readTransferAttachments(transfer);
  const index = Number(req.params.index);

  if (!Number.isInteger(index) || index < 0 || index >= attachments.length) {
    return fail(res, 404, 'Anexo não encontrado nesta guia.');
  }

  return ok(res, attachments[index]);
});

exports.create = asyncHandler(async (req, res) => {
  const { technicianId, deliveredAt, notes, warehouseId, materialRequestId } = req.body;
  let items = Array.isArray(req.body.items) ? req.body.items : [];
  if (!technicianId) return fail(res, 400, 'Selecione o técnico de destino.');
  if (!items.length && !materialRequestId) return fail(res, 400, 'Adicione pelo menos um item à transferência.');
  try { assertUniqueOperationItems(items); } catch (error) { return fail(res, error.statusCode || 400, error.message); }
  const technician = await Technician.findByPk(technicianId, { include: [{ model: Warehouse, as: 'defaultWarehouse' }] });
  if (!technician) return fail(res, 404, 'Técnico não encontrado.');
  try { assertTechnicianAccess(req.user, technician); } catch (error) { return fail(res, error.statusCode || 403, error.message); }
  if (!technician.defaultWarehouseId) return fail(res, 400, 'O técnico não possui estoque/cidade padrão vinculado.');
  if (warehouseId && Number(warehouseId) !== Number(technician.defaultWarehouseId)) return fail(res, 400, 'A transferência deve sair do estoque da cidade vinculada ao técnico.');
  const sourceWarehouseId = Number(technician.defaultWarehouseId);
  if (!sourceWarehouseId) return fail(res, 400, 'Selecione o estoque de origem da transferência.');
  if (sourceWarehouseId) {
    try { assertWarehouseAccess(req.user, sourceWarehouseId, 'Você não tem acesso ao estoque de origem.'); } catch (error) { return fail(res, error.statusCode || 403, error.message); }
  }
  const sourceWarehouse = await Warehouse.findByPk(sourceWarehouseId);
  if (!sourceWarehouse) return fail(res, 404, 'Estoque de origem não encontrado.');
  if (sourceWarehouse.status && sourceWarehouse.status !== 'ativo') return fail(res, 400, 'O estoque de origem precisa estar ativo para transferir material.');
  if (sourceWarehouse.isReverseLogistics) return fail(res, 400, 'Estoque de logística reversa não pode transferir materiais para técnicos.');

  let linkedRequest = null;
  const linkedRequestItemsByMaterial = new Map();
  const linkedRequestItemsById = new Map();
  if (materialRequestId) {
    if (!['admin', 'supervisor', 'estoquista'].includes(req.user.role) || !hasModuleAccess(req.user, 'materialRequestDelivery')) {
      return fail(res, 403, 'Você não tem permissão para entregar cargas aprovadas. Solicite a liberação ao administrador.');
    }
    linkedRequest = await MaterialRequest.findByPk(materialRequestId, { include: [{ model: MaterialRequestItem, include: [Material] }] });
    if (!linkedRequest) return fail(res, 404, 'Solicitação de material não encontrada.');
    if (linkedRequest.status !== 'aprovado') return fail(res, 400, 'A solicitação precisa estar aprovada para gerar entrega.');
    if (linkedRequest.requestType === 'recarga_estoque') return fail(res, 400, 'Recarga de estoque deve ser recebida pela tela de solicitações.');
    if (Number(linkedRequest.technicianId) !== Number(technicianId)) return fail(res, 400, 'O técnico selecionado não corresponde à solicitação.');
    if (linkedRequest.warehouseId && Number(linkedRequest.warehouseId) !== Number(sourceWarehouseId)) return fail(res, 400, 'O estoque de origem não corresponde ao estoque da solicitação.');

    for (const requestItem of linkedRequest.MaterialRequestItems || []) {
      linkedRequestItemsById.set(Number(requestItem.id), requestItem);
      const materialId = Number(requestItem.materialId);
      const rows = linkedRequestItemsByMaterial.get(materialId) || [];
      rows.push(requestItem);
      linkedRequestItemsByMaterial.set(materialId, rows);
    }

    const submittedRequestItems = new Set();
    for (const item of items) {
      const materialId = Number(item.materialId);
      const requestItemId = Number(item.requestItemId || 0);
      const materialRows = linkedRequestItemsByMaterial.get(materialId) || [];
      const requestItem = requestItemId ? linkedRequestItemsById.get(requestItemId) : (materialRows.length === 1 ? materialRows[0] : null);
      if (!requestItem || Number(requestItem.materialId) !== materialId) return fail(res, 400, 'A transferência contém item que não pertence à solicitação aprovada.');
      const requestItemKey = Number(requestItem.id);
      if (submittedRequestItems.has(requestItemKey)) return fail(res, 400, 'O mesmo item da solicitação não pode aparecer mais de uma vez na entrega.');
      submittedRequestItems.add(requestItemKey);
      const approvedMaximum = qty(requestItem.approvedQuantity || requestItem.quantity);
      const deliveryQuantity = qty(item.quantity);
      if (deliveryQuantity < 0) return fail(res, 400, `A quantidade de ${requestItem.Material?.name || 'material'} não pode ser negativa.`);
      if (deliveryQuantity > approvedMaximum) {
        return fail(res, 400, `A quantidade de ${requestItem.Material?.name || 'material'} não pode ultrapassar o solicitado/aprovado (${approvedMaximum}).`);
      }
      // Em uma entrega vinculada, quantidade 0 significa que este item não será atendido agora.
      // Isso permite concluir uma carga parcial e entregar normalmente os demais materiais.
    }

    for (const requestItem of linkedRequest.MaterialRequestItems || []) {
      const requestItemKey = Number(requestItem.id);
      if (submittedRequestItems.has(requestItemKey)) continue;
      items.push({
        materialId: requestItem.materialId,
        requestItemId: requestItem.id,
        quantity: 0,
        serialNumbers: [],
      });
    }
  }

  const estimatedTotalValue = await estimateTransferValue(items, sourceWarehouseId);
  const technicianApprovalLimit = money(technician.transferApprovalLimit === undefined ? 500 : technician.transferApprovalLimit);
  if (!linkedRequest && estimatedTotalValue > technicianApprovalLimit) {
    return fail(
      res,
      409,
      `A transferência soma ${estimatedTotalValue.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })} e excede o limite sem aprovação de ${technician.name}, definido em ${technicianApprovalLimit.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })}. Envie a carga para aprovação antes de gerar a guia.`,
      { code: 'TECHNICIAN_APPROVAL_REQUIRED', technicianId: technician.id, technicianApprovalLimit, totalValue: estimatedTotalValue },
    );
  }

  const transfer = await sequelize.transaction(async (transaction) => {
    const record = await Transfer.create({ transferNumber: nextNumber(), transferType: 'material', technicianId, deliveredAt: deliveredAt || new Date(), notes, createdById: req.user.id, warehouseId: sourceWarehouseId }, { transaction });
    let totalQuantity = 0;
    let totalValue = 0;
    const usedSerials = new Set();
    const deliveredRequestItems = [];
    for (const item of items) {
      const material = await Material.findByPk(item.materialId, { transaction });
      if (!material) throw new Error('Material não encontrado.');
      if (String(material.category || '').toLowerCase() === 'ferramenta') {
        throw new Error(`A ferramenta ${material.name} não pode entrar na caixa técnica. Use Técnicos > Detalhes > Adicionar ferramentas na ficha.`);
      }
      const serials = Array.isArray(item.serialNumbers) ? item.serialNumbers.map((s) => String(s).trim()).filter(Boolean) : [];
      const requestedQuantity = qty(item.quantity);
      const quantity = qty(material.requiresSerial ? serials.length : item.quantity);
      const unitCost = money(item.unitCost ?? material.unitCost);
      if (quantity <= 0) {
        if (!linkedRequest || requestedQuantity < 0) throw new Error(`Quantidade inválida para ${material.name}.`);
        deliveredRequestItems.push({
          requestItemId: item.requestItemId || null,
          materialId: material.id,
          quantity: 0,
          serialNumbers: [],
          unitCost,
          totalCost: 0,
        });
        continue;
      }
      if (material.requiresSerial) {
        if (requestedQuantity <= 0) throw new Error(`Informe a quantidade para ${material.name}.`);
        if (serials.length !== requestedQuantity) throw new Error(`Para ${material.name}, a quantidade informada precisa ser igual aos seriais selecionados. Quantidade: ${qty(requestedQuantity)}. Seriais: ${serials.length}.`);
        let serialTotalCost = 0;
        for (const serialNumber of serials) {
          const serialKey = String(serialNumber).trim().toUpperCase();
          if (usedSerials.has(serialKey)) throw new Error(`Serial repetido na guia: ${serialNumber}.`);
          usedSerials.add(serialKey);
        }
        for (const serialNumber of serials) {
          const asset = await SerializedAsset.findOne({ where: { serialNumber }, transaction });
          if (!asset || asset.ownerType !== 'estoque' || asset.status !== 'em_estoque' || (sourceWarehouseId && Number(asset.warehouseId) !== Number(sourceWarehouseId))) throw new Error(`Serial indisponível no estoque de origem: ${serialNumber}.`);
          await TransferItem.create({ transferId: record.id, materialId: material.id, assetId: asset.id, quantity: 1, unitCost: asset.acquisitionCost || unitCost, totalCost: asset.acquisitionCost || unitCost, serialNumber }, { transaction });
          asset.ownerType = 'tecnico';
          asset.status = 'com_tecnico';
          asset.technicianId = technicianId;
          asset.custodyStartedAt = new Date();
          asset.lastMovementAt = new Date();
          await asset.save({ transaction });
          await StockMovement.create({ type: 'transferencia_tecnico', materialId: material.id, assetId: asset.id, quantity: 1, serialNumber, fromOwnerType: 'estoque', toOwnerType: 'tecnico', fromWarehouseId: sourceWarehouseId, toTechnicianId: technicianId, reference: record.transferNumber, createdById: req.user.id }, { transaction });
          const assetCost = Number(asset.acquisitionCost || unitCost);
          totalQuantity += 1;
          totalValue += assetCost;
          serialTotalCost += assetCost;
        }
        if (linkedRequest) {
          deliveredRequestItems.push({ requestItemId: item.requestItemId || null, materialId: material.id, quantity: serials.length, serialNumbers: serials, unitCost: serials.length ? money(serialTotalCost / serials.length) : unitCost, totalCost: money(serialTotalCost) });
        }
      } else {
        await adjustBalance({ materialId: material.id, ownerType: 'estoque', technicianId: null, warehouseId: sourceWarehouseId, delta: -quantity, transaction });
        await adjustBalance({ materialId: material.id, ownerType: 'tecnico', technicianId, delta: quantity, transaction });
        await TransferItem.create({ transferId: record.id, materialId: material.id, quantity, unitCost, totalCost: money(quantity * unitCost) }, { transaction });
        await StockMovement.create({ type: 'transferencia_tecnico', materialId: material.id, quantity, fromOwnerType: 'estoque', toOwnerType: 'tecnico', fromWarehouseId: sourceWarehouseId, toTechnicianId: technicianId, reference: record.transferNumber, createdById: req.user.id }, { transaction });
        totalQuantity += quantity;
        totalValue += quantity * unitCost;
        if (linkedRequest) {
          deliveredRequestItems.push({ requestItemId: item.requestItemId || null, materialId: material.id, quantity, serialNumbers: [], unitCost, totalCost: money(quantity * unitCost) });
        }
      }
    }

    if (linkedRequest) {
      for (const deliveredItem of deliveredRequestItems) {
        const materialRows = linkedRequestItemsByMaterial.get(Number(deliveredItem.materialId)) || [];
        const requestItem = deliveredItem.requestItemId
          ? linkedRequestItemsById.get(Number(deliveredItem.requestItemId))
          : (materialRows.length === 1 ? materialRows[0] : null);
        if (!requestItem) continue;
        requestItem.approvedQuantity = qty(deliveredItem.quantity);
        requestItem.deliverySerials = deliveredItem.serialNumbers;
        requestItem.totalCost = money(deliveredItem.totalCost);
        await requestItem.save({ transaction });
      }
    }

    record.totalQuantity = qty(totalQuantity);
    record.totalValue = money(totalValue);
    await record.save({ transaction });

    const hasTransferredItems = qty(totalQuantity) > 0;

    await Notification.create({
      role: 'tecnico',
      type: 'estoque',
      severity: hasTransferredItems ? 'success' : 'warning',
      title: hasTransferredItems ? `Nova carga enviada ${record.transferNumber}` : `Solicitação liberada sem saldo ${record.transferNumber}`,
      message: hasTransferredItems
        ? `${qty(totalQuantity)} item(ns) foram transferidos para a caixa do técnico ${technician.name}.`
        : `A solicitação foi liberada sem transferência física porque os itens estavam sem saldo no estoque ${sourceWarehouse.name}.`,
      route: '/caixa-tecnico',
      metadata: { transferId: record.id, technicianId: Number(technicianId), warehouseId: sourceWarehouseId, totalQuantity: qty(totalQuantity) },
    }, { transaction });

    if (linkedRequest) {
      const beforeRequest = linkedRequest.toJSON();
      linkedRequest.status = 'entregue';
      linkedRequest.totalQuantity = qty(totalQuantity);
      linkedRequest.totalValue = money(totalValue);
      linkedRequest.deliveredAt = new Date();
      linkedRequest.deliveredById = req.user.id;
      linkedRequest.transferId = record.id;
      linkedRequest.logisticsNotes = notes || linkedRequest.logisticsNotes;
      await linkedRequest.save({ transaction });
      await Notification.create({
        role: 'tecnico',
        type: 'estoque',
        severity: hasTransferredItems ? 'success' : 'warning',
        title: hasTransferredItems ? `Carga recebida ${linkedRequest.requestNumber}` : `Solicitação liberada sem saldo ${linkedRequest.requestNumber}`,
        message: hasTransferredItems
          ? `Sua solicitação foi entregue. Confira sua caixa e assine a guia ${record.transferNumber}.`
          : `Sua solicitação foi processada, porém nenhum material foi transferido porque o estoque estava zerado. Consulte a guia ${record.transferNumber}.`,
        route: '/caixa-tecnico',
        metadata: { requestId: linkedRequest.id, transferId: record.id },
      }, { transaction });
      await writeAudit({ req, action: 'deliver_from_request', entity: 'MaterialRequest', entityId: linkedRequest.id, message: hasTransferredItems ? `Solicitação ${linkedRequest.requestNumber} entregue pela guia ${record.transferNumber}.` : `Solicitação ${linkedRequest.requestNumber} liberada sem transferência física por saldo zerado, registrada na guia ${record.transferNumber}.`, beforeData: beforeRequest, afterData: linkedRequest.toJSON(), transaction });
    }

    await writeAudit({
      req,
      action: 'create',
      entity: 'Transfer',
      entityId: record.id,
      message: hasTransferredItems ? `Guia ${record.transferNumber} transferiu material do estoque ${sourceWarehouse.name} para ${technician.name}.` : `Guia ${record.transferNumber} registrou liberação sem transferência física por saldo zerado no estoque ${sourceWarehouse.name}.`,
      afterData: { ...record.toJSON(), sourceWarehouse: sourceWarehouse.toJSON(), technicianApprovalLimit, estimatedTotalValue, linkedMaterialRequestId: linkedRequest?.id || null, items },
      transaction,
    });
    return record;
  });

  return created(res, transfer, qty(transfer.totalQuantity) > 0 ? 'Transferência registrada e guia gerada.' : 'Solicitação liberada sem transferência física porque o estoque estava zerado.');
});


function nextToolTransferNumber() {
  const now = new Date();
  const stamp = `${now.getFullYear()}${String(now.getMonth() + 1).padStart(2, '0')}${String(now.getDate()).padStart(2, '0')}-${String(now.getHours()).padStart(2, '0')}${String(now.getMinutes()).padStart(2, '0')}${String(now.getSeconds()).padStart(2, '0')}`;
  return `FERRAMENTA-${stamp}`;
}

exports.transferTools = asyncHandler(async (req, res) => {
  const { fromTechnicianId, technicianId, deliveredAt, notes } = req.body;
  const toolIds = Array.isArray(req.body.toolIds) ? req.body.toolIds : [];

  const sourceId = Number(fromTechnicianId);
  const destinationId = Number(technicianId);
  const normalizedToolIds = [...new Set(toolIds.map((id) => Number(id)).filter((id) => Number.isInteger(id) && id > 0))];

  if (!sourceId) return fail(res, 400, 'Selecione o técnico de origem das ferramentas.');
  if (!destinationId) return fail(res, 400, 'Selecione o técnico de destino das ferramentas.');
  if (sourceId === destinationId) return fail(res, 400, 'O técnico de origem e o técnico de destino precisam ser diferentes.');
  if (!normalizedToolIds.length) return fail(res, 400, 'Selecione ao menos uma ferramenta para transferir.');

  const [sourceTechnician, destinationTechnician] = await Promise.all([
    Technician.findByPk(sourceId),
    Technician.findByPk(destinationId),
  ]);
  if (!sourceTechnician) return fail(res, 404, 'Técnico de origem não encontrado.');
  if (!destinationTechnician) return fail(res, 404, 'Técnico de destino não encontrado.');
  try {
    assertTechnicianAccess(req.user, sourceTechnician, 'Você não tem acesso à cidade do técnico de origem.');
    assertTechnicianAccess(req.user, destinationTechnician, 'Você não tem acesso à cidade do técnico de destino.');
  } catch (error) { return fail(res, error.statusCode || 403, error.message); }

  const result = await sequelize.transaction(async (transaction) => {
    const tools = await TechnicianTool.findAll({
      where: {
        id: { [Op.in]: normalizedToolIds },
        technicianId: sourceId,
        status: 'com_tecnico',
      },
      transaction,
      lock: transaction.LOCK.UPDATE,
      order: [['name', 'ASC']],
    });

    if (tools.length !== normalizedToolIds.length) {
      throw new Error('Uma ou mais ferramentas não estão mais disponíveis na ficha do técnico de origem. Atualize a lista e tente novamente.');
    }

    const transferNumber = nextToolTransferNumber();
    const record = await Transfer.create({
      transferNumber,
      transferType: 'ferramenta',
      fromTechnicianId: sourceId,
      technicianId: destinationId,
      deliveredAt: deliveredAt || new Date(),
      notes: String(notes || '').trim() || `Transferência de ferramentas de ${sourceTechnician.name} para ${destinationTechnician.name}.`,
      stampText: 'Declaro que as ferramentas relacionadas foram conferidas e transferidas entre os técnicos indicados, permanecendo sob responsabilidade do técnico de destino.',
      createdById: req.user.id,
    }, { transaction });

    let totalValue = 0;
    const changedTools = [];

    for (const tool of tools) {
      const before = tool.toJSON();
      const unitCost = money(tool.referenceValue || 0);

      await TransferItem.create({
        transferId: record.id,
        itemType: 'ferramenta',
        itemDescription: tool.name,
        technicianToolId: tool.id,
        quantity: 1,
        unitCost,
        totalCost: unitCost,
        serialNumber: tool.serialNumber,
      }, { transaction });

      tool.technicianId = destinationId;
      tool.deliveredAt = deliveredAt || new Date();
      tool.notes = [
        tool.notes,
        `Transferida de ${sourceTechnician.name} para ${destinationTechnician.name} pela guia ${transferNumber}.`,
      ].filter(Boolean).join(' | ');
      await tool.save({ transaction });

      totalValue += Number(unitCost);
      changedTools.push({ before, after: tool.toJSON() });
    }

    record.totalQuantity = tools.length;
    record.totalValue = money(totalValue);
    await record.save({ transaction });

    await Notification.create({
      role: 'tecnico',
      type: 'patrimonio',
      severity: 'success',
      title: `Ferramentas recebidas ${transferNumber}`,
      message: `${tools.length} ferramenta(s) foram transferidas para a ficha de ${destinationTechnician.name}.`,
      route: '/caixa-tecnico',
      metadata: { transferId: record.id, technicianId: destinationId, fromTechnicianId: sourceId, toolIds: normalizedToolIds },
    }, { transaction });

    await writeAudit({
      req,
      action: 'transfer_technician_tools',
      entity: 'Transfer',
      entityId: record.id,
      message: `Guia ${transferNumber} transferiu ${tools.length} ferramenta(s) de ${sourceTechnician.name} para ${destinationTechnician.name}.`,
      afterData: {
        ...record.toJSON(),
        sourceTechnician: { id: sourceTechnician.id, name: sourceTechnician.name },
        destinationTechnician: { id: destinationTechnician.id, name: destinationTechnician.name },
        tools: changedTools,
      },
      transaction,
    });

    return record;
  });

  const createdTransfer = await Transfer.findByPk(result.id, { include: transferInclude });
  return created(res, createdTransfer, 'Ferramentas transferidas para o técnico de destino e guia gerada para assinatura.');
});

exports.update = asyncHandler(async (req, res) => {
  const transfer = await Transfer.findByPk(req.params.id, { include: transferInclude });
  if (!transfer) return fail(res, 404, 'Transferência não encontrada.');
  if (!canAccessTransfer(req.user, transfer)) return fail(res, 403, 'Você não tem acesso à cidade desta transferência.');
  const before = { ...transfer.toJSON(), attachmentData: undefined };
  const { notes, status, deliveredAt, signatureResponsible } = req.body;
  if (notes !== undefined) transfer.notes = notes;
  if (status !== undefined) transfer.status = status;
  if (deliveredAt !== undefined) transfer.deliveredAt = deliveredAt;
  if (signatureResponsible !== undefined) transfer.signatureResponsible = signatureResponsible;
  await transfer.save();
  const safeTransfer = { ...transfer.toJSON(), attachmentData: undefined };
  await writeAudit({ req, action: 'update', entity: 'Transfer', entityId: transfer.id, message: `Guia ${transfer.transferNumber} editada.`, beforeData: before, afterData: safeTransfer });
  return ok(res, safeTransfer, 'Transferência atualizada.');
});

exports.sign = asyncHandler(async (req, res) => {
  const transfer = await Transfer.findByPk(req.params.id, {
    include: [Technician, { model: Technician, as: 'fromTechnician' }],
  });
  if (!transfer) return fail(res, 404, 'Transferência não encontrada.');
  if (!canAccessTransfer(req.user, transfer)) return fail(res, 403, 'Você não tem acesso à cidade desta transferência.');

  const before = transferWithAttachments(transfer, false);
  const requestedAttachments = Array.isArray(req.body.attachments)
    ? req.body.attachments
    : [{ attachmentName: req.body.attachmentName, attachmentData: req.body.attachmentData }];

  if (requestedAttachments.length > MAX_ATTACHMENTS_PER_REQUEST) {
    return fail(res, 400, `Envie no máximo ${MAX_ATTACHMENTS_PER_REQUEST} arquivos por vez.`);
  }

  const incomingAttachments = requestedAttachments
    .map(normalizeAttachmentEntry)
    .filter(Boolean);

  if (!incomingAttachments.length) {
    return fail(res, 400, 'Selecione pelo menos um arquivo PDF ou imagem válido.');
  }

  const existingAttachments = readTransferAttachments(transfer);
  const combinedAttachments = [...existingAttachments, ...incomingAttachments];

  if (combinedAttachments.length > MAX_ATTACHMENTS_PER_TRANSFER) {
    return fail(res, 400, `A guia pode possuir no máximo ${MAX_ATTACHMENTS_PER_TRANSFER} anexos.`);
  }

  const serializedAttachments = JSON.stringify(combinedAttachments);
  if (serializedAttachments.length > MAX_ATTACHMENT_PAYLOAD_LENGTH) {
    return fail(res, 413, 'O conjunto de anexos excede o limite permitido. Reduza o tamanho ou envie menos arquivos por vez.');
  }

  transfer.status = 'assinado';
  transfer.signedAt = transfer.signedAt || new Date();
  transfer.attachmentName = combinedAttachments.length === 1
    ? combinedAttachments[0].name
    : `${combinedAttachments.length} arquivos anexados`;
  transfer.attachmentData = serializedAttachments;
  transfer.signatureResponsible = req.body.signatureResponsible || transfer.signatureResponsible || 'Anexo recebido';
  await transfer.save();

  const safeTransfer = transferWithAttachments(transfer, false);
  await writeAudit({
    req,
    action: 'sign',
    entity: 'Transfer',
    entityId: transfer.id,
    message: `${incomingAttachments.length} arquivo(s) anexado(s) à guia ${transfer.transferNumber}. Total de anexos: ${combinedAttachments.length}.`,
    beforeData: before,
    afterData: safeTransfer,
  });
  return ok(res, safeTransfer, `${incomingAttachments.length} arquivo(s) anexado(s) com sucesso.`);
});
