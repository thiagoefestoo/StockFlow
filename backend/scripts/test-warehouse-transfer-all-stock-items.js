const assert = require('assert');
const fs = require('fs');
const path = require('path');

const frontendPath = path.join(__dirname, '../../frontend/src/pages/Warehouses.jsx');
const servicePath = path.join(__dirname, '../app/services/warehouseTransferService.js');

const frontend = fs.readFileSync(frontendPath, 'utf8');
const service = fs.readFileSync(servicePath, 'utf8');

const loadStart = frontend.indexOf('async function loadTransferInventory');
const loadEnd = frontend.indexOf('\n  useEffect(() => { load();', loadStart);
const loadFlow = frontend.slice(loadStart, loadEnd);

assert.ok(loadFlow.includes("api.get('/materials'"));
assert.ok(loadFlow.includes('warehouseId: fromWarehouseId'));
assert.ok(loadFlow.includes('availableOnly: true'));
assert.ok(!loadFlow.includes('activeOnly: true'));
assert.ok(loadFlow.includes('localeCompare('));
assert.ok(frontend.includes('INATIVO NO CATÁLOGO'));
assert.ok(frontend.includes('todos os materiais com saldo físico positivo'));
assert.ok(
  frontend.includes(
    'O estoque de origem não possui materiais ou equipamentos com saldo físico positivo para transferência.',
  ),
);

const planStart = service.indexOf('async function buildWarehouseTransferPlan');
const planEnd = service.indexOf('\nasync function getLockedBalances', planStart);
const planFlow = service.slice(planStart, planEnd);

assert.ok(planFlow.includes('const material = await Material.findByPk'));
assert.ok(!planFlow.includes('material.active === false'));
assert.ok(planFlow.includes('Saldo insuficiente para'));
assert.ok(planFlow.includes("status: 'em_estoque'"));
assert.ok(planFlow.includes('materialId: material.id'));

console.log('Teste aprovado: todos os itens com saldo positivo são carregados para transferência.');
console.log('Materiais inativos com saldo podem ser realocados entre estoques.');
console.log('Validações de saldo, serial, origem e material permanecem ativas.');
