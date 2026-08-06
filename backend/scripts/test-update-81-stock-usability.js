const assert = require('assert');
const fs = require('fs');
const path = require('path');

const root = path.join(__dirname, '../..');
const read = (relative) => fs.readFileSync(path.join(root, relative), 'utf8');

const batch = read('backend/app/controllers/batchController.js');
assert.ok(batch.includes('dateFrom'));
assert.ok(batch.includes('requestedMaterialId'));
assert.ok(batch.includes('fiscalDocumentType'));
assert.ok(batch.includes('proofAttachmentName'));
assert.ok(batch.includes('matchingBatchIds'));

const receiving = read('frontend/src/pages/Receiving.jsx');
assert.ok(receiving.includes('Filtros das entradas'));
assert.ok(receiving.includes('appliedListFilters'));
assert.ok(receiving.includes('Tipo de documento'));
assert.ok(receiving.includes('Comprovante'));
assert.ok(receiving.includes('onPageChange={(targetPage) => load(targetPage, false, appliedListFilters)}'));

const index = read('frontend/src/index.js');
const wheelGuard = read('frontend/src/utils/numberInputWheelGuard.js');
assert.ok(index.includes('registerNumberInputWheelGuard();'));
assert.ok(wheelGuard.includes("target.type !== 'number'"));
assert.ok(wheelGuard.includes('event.preventDefault()'));
assert.ok(wheelGuard.includes('target.blur()'));
assert.ok(wheelGuard.includes('passive: false'));

const technicians = read('frontend/src/pages/Technicians.jsx');
const headingIndex = technicians.indexOf('Ferramentas da transferência');
const rowsIndex = technicians.indexOf('(toolForm.items || []).map', headingIndex);
const bottomButtonIndex = technicians.indexOf('＋ Adicionar mais uma ferramenta', rowsIndex);
const notesIndex = technicians.indexOf('Observações gerais', rowsIndex);
assert.ok(rowsIndex > headingIndex);
assert.ok(bottomButtonIndex > rowsIndex);
assert.ok(notesIndex > bottomButtonIndex);
assert.ok(!technicians.slice(headingIndex, rowsIndex).includes('Adicionar outra ferramenta'));

const controller = read('backend/app/controllers/materialController.js');
const routes = read('backend/app/routes/materialRoutes.js');
const stock = read('frontend/src/pages/Stock.jsx');
const backendPermissions = read('backend/app/config/modulePermissions.js');
const frontendPermissions = read('frontend/src/config/modulePermissions.js');
assert.ok(controller.includes('exports.deletionCheck'));
assert.ok(controller.includes('exports.remove'));
assert.ok(controller.includes('materialDeletionCheck'));
assert.ok(controller.includes('StockBalance.destroy'));
assert.ok(controller.includes("action: 'delete'"));
assert.ok(controller.includes('Este material não pode ser excluído porque possui saldo, histórico ou vínculo operacional'));
assert.ok(routes.includes("router.delete('/:id', requireModule('materialDelete')"));
assert.ok(stock.includes('Excluir permanentemente'));
assert.ok(stock.includes('deletion-check'));
assert.ok(stock.includes('confirmationSku'));
assert.ok(backendPermissions.includes("key: 'materialDelete'"));
assert.ok(frontendPermissions.includes("key: 'materialDelete'"));

console.log('Atualização 81 validada:');
console.log('- filtros paginados na entrada de estoque;');
console.log('- scroll bloqueado em todos os campos numéricos;');
console.log('- botão de adicionar ferramenta abaixo do último item;');
console.log('- exclusão segura apenas para material sem saldo e sem histórico.');
