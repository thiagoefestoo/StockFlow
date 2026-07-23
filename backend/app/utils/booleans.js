function normalizeBoolean(value, defaultValue = false) {
  if (value === true || value === false) return value;
  if (value === 1 || value === '1') return true;
  if (value === 0 || value === '0') return false;
  if (value === null || value === undefined) return defaultValue;

  const raw = String(value).trim().toLowerCase();
  if (['true', 'sim', 's', 'yes', 'y', 'on'].includes(raw)) return true;
  if (['false', 'nao', 'não', 'n', 'no', 'off', ''].includes(raw)) return false;

  return defaultValue;
}

function isTrue(value) {
  return normalizeBoolean(value, false) === true;
}

module.exports = { normalizeBoolean, isTrue };
