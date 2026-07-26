const { Op } = require('sequelize');
const { Technician, TechnicianTool, TechnicianToolDocument, User } = require('../models');
const asyncHandler = require('../utils/asyncHandler');
const { ok, created, fail } = require('../utils/response');
const { writeAudit } = require('../services/auditService');
const { money, daysBetween } = require('../utils/number');

const toolInclude = [
  { model: User, as: 'createdBy', attributes: ['id', 'name', 'email'] },
  { model: User, as: 'removedBy', attributes: ['id', 'name', 'email'] },
];

const REMOVAL_STATUSES = ['substituida', 'perdida', 'desgaste', 'devolvida'];
const ALLOWED_DOCUMENT_MIMES = ['application/pdf', 'image/jpeg', 'image/png', 'image/webp'];
const MAX_DOCUMENT_BYTES = 12 * 1024 * 1024;



function documentMime(dataUrl) {
  const match = String(dataUrl || '').match(/^data:([^;,]+)[;,]/i);
  return String(match?.[1] || '').toLowerCase();
}

function estimatedDataUrlBytes(dataUrl) {
  const value = String(dataUrl || '');
  const payload = value.includes(',') ? value.slice(value.indexOf(',') + 1) : value;
  return Math.ceil(payload.length * 0.75);
}

function publicDocument(document) {
  if (!document) return null;
  return {
    ...document.toJSON(),
    documentData: document.documentData,
  };
}

async function activeSerialExists(serialNumber, excludeId = null) {
  const where = { serialNumber, status: 'com_tecnico' };
  if (excludeId) where.id = { [Op.ne]: excludeId };
  return TechnicianTool.findOne({ where });
}

async function loadTechnicianOrFail(res, technicianId) {
  const technician = await Technician.findByPk(technicianId);
  if (!technician) {
    fail(res, 404, 'Técnico não encontrado.');
    return null;
  }
  return technician;
}

exports.list = asyncHandler(async (req, res) => {
  const technician = await loadTechnicianOrFail(res, req.params.technicianId);
  if (!technician) return;
  if (req.user?.role === 'tecnico' && Number(req.user.technicianId) !== Number(technician.id)) {
    return fail(res, 403, 'Você só pode acessar as ferramentas do próprio cadastro.');
  }

  const tools = await TechnicianTool.findAll({
    where: { technicianId: technician.id },
    include: toolInclude,
    order: [['status', 'ASC'], ['deliveredAt', 'ASC']],
  });

  const active = tools.filter((tool) => tool.status === 'com_tecnico');
  const documentCount = await TechnicianToolDocument.count({ where: { technicianId: technician.id } }).catch(() => 0);
  return ok(res, {
    technician,
    tools: tools.map((tool) => ({ ...tool.toJSON(), custodyDays: daysBetween(tool.deliveredAt) })),
    summary: {
      activeCount: active.length,
      activeValue: money(active.reduce((sum, tool) => sum + Number(tool.referenceValue || 0), 0)),
      removedCount: tools.length - active.length,
      documentCount,
    },
  });
});

exports.create = asyncHandler(async (req, res) => {
  const technician = await loadTechnicianOrFail(res, req.params.technicianId);
  if (!technician) return;

  const name = String(req.body.name || '').trim();
  const serialNumber = String(req.body.serialNumber || '').trim();
  if (!name) return fail(res, 400, 'Informe o nome/descrição da ferramenta.');
  if (!serialNumber) return fail(res, 400, 'Informe o número de patrimônio/série da ferramenta.');
  if (await activeSerialExists(serialNumber)) return fail(res, 409, 'Já existe uma ferramenta ativa com este número de patrimônio/série.');

  const tool = await TechnicianTool.create({
    technicianId: technician.id,
    name,
    serialNumber,
    brand: req.body.brand ? String(req.body.brand).trim() : null,
    referenceValue: money(req.body.referenceValue || 0),
    deliveredAt: req.body.deliveredAt || new Date(),
    notes: req.body.notes ? String(req.body.notes).trim() : null,
    status: 'com_tecnico',
    createdById: req.user?.id || null,
  });

  const withIncludes = await TechnicianTool.findByPk(tool.id, { include: toolInclude });
  await writeAudit({
    req,
    action: 'create',
    entity: 'TechnicianTool',
    entityId: tool.id,
    message: `Ferramenta "${name}" (série ${serialNumber}) registrada em nome de ${technician.name}.`,
    afterData: withIncludes.toJSON(),
  });
  return created(res, withIncludes, 'Ferramenta registrada na ficha do técnico.');
});

