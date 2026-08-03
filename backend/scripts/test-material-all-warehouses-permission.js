const assert = require('assert');
const { normalizeModulePermissions, hasModuleAccess } = require('../app/config/modulePermissions');

const permission = 'materialAllWarehouses';

assert.strictEqual(hasModuleAccess({ role: 'admin', modulePermissions: [] }, permission), true);
assert.strictEqual(hasModuleAccess({ role: 'supervisor', modulePermissions: null }, permission), false);
assert.strictEqual(hasModuleAccess({ role: 'estoquista', modulePermissions: null }, permission), false);
assert.strictEqual(hasModuleAccess({ role: 'tecnico', modulePermissions: null }, permission), false);
assert.strictEqual(hasModuleAccess({ role: 'supervisor', modulePermissions: [permission] }, permission), true);
assert.strictEqual(hasModuleAccess({ role: 'estoquista', modulePermissions: [permission] }, permission), true);
assert.ok(normalizeModulePermissions([permission], 'estoquista').includes(permission));

console.log('Permissão de cadastro em todos os estoques validada.');
