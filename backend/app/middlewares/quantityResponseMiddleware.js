function isQuantityField(key) {
  const normalized = String(key || '').toLowerCase();

  return (
    normalized === 'qtd' ||
    normalized === 'totalitems' ||
    normalized === 'totalquantity' ||
    normalized === 'approvedquantity' ||
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

  if (!/^[-+]?\d+(\.\d+)?$/.test(raw)) return value;

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
    } else {
      next[key] = normalizePayload(value);
    }
  }

  return next;
}

function quantityResponseMiddleware(req, res, next) {
  const originalJson = res.json.bind(res);

  res.json = function patchedJson(body) {
    return originalJson(normalizePayload(body));
  };

  next();
}

module.exports = quantityResponseMiddleware;
