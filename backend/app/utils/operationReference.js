const crypto = require('crypto');

function normalizePrefix(value) {
  const normalized = String(value || 'OPERACAO')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toUpperCase()
    .replace(/[^A-Z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');

  return normalized || 'OPERACAO';
}

function nextOperationNumber(prefix = 'OPERACAO', date = new Date()) {
  const stamp = [
    date.getFullYear(),
    String(date.getMonth() + 1).padStart(2, '0'),
    String(date.getDate()).padStart(2, '0'),
    '-',
    String(date.getHours()).padStart(2, '0'),
    String(date.getMinutes()).padStart(2, '0'),
    String(date.getSeconds()).padStart(2, '0'),
    '-',
    String(date.getMilliseconds()).padStart(3, '0'),
  ].join('');

  const entropy = crypto.randomBytes(4).toString('hex').toUpperCase();
  return `${normalizePrefix(prefix)}-${stamp}-${entropy}`;
}

module.exports = {
  nextOperationNumber,
  normalizePrefix,
};
