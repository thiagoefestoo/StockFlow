export function normalizeQuantity(value) {
  if (value === null || value === undefined || value === '') return 0;

  if (typeof value === 'number') {
    return Number.isFinite(value) ? value : 0;
  }

  const raw = String(value).trim();

  if (!raw) return 0;

  // No banco, quantidades podem vir como "1.000", "3.000", "20.000".
  // Para o sistema, isso significa 1, 3, 20 unidades, não milhar.
  const normalized = raw.replace(',', '.');
  const parsed = Number(normalized);

  if (!Number.isFinite(parsed)) return 0;

  return parsed;
}

export function formatQuantity(value) {
  const number = normalizeQuantity(value);

  if (Number.isInteger(number)) {
    return String(number);
  }

  return number
    .toLocaleString('pt-BR', {
      minimumFractionDigits: 0,
      maximumFractionDigits: 3,
      useGrouping: false,
    })
    .replace(/,?0+$/, '');
}

export function formatQuantityInput(value) {
  if (value === null || value === undefined || value === '') return '';

  const number = normalizeQuantity(value);

  if (Number.isInteger(number)) {
    return String(number);
  }

  return String(number).replace(',', '.');
}

export function formatQuantityLabel(value, singular = 'unidade', plural = 'unidades') {
  const number = normalizeQuantity(value);
  const formatted = formatQuantity(number);

  if (Math.abs(number) === 1) {
    return `${formatted} ${singular}`;
  }

  return `${formatted} ${plural}`;
}

export function formatQuantityWithUnit(value, unit = 'un') {
  return `${formatQuantity(value)} ${unit}`;
}

export const formatQty = formatQuantity;
export const formatQtyLabel = formatQuantityLabel;
export const formatQtyInput = formatQuantityInput;

export default formatQuantity;