exports.update = asyncHandler(async (req, res) => {
  const tool = await TechnicianTool.findOne({ where: { id: req.params.id, technicianId: req.params.technicianId }, include: toolInclude });
  if (!tool) return fail(res, 404, 'Ferramenta não encontrada nesta ficha.');
  if (tool.status !== 'com_tecnico') return fail(res, 400, 'Só é possível editar ferramentas que ainda estão com o técnico.');

  const before = tool.toJSON();
  const name = req.body.name !== undefined ? String(req.body.name).trim() : tool.name;
  const serialNumber = req.body.serialNumber !== undefined ? String(req.body.serialNumber).trim() : tool.serialNumber;
  if (!name) return fail(res, 400, 'Informe o nome/descrição da ferramenta.');
  if (!serialNumber) return fail(res, 400, 'Informe o número de patrimônio/série da ferramenta.');
  if (await activeSerialExists(serialNumber, tool.id)) return fail(res, 409, 'Já existe outra ferramenta ativa com este número de patrimônio/série.');

  await tool.update({
    name,
    serialNumber,
    brand: req.body.brand !== undefined ? (String(req.body.brand).trim() || null) : tool.brand,
    referenceValue: req.body.referenceValue !== undefined ? money(req.body.referenceValue) : tool.referenceValue,
    notes: req.body.notes !== undefined ? (String(req.body.notes).trim() || null) : tool.notes,
  });

  const updated = await TechnicianTool.findByPk(tool.id, { include: toolInclude });
  await writeAudit({
    req,
    action: 'update',
    entity: 'TechnicianTool',
    entityId: tool.id,
    message: `Ferramenta "${updated.name}" atualizada.`,
    beforeData: before,
    afterData: updated.toJSON(),
  });
  return ok(res, updated, 'Ferramenta atualizada.');
});

exports.remove = asyncHandler(async (req, res) => {
  const tool = await TechnicianTool.findOne({ where: { id: req.params.id, technicianId: req.params.technicianId }, include: toolInclude });
  if (!tool) return fail(res, 404, 'Ferramenta não encontrada nesta ficha.');
  if (tool.status !== 'com_tecnico') return fail(res, 400, 'Esta ferramenta já foi baixada da ficha.');

  const status = req.body.status;
  if (!REMOVAL_STATUSES.includes(status)) {
    return fail(res, 400, 'Informe o motivo da baixa: substituída, perdida, desgaste ou devolvida.');
  }
  const removalReason = String(req.body.removalReason || '').trim();
  if (!removalReason) return fail(res, 400, 'Descreva o motivo da baixa.');

  const before = tool.toJSON();
  await tool.update({
    status,
    removalReason,
    removedAt: new Date(),
    removedById: req.user?.id || null,
  });

  let replacementTool = null;
  if (status === 'substituida' && req.body.replacement) {
    const replacement = req.body.replacement;
    const replacementName = String(replacement.name || tool.name).trim();
    const replacementSerial = String(replacement.serialNumber || '').trim();
    if (replacementSerial) {
      replacementTool = await TechnicianTool.create({
        technicianId: tool.technicianId,
        name: replacementName,
        serialNumber: replacementSerial,
        brand: replacement.brand ? String(replacement.brand).trim() : null,
        referenceValue: money(replacement.referenceValue || tool.referenceValue || 0),
        deliveredAt: new Date(),
        notes: `Substitui a ferramenta de série ${tool.serialNumber}.`,
        status: 'com_tecnico',
        createdById: req.user?.id || null,
      });
    }
  }

  const updated = await TechnicianTool.findByPk(tool.id, { include: toolInclude });
  await writeAudit({
    req,
    action: 'remove',
    entity: 'TechnicianTool',
    entityId: tool.id,
    message: `Ferramenta "${tool.name}" (série ${tool.serialNumber}) baixada como "${status}". Motivo: ${removalReason}${replacementTool ? ` Substituída pela ferramenta de série ${replacementTool.serialNumber}.` : ''}`,
    beforeData: before,
    afterData: updated.toJSON(),
  });
  return ok(res, { tool: updated, replacementTool }, 'Baixa registrada na ficha do técnico.');
});

