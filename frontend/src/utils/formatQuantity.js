export function quantityNumber(value) {
  if (value === null || value === undefined || value === '') return 0;
  if (typeof value === 'number') return Number.isFinite(value) ? value : 0;
  const normalized = String(value).trim().replace(/\s+/g, '').replace(',', '.');
  const number = Number(normalized);
  return Number.isFinite(number) ? number : 0;
}

export function formatQuantity(value, unit = '') {
  const number = quantityNumber(value);
  const rounded = Math.round(number);
  const display = Math.abs(number - rounded) < 0.000001
    ? rounded.toLocaleString('pt-BR')
    : number.toLocaleString('pt-BR', { maximumFractionDigits: 3 });
  return `${display}${unit ? ` ${unit}` : ''}`.trim();
}

export function formatQuantityInput(value) {
  if (value === null || value === undefined || value === '') return '';
  const number = quantityNumber(value);
  const rounded = Math.round(number);
  if (Math.abs(number - rounded) < 0.000001) return String(rounded);
  return String(Number(number.toFixed(3)));
}

export function formatQuantityLabel(value, unit = '') {
  return formatQuantity(value, unit);
}
