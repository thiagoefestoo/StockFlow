const { AuditLog } = require('../models');

async function writeAudit({ req, action, entity, entityId, message, beforeData, afterData, transaction }) {
  try {
    await AuditLog.create({
      actorId: req?.user?.id || null,
      action,
      entity,
      entityId: entityId ? String(entityId) : null,
      message,
      beforeData: beforeData || null,
      afterData: afterData || null,
      ip: req?.ip || null,
    }, { transaction });
  } catch (error) {
    console.error('Erro ao gravar auditoria:', error.message);
  }
}

module.exports = { writeAudit };
