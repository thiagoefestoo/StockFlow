const { qty } = require('./number');

function normalizeServiceOrderQuantityLimit(value) {
  if (value === null || value === undefined || String(value).trim() === '') return null;
  const parsed = Number(value);
  if (!Number.isFinite(parsed) || parsed <= 0) {
    const error = new Error('O limite máximo por OS precisa ser maior que zero ou ficar em branco.');
    error.statusCode = 400;
    throw error;
  }
  return Number(parsed.toFixed(3));
}

const PROTECTED_SERVICE_ORDER_LIMITS = Object.freeze({
  ATFX200571: 2,
});

function materialServiceOrderQuantityLimit(material) {
  if (!material || material.requiresSerial === true) return null;
  const parsed = Number(material.maxQuantityPerServiceOrder);
  if (Number.isFinite(parsed) && parsed > 0) return parsed;
  const sku = String(material.sku || '').trim().toUpperCase();
  return PROTECTED_SERVICE_ORDER_LIMITS[sku] || null;
}

function assertMaterialServiceOrderQuantity(material, requestedQuantity) {
  const quantity = qty(requestedQuantity);
  if (quantity <= 0) {
    const error = new Error(`Informe uma quantidade válida para ${material?.name || 'o material'}.`);
    error.statusCode = 400;
    throw error;
  }

  const limit = materialServiceOrderQuantityLimit(material);
  if (limit !== null && quantity > limit) {
    const error = new Error(
      `O material ${material.name} permite no máximo ${limit} unidade(s) por ordem de serviço. Quantidade informada: ${quantity}.`,
    );
    error.statusCode = 400;
    error.code = 'SERVICE_ORDER_MATERIAL_LIMIT_EXCEEDED';
    error.details = {
      materialId: material.id,
      sku: material.sku,
      materialName: material.name,
      requestedQuantity: quantity,
      maxQuantityPerServiceOrder: limit,
    };
    throw error;
  }

  return quantity;
}

module.exports = {
  normalizeServiceOrderQuantityLimit,
  materialServiceOrderQuantityLimit,
  assertMaterialServiceOrderQuantity,
  PROTECTED_SERVICE_ORDER_LIMITS,
};
