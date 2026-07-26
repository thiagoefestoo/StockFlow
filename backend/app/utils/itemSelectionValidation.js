function normalizeId(value) {
  const normalized = String(value ?? '').trim();
  return normalized || '';
}

function parseSerials(item = {}) {
  if (Array.isArray(item.serialNumbers)) {
    return item.serialNumbers.map((value) => String(value || '').trim()).filter(Boolean);
  }
  return String(item.serialNumbersText || '')
    .split(/\r?\n|,|;|\t/)
    .map((value) => value.trim())
    .filter(Boolean);
}

function findDuplicateMaterialIds(items = []) {
  const seen = new Set();
  const repeated = new Set();
  for (const item of items) {
    const id = normalizeId(item?.materialId);
    if (!id) continue;
    if (seen.has(id)) repeated.add(id);
    seen.add(id);
  }
  return Array.from(repeated);
}

function findDuplicateSerials(items = []) {
  const seen = new Set();
  const repeated = new Set();
  for (const item of items) {
    for (const rawSerial of parseSerials(item)) {
      const serial = rawSerial.toUpperCase();
      if (seen.has(serial)) repeated.add(rawSerial);
      seen.add(serial);
    }
  }
  return Array.from(repeated);
}

function assertUniqueOperationItems(items = [], { allowDuplicateMaterials = false } = {}) {
  if (!allowDuplicateMaterials) {
    const duplicateMaterials = findDuplicateMaterialIds(items);
    if (duplicateMaterials.length) {
      const error = new Error('O mesmo material não pode aparecer mais de uma vez na mesma operação. Agrupe a quantidade em uma única linha.');
      error.statusCode = 400;
      throw error;
    }
  }

  const duplicateSerials = findDuplicateSerials(items);
  if (duplicateSerials.length) {
    const error = new Error(`O mesmo serial não pode aparecer mais de uma vez na operação: ${duplicateSerials.join(', ')}.`);
    error.statusCode = 400;
    throw error;
  }
}

module.exports = {
  assertUniqueOperationItems,
  findDuplicateMaterialIds,
  findDuplicateSerials,
  parseSerials,
};
