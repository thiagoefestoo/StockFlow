const assert = require('assert');
const fs = require('fs');
const path = require('path');
const { normalizeModulePermissions, hasModuleAccess } = require('../app/config/modulePermissions');

const permission = 'stockBatchQuantityEdit';

assert.strictEqual(hasModuleAccess({ role: 'admin', modulePermissions: [] }, permission), true);
assert.strictEqual(hasModuleAccess({ role: 'supervisor', modulePermissions: null }, permission), false);
assert.strictEqual(hasModuleAccess({ role: 'estoquista', modulePermissions: null }, permission), false);
assert.strictEqual(hasModuleAccess({ role: 'tecnico', modulePermissions: null }, permission), false);
assert.strictEqual(hasModuleAccess({ role: 'supervisor', modulePermissions: [permission] }, permission), true);
assert.strictEqual(hasModuleAccess({ role: 'estoquista', modulePermissions: [permission] }, permission), true);
assert.ok(normalizeModulePermissions([permission], 'estoquista').includes(permission));

const controllerPath = path.join(__dirname, '../app/controllers/batchController.js');
const controllerSource = fs.readFileSync(controllerPath, 'utf8');

assert.ok(controllerSource.includes("hasModuleAccess(req.user, 'stockBatchQuantityEdit')"));
assert.ok(controllerSource.includes('delta: change.delta'));
assert.ok(controllerSource.includes('Saldo insuficiente') || controllerSource.includes('adjustBalance'));
assert.ok(controllerSource.includes('A quantidade de'));
assert.ok(controllerSource.includes('não pode ser alterada nesta tela porque está vinculada a seriais'));
assert.ok(controllerSource.includes('totalItems'));
assert.ok(controllerSource.includes('totalValue'));

const lockedItemsStart = controllerSource.indexOf('const batchItems = await StockBatchItem.findAll({');
const lockedItemsEnd = controllerSource.indexOf('const beforeData = {', lockedItemsStart);
assert.ok(lockedItemsStart >= 0 && lockedItemsEnd > lockedItemsStart);
const lockedItemsQuery = controllerSource.slice(lockedItemsStart, lockedItemsEnd);
assert.ok(lockedItemsQuery.includes('lock: transaction.LOCK.UPDATE'));
assert.ok(!lockedItemsQuery.includes('include:'), 'A consulta com FOR UPDATE não pode possuir include/OUTER JOIN.');
assert.ok(lockedItemsQuery.includes('await Material.findAll({'));
assert.ok(controllerSource.includes('PostgreSQL não permite aplicar FOR UPDATE'));

console.log('Permissão e proteções da edição de quantidades validadas.');
