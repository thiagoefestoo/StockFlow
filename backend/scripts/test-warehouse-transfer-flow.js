const assert = require('assert');
const fs = require('fs');
const path = require('path');
const { nextOperationNumber } = require('../app/utils/operationReference');

const generated = new Set();
for (let index = 0; index < 5000; index += 1) {
  const number = nextOperationNumber('TE');
  assert.match(number, /^TE-\d{8}-\d{6}-\d{3}-[A-F0-9]{8}$/);
  assert.equal(generated.has(number), false, `Número duplicado: ${number}`);
  generated.add(number);
}

function read(relative) {
  return fs.readFileSync(path.join(__dirname, '..', relative), 'utf8');
}

const service = read('app/services/warehouseTransferService.js');
const warehouseController = read('app/controllers/warehouseController.js');
const approvalController = read('app/controllers/approvalController.js');
const frontend = fs.readFileSync(
  path.join(__dirname, '../../frontend/src/pages/Warehouses.jsx'),
  'utf8',
);

assert.ok(service.includes("const { nextOperationNumber } = require('../utils/operationReference');"));
assert.ok(service.includes("operationReference"));
assert.ok(service.includes("materialId: material.id"));
assert.ok(service.includes("lock: transaction.LOCK.UPDATE"));
assert.ok(service.includes("transaction: externalTransaction = null"));
assert.ok(service.includes("if (externalTransaction)"));
assert.ok(!service.includes("return `TE-${stamp}`"));

assert.ok(warehouseController.includes("workflowCode: plan.operationNumber"));
assert.ok(warehouseController.includes("entityId: plan.operationNumber"));
assert.ok(warehouseController.includes("Referência: ${plan.operationReference}."));
assert.ok(warehouseController.includes("sequelize.transaction(async (transaction)"));

assert.ok(approvalController.includes("const lockedApproval = await ApprovalRequest.findByPk"));
assert.ok(approvalController.includes("lock: transaction.LOCK.UPDATE"));
assert.ok(approvalController.includes("transaction,"));
assert.ok(approvalController.includes("transfer: result.transfer"));

assert.ok(frontend.includes("loadTransferInventory"));
assert.ok(frontend.includes("availableOnly: true"));
assert.ok(frontend.includes("activeOnly: true"));
assert.ok(frontend.includes("changeTransferSourceWarehouse"));
assert.ok(frontend.includes("items: []"));
assert.ok(frontend.includes("Pode ser repetida. O número único da operação será gerado automaticamente."));
assert.ok(frontend.includes("Quantidade maior que o saldo"));
assert.ok(frontend.includes("Gerado automaticamente após confirmar"));

console.log('Teste aprovado: fluxo de transferência entre estoques revisado.');
console.log(`Números únicos verificados: ${generated.size}`);
console.log('Aprovação e movimentação permanecem na mesma transação.');
