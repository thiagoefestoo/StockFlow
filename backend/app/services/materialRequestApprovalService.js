const sequelize = require('../../config/db');
const {
  MaterialRequest,
  MaterialRequestItem,
  ApprovalRequest,
  Material,
  SerializedAsset,
  Technician,
  Transfer,
  Notification,
  User,
  Warehouse,
} = require('../models');
const { money } = require('../utils/number');
const { writeAudit } = require('./auditService');
const { hasModuleAccess } = require('../config/modulePermissions');
const { assertWarehouseAccess } = require('../utils/warehouseAccess');

function includeFull() {
  return [
    Technician,
    { model: User, as: 'requestedBy', attributes: ['id', 'name', 'email', 'role'] },
    { model: User, as: 'approvedBy', attributes: ['id', 'name', 'email', 'role'] },
    { model: User, as: 'deliveredBy', attributes: ['id', 'name', 'email', 'role'] },
    { model: Transfer, attributes: { exclude: ['attachmentData', 'stampText'] } },
    Warehouse,
    { model: MaterialRequestItem, include: [Material, SerializedAsset] },
  ];
}

function readTechnicianLimit(request) {
  const metadataLimit = request?.metadata?.technicianApprovalLimit;
  const currentLimit = request?.Technician?.transferApprovalLimit;
  return money(metadataLimit ?? currentLimit ?? 500);
}

function readApproverLimit(user) {
  if (user?.role === 'admin') return Number.POSITIVE_INFINITY;
  return money(user?.approvalLimit ?? 0);
}

function validateApprover({ user, request }) {
  if (!user) {
    const error = new Error('Usuário aprovador não identificado.');
    error.statusCode = 401;
    throw error;
  }

  if (user.role === 'admin') return;

  if (!hasModuleAccess(user, 'approvals')) {
    const error = new Error('Você não possui permissão para aprovar solicitações.');
    error.statusCode = 403;
    throw error;
  }

  const amount = money(request.totalValue ?? 0);
  const approvalLimit = readApproverLimit(user);

  if (approvalLimit <= 0) {
    const error = new Error('Seu usuário não possui limite financeiro para aprovações. Solicite ao administrador a definição do limite de aprovação.');
    error.statusCode = 403;
    throw error;
  }

  if (amount > approvalLimit) {
    const error = new Error(`Esta solicitação soma ${amount.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })}, acima do seu limite de aprovação de ${approvalLimit.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })}.`);
    error.statusCode = 403;
    throw error;
  }

  if (request.warehouseId) {
    assertWarehouseAccess(user, request.warehouseId, 'Você só pode aprovar solicitações dos estoques/cidades autorizados ao seu usuário.');
  }
}

async function approveMaterialRequest({ requestId, req, notes }) {
  const approvedId = await sequelize.transaction(async (transaction) => {
    const request = await MaterialRequest.findByPk(requestId, {
      transaction,
      lock: transaction.LOCK.UPDATE,
    });

    if (!request) {
      const error = new Error('Solicitação não encontrada.');
      error.statusCode = 404;
      throw error;
    }

    if (request.status !== 'pendente_aprovacao') {
      const error = new Error(request.status === 'aprovado'
        ? 'Esta solicitação já foi aprovada.'
        : 'A solicitação não está pendente de aprovação.');
      error.statusCode = 409;
      throw error;
    }

    if (request.technicianId) {
      request.Technician = await Technician.findByPk(request.technicianId, { transaction });
    }

    validateApprover({ user: req.user, request });

    const amount = money(request.totalValue ?? 0);
    const technicianLimit = readTechnicianLimit(request);
    const approverLimit = readApproverLimit(req.user);
    const before = request.toJSON();
    const approvalNotes = String(notes || '').trim() || 'Aprovado.';
    const decidedAt = new Date();

    request.status = 'aprovado';
    request.approvedAt = decidedAt;
    request.approvedById = req.user.id;
    request.approvalNotes = approvalNotes;
    request.metadata = {
      ...(request.metadata || {}),
      approvedAmount: amount,
      technicianApprovalLimit: technicianLimit,
      approverApprovalLimit: Number.isFinite(approverLimit) ? approverLimit : null,
      approvedByRole: req.user.role,
      approvedByName: req.user.name,
      approvalDecisionAt: decidedAt.toISOString(),
    };
    await request.save({ transaction });

    await ApprovalRequest.update({
      status: 'aprovado',
      decidedAt,
      decidedById: req.user.id,
      decisionNotes: approvalNotes,
    }, {
      where: {
        entityType: 'material_request',
        entityId: String(request.id),
        status: 'pendente',
      },
      transaction,
    });

    const notificationMetadata = {
      requestId: request.id,
      requestNumber: request.requestNumber,
      warehouseId: request.warehouseId,
      technicianId: request.technicianId,
      approvedAmount: amount,
      technicianApprovalLimit: technicianLimit,
      approverApprovalLimit: Number.isFinite(approverLimit) ? approverLimit : null,
    };

    await Notification.create({
      userId: request.requestedById || null,
      role: 'todos',
      type: 'estoque',
      severity: 'success',
      title: `Solicitação aprovada ${request.requestNumber}`,
      message: request.requestType === 'recarga_estoque'
        ? `A recarga de ${amount.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })} foi aprovada e está pronta para recebimento no estoque.`
        : `A solicitação de ${amount.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })} foi aprovada e está pronta para separação e entrega ao técnico.`,
      route: '/solicitacoes-material',
      metadata: notificationMetadata,
    }, { transaction });

    if (request.requestType !== 'recarga_estoque') {
      await Notification.create({
        userId: null,
        role: 'estoquista',
        type: 'estoque',
        severity: 'success',
        title: `Entregar carga ${request.requestNumber}`,
        message: `A solicitação foi aprovada por ${req.user.name} e está pronta para o estoquista separar e entregar ao técnico.`,
        route: '/solicitacoes-material',
        metadata: notificationMetadata,
      }, { transaction });
    }

    await writeAudit({
      req,
      action: 'approve',
      entity: 'MaterialRequest',
      entityId: request.id,
      message: `Solicitação ${request.requestNumber} aprovada por ${req.user.name}. Valor aprovado: ${amount.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })}.`,
      beforeData: before,
      afterData: request.toJSON(),
      transaction,
    });

    return request.id;
  });

  return MaterialRequest.findByPk(approvedId, { include: includeFull() });
}

module.exports = {
  approveMaterialRequest,
  readTechnicianLimit,
  readApproverLimit,
  validateApprover,
};