exports.termData = asyncHandler(async (req, res) => {
  const technician = await loadTechnicianOrFail(res, req.params.technicianId);
  if (!technician) return;

  const tools = await TechnicianTool.findAll({
    where: { technicianId: technician.id },
    include: toolInclude,
    order: [['status', 'ASC'], ['deliveredAt', 'ASC']],
  });
  const active = tools.filter((tool) => tool.status === 'com_tecnico');

  return ok(res, {
    technician,
    generatedAt: new Date(),
    activeTools: active,
    totalValue: money(active.reduce((sum, tool) => sum + Number(tool.referenceValue || 0), 0)),
  });
});

exports.listDocuments = asyncHandler(async (req, res) => {
  const technician = await loadTechnicianOrFail(res, req.params.technicianId);
  if (!technician) return;
  if (req.user?.role === 'tecnico' && Number(req.user.technicianId) !== Number(technician.id)) {
    return fail(res, 403, 'Você só pode acessar os documentos do próprio cadastro.');
  }

  const documents = await TechnicianToolDocument.findAll({
    where: { technicianId: technician.id },
    include: [{ model: User, as: 'createdBy', attributes: ['id', 'name', 'email'] }],
    order: [['signedAt', 'DESC'], ['createdAt', 'DESC']],
  });

  return ok(res, {
    technician,
    documents: documents.map(publicDocument),
    count: documents.length,
  });
});

exports.uploadDocument = asyncHandler(async (req, res) => {
  const technician = await loadTechnicianOrFail(res, req.params.technicianId);
  if (!technician) return;

  const documentName = String(req.body.documentName || '').trim();
  const documentData = String(req.body.documentData || '').trim();
  const notes = String(req.body.notes || '').trim() || null;
  const signedAt = req.body.signedAt || new Date();

  if (!documentName) return fail(res, 400, 'Selecione o termo assinado para anexar.');
  if (!documentData) return fail(res, 400, 'O arquivo do termo assinado não foi recebido.');
  const mime = documentMime(documentData);
  if (!ALLOWED_DOCUMENT_MIMES.includes(mime)) {
    return fail(res, 400, 'Formato não permitido. Anexe PDF, JPG, PNG ou WEBP.');
  }
  if (estimatedDataUrlBytes(documentData) > MAX_DOCUMENT_BYTES) {
    return fail(res, 400, 'O termo assinado deve ter no máximo 12 MB.');
  }

  const activeTools = await TechnicianTool.findAll({
    where: { technicianId: technician.id, status: 'com_tecnico' },
    attributes: ['id', 'name', 'serialNumber', 'brand', 'referenceValue'],
    order: [['name', 'ASC']],
  });
  const totalValue = money(activeTools.reduce((sum, tool) => sum + Number(tool.referenceValue || 0), 0));

  const document = await TechnicianToolDocument.create({
    technicianId: technician.id,
    documentName,
    documentData,
    signedAt,
    notes,
    toolCount: activeTools.length,
    totalValue,
    createdById: req.user?.id || null,
  });

  const createdDocument = await TechnicianToolDocument.findByPk(document.id, {
    include: [{ model: User, as: 'createdBy', attributes: ['id', 'name', 'email'] }],
  });

  await writeAudit({
    req,
    action: 'upload_tool_term',
    entity: 'TechnicianToolDocument',
    entityId: document.id,
    message: `Termo assinado de ferramentas anexado para ${technician.name}.`,
    afterData: {
      id: document.id,
      technicianId: technician.id,
      documentName,
      signedAt,
      notes,
      toolCount: activeTools.length,
      totalValue,
      tools: activeTools.map((tool) => ({ id: tool.id, name: tool.name, serialNumber: tool.serialNumber })),
    },
  });

  return created(res, publicDocument(createdDocument), 'Termo assinado anexado à ficha do técnico.');
});

exports.deleteDocument = asyncHandler(async (req, res) => {
  const document = await TechnicianToolDocument.findOne({
    where: { id: req.params.documentId, technicianId: req.params.technicianId },
  });
  if (!document) return fail(res, 404, 'Termo assinado não encontrado nesta ficha.');

  const before = {
    id: document.id,
    technicianId: document.technicianId,
    documentName: document.documentName,
    signedAt: document.signedAt,
    notes: document.notes,
    toolCount: document.toolCount,
    totalValue: document.totalValue,
  };
  await document.destroy();
  await writeAudit({
    req,
    action: 'delete_tool_term',
    entity: 'TechnicianToolDocument',
    entityId: before.id,
    message: `Termo assinado "${before.documentName}" removido da ficha do técnico.`,
    beforeData: before,
  });
  return ok(res, { id: before.id }, 'Termo assinado removido.');
});

