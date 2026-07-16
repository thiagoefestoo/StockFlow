exports.money = (value) => Number(Number(value || 0).toFixed(2));
exports.qty = (value) => Number(Number(value || 0).toFixed(3));
exports.daysBetween = (from, to = new Date()) => {
  if (!from) return 0;
  return Math.max(0, Math.floor((new Date(to) - new Date(from)) / (1000 * 60 * 60 * 24)));
};
exports.normalizeDoc = (value) => String(value || '').replace(/\D/g, '');
