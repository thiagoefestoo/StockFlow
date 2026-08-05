const assert = require('assert');
const fs = require('fs');
const path = require('path');
const { nextOperationNumber, normalizePrefix } = require('../app/utils/operationReference');

const generated = new Set();
const fixedDate = new Date('2026-08-05T23:15:42.123Z');

for (let index = 0; index < 5000; index += 1) {
  const number = nextOperationNumber('RETORNO', fixedDate);
  assert.match(number, /^RETORNO-\d{8}-\d{6}-\d{3}-[A-F0-9]{8}$/);
  assert.equal(number.length <= 80, true);
  assert.equal(generated.has(number), false, `Número duplicado: ${number}`);
  generated.add(number);
}

assert.equal(normalizePrefix('Retorno técnico'), 'RETORNO-TECNICO');

const controllerPath = path.join(__dirname, '../app/controllers/stockController.js');
const controller = fs.readFileSync(controllerPath, 'utf8');
const start = controller.indexOf('exports.returnFromTechnician');
const end = controller.indexOf('\nexports.', start + 10);
const returnFlow = controller.slice(start, end);

assert.ok(returnFlow.includes("const guideNumber = nextOperationNumber('RETORNO');"));
assert.ok(returnFlow.includes("const operationReference = String(reference || '').trim() || 'Devolução de material';"));
assert.ok(returnFlow.includes('transferNumber: guideNumber'));
assert.ok(returnFlow.includes('REFERÊNCIA: ${operationReference}.'));
assert.ok(returnFlow.includes('reference: guideNumber'));
assert.ok(!returnFlow.includes('transferNumber: operationReference'));
assert.ok(!returnFlow.includes('reference || nextReturnNumber()'));

console.log('Teste aprovado: referência descritiva separada do número único da guia.');
console.log(`Números únicos verificados: ${generated.size}`);
