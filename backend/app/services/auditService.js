const { AuditLog } = require('../models');

const BINARY_KEYS = new Set([
  'attachmentData',
  'proofAttachmentData',
  'documentData',
  'fileData',
]);

function sanitizeAuditData(value, key = '', seen = new WeakSet()) {
  if (value === null || value === undefined) return value;
  if (typeof value === 'string') {
    if (BINARY_KEYS.has(key) || value.startsWith('data:')) {
      return `[conteúdo binário omitido da auditoria: ${value.length} caracteres]`;
    }
    return value;
  }
  if (typeof value !== 'object') return value;
  if (seen.has(value)) return '[referência circular omitida]';
  seen.add(value);
  if (Array.isArray(value)) return value.map((item) => sanitizeAuditData(item, key, seen));

  const output = {};
  for (const [childKey, childValue] of Object.entries(value)) {
    output[childKey] = sanitizeAuditData(childValue, childKey, seen);
  }
  return output;
}

async function writeAudit({ req, action, entity, entityId, message, beforeData, afterData, transaction }) {
  try {
    await AuditLog.create({
      actorId: req?.user?.id || null,
      action,
      entity,
      entityId: entityId ? String(entityId) : null,
      message,
      beforeData: beforeData ? sanitizeAuditData(beforeData) : null,
      afterData: afterData ? sanitizeAuditData(afterData) : null,
      ip: req?.ip || null,
    }, { transaction });
  } catch (error) {
    console.error('Erro ao gravar auditoria:', error.message);
  }
}

module.exports = { writeAudit, sanitizeAuditData };
