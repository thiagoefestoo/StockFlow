function isQuantityField(key) {
  const normalized = String(key || '').toLowerCase();

  return (
    normalized === 'qtd' ||
    normalized === 'totalitems' ||
    normalized === 'totalquantity' ||
    normalized === 'approvedquantity' ||
    normalized === 'requestedquantity' ||
    normalized === 'availablequantity' ||
    normalized.includes('quantity')
  );
}

function normalizeQuantityValue(value) {
  if (value === null || value === undefined || value === '') return value;

  if (typeof value === 'number') {
    return Number.isFinite(value) ? value : value;
  }

  if (typeof value !== 'string') return value;

  const raw = value.trim();

  // Aceita valores decimais vindos do PostgreSQL/Sequelize: "1.000", "20.000"
  if (!/^[-+]?\\d+(\\.\\d+)?$/.test(raw)) return value;

  const parsed = Number(raw);

  if (!Number.isFinite(parsed)) return value;

  return parsed;
}

function normalizePayload(payload) {
  if (Array.isArray(payload)) {
    return payload.map(normalizePayload);
  }

  if (!payload || typeof payload !== 'object') {
    return payload;
  }

  const next = {};

  for (const [key, value] of Object.entries(payload)) {
    if (isQuantityField(key)) {
      next[key] = normalizeQuantityValue(value);
      continue;
    }

    if (Array.isArray(value)) {
      next[key] = value.map(normalizePayload);
      continue;
    }

    if (value && typeof value === 'object') {
      next[key] = normalizePayload(value);
      continue;
    }

    next[key] = value;
  }

  return next;
}

function quantityResponseMiddleware(req, res, next) {
  const originalJson = res.json.bind(res);

  res.json = function jsonWithNormalizedQuantities(body) {
    try {
      // Transforma Sequelize/Date/objetos especiais em JSON puro antes de percorrer.
      // Isso evita Maximum call stack size exceeded.
      const plainBody = body === undefined ? body : JSON.parse(JSON.stringify(body));
      return originalJson(normalizePayload(plainBody));
    } catch (error) {
      console.error('Erro ao normalizar quantidades da resposta:', error.message);
      return originalJson(body);
    }
  };

  next();
}

module.exports = quantityResponseMiddleware;
