const assert = require('assert');
const {
  assertMaterialServiceOrderQuantity,
  materialServiceOrderQuantityLimit,
  normalizeServiceOrderQuantityLimit,
} = require('../app/utils/serviceOrderQuantityLimit');

const connector = {
  id: 1,
  sku: 'ATFX200571',
  name: 'CONECTOR MECANICO SC APC VERDE DTC042',
  requiresSerial: false,
  maxQuantityPerServiceOrder: 2,
};

assert.strictEqual(normalizeServiceOrderQuantityLimit(''), null);
assert.strictEqual(normalizeServiceOrderQuantityLimit('2'), 2);
assert.strictEqual(materialServiceOrderQuantityLimit(connector), 2);
assert.strictEqual(assertMaterialServiceOrderQuantity(connector, 1), 1);
assert.strictEqual(assertMaterialServiceOrderQuantity(connector, 2), 2);
assert.throws(
  () => assertMaterialServiceOrderQuantity(connector, 3),
  (error) => error.code === 'SERVICE_ORDER_MATERIAL_LIMIT_EXCEEDED',
);
assert.strictEqual(
  assertMaterialServiceOrderQuantity({ ...connector, sku: 'ATFX999999', maxQuantityPerServiceOrder: null }, 30),
  30,
);
assert.throws(
  () => assertMaterialServiceOrderQuantity({ ...connector, maxQuantityPerServiceOrder: null }, 3),
  (error) => error.code === 'SERVICE_ORDER_MATERIAL_LIMIT_EXCEEDED',
);
assert.strictEqual(
  materialServiceOrderQuantityLimit({ ...connector, requiresSerial: true }),
  null,
);

console.log('✅ Regra de limite máximo por OS validada: 1 e 2 permitidos; 3 bloqueado; materiais sem limite preservados.');
