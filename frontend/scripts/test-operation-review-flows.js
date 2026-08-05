const fs = require('fs');
const path = require('path');

const root = path.resolve(__dirname, '..', '..');

function read(relativePath) {
  return fs.readFileSync(path.join(root, relativePath), 'utf8');
}

function assertContains(relativePath, markers) {
  const content = read(relativePath);
  for (const marker of markers) {
    if (!content.includes(marker)) {
      throw new Error(`${relativePath}: marcador ausente: ${marker}`);
    }
  }
  return content;
}

function count(content, marker) {
  return content.split(marker).length - 1;
}

const reviewComponent = assertContains('frontend/src/components/OperationReviewModal.jsx', [
  "const canConfirm = safeItems.length > 0 && typeof onConfirm === 'function';",
  'disabled={loading || !canConfirm}',
  'item.serialCount ?? serials.length',
  'Nenhum item selecionado. Volte e adicione pelo menos um item antes de confirmar.',
  'Última conferência antes de confirmar a operação',
]);

const receiving = assertContains('frontend/src/pages/Receiving.jsx', [
  'title="Revisar entrada de material"',
  'onConfirm={save}',
  'const error = validationMessage();',
  'serialCount: serials.length',
  'serialPreview: serials.slice(0, 5).join',
]);
if (count(receiving, 'serialCount: serials.length') < 2) {
  throw new Error('Receiving.jsx: entrada normal e logística reversa devem informar os seriais na revisão.');
}

assertContains('frontend/src/pages/TechnicianReturns.jsx', [
  'title="Revisar retorno do técnico para o estoque"',
  'const error = validate();',
  'onConfirm={save}',
  'serialCount: serials.length',
]);

assertContains('frontend/src/pages/TechnicianLosses.jsx', [
  'title="Revisar perda ou desconto"',
  'const validationError = validate();',
  'onConfirm={save}',
  'totalQuantity={reviewQuantity}',
]);

const boxControl = assertContains('frontend/src/pages/TechnicianBoxControl.jsx', [
  "open={Boolean(reviewType)}",
  'openClientReview',
  'openReturnReview',
  "onConfirm={reviewType === 'client' ? moveToClient : returnToStock}",
  'serialCount: serials.length',
]);
if (count(boxControl, 'const error = validate') < 4) {
  throw new Error('TechnicianBoxControl.jsx: abertura e confirmação devem revalidar baixa e devolução.');
}

assertContains('frontend/src/pages/TechnicianPortal.jsx', [
  'title="Revisar baixa do serviço"',
  'const error = validate();',
  'onConfirm={save}',
  "find((asset) => asset.serialNumber === serial)?.acquisitionCost",
]);

const inbox = assertContains('frontend/src/pages/TechnicianInbox.jsx', [
  'title="Revisar baixa do serviço"',
  'title="Revisar solicitação de material"',
  'items={requestReviewItems}',
  'totalQuantity={requestReviewQuantity}',
  'onConfirm={sendRequest}',
  'const validationError = validateRequest();',
  "find((asset) => asset.serialNumber === serial)?.acquisitionCost",
]);
if (count(inbox, '<OperationReviewModal') < 2) {
  throw new Error('TechnicianInbox.jsx: a baixa de OS e a solicitação devem possuir revisão completa.');
}

assertContains('frontend/src/pages/Technicians.jsx', [
  'title="Revisar transferência de ferramentas para o técnico"',
  'validateToolTransferForm()',
  'items={toolTransferReviewItems}',
  'onConfirm={saveTool}',
]);

const transfers = assertContains('frontend/src/pages/Transfers.jsx', [
  "const requiresDirectApproval = !form.materialRequestId",
  'if (requiresDirectApproval)',
  "confirmLabel={requiresDirectApproval ? 'Confirmar e enviar para aprovação'",
  'title="Revisar transferência de ferramentas"',
  'onConfirm={save}',
  'onConfirm={saveToolTransfer}',
]);
if (count(transfers, '<OperationReviewModal') < 2) {
  throw new Error('Transfers.jsx: transferência de materiais e ferramentas devem possuir revisão.');
}

const warehouses = assertContains('frontend/src/pages/Warehouses.jsx', [
  'title="Confirmar saída de logística reversa"',
  'title="Revisar transferência entre estoques"',
  'onConfirm={submitReverseExit}',
  'onConfirm={submitWarehouseTransfer}',
]);
if (count(warehouses, '<OperationReviewModal') < 2) {
  throw new Error('Warehouses.jsx: saída reversa e transferência entre estoques devem possuir revisão.');
}

assertContains('frontend/src/pages/MaterialRequests.jsx', [
  'title="Revise e confirme a solicitação"',
  'Itens solicitados',
  'requestReview.items.map',
  'Sim, confirmar solicitação',
]);

const pageFiles = [
  'frontend/src/pages/Receiving.jsx',
  'frontend/src/pages/TechnicianBoxControl.jsx',
  'frontend/src/pages/TechnicianInbox.jsx',
  'frontend/src/pages/TechnicianLosses.jsx',
  'frontend/src/pages/TechnicianPortal.jsx',
  'frontend/src/pages/TechnicianReturns.jsx',
  'frontend/src/pages/Technicians.jsx',
  'frontend/src/pages/Transfers.jsx',
  'frontend/src/pages/Warehouses.jsx',
];
const modalCount = pageFiles.reduce((total, file) => total + count(read(file), '<OperationReviewModal'), 0);
if (modalCount !== 12) {
  throw new Error(`Quantidade inesperada de revisões padronizadas: ${modalCount}. Esperado: 12.`);
}

console.log('Revisões validadas:');
console.log('- entrada de estoque');
console.log('- retorno do técnico');
console.log('- perda/desconto');
console.log('- baixa de OS no portal e na caixa');
console.log('- solicitação pela caixa do técnico');
console.log('- transferência para técnico');
console.log('- ferramentas para ficha do técnico');
console.log('- ferramentas entre técnicos');
console.log('- transferência entre estoques');
console.log('- saída de logística reversa');
console.log('- solicitação de material');
console.log(`Total de modais padronizados verificados: ${modalCount}.`);
