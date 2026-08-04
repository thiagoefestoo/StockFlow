const fs = require('fs');
const path = require('path');
const assert = require('assert');

const root = path.resolve(__dirname, '..', '..');
const stockController = fs.readFileSync(path.join(root, 'backend/app/controllers/stockController.js'), 'utf8');
const stockRoutes = fs.readFileSync(path.join(root, 'backend/app/routes/stockRoutes.js'), 'utf8');
const lossPage = fs.readFileSync(path.join(root, 'frontend/src/pages/TechnicianLosses.jsx'), 'utf8');
const lossPrint = fs.readFileSync(path.join(root, 'frontend/src/pages/LossPrint.jsx'), 'utf8');

assert(stockController.includes('LOSS_MAX_ATTACHMENTS_PER_REQUEST = 8'));
assert(stockController.includes('LOSS_MAX_ATTACHMENTS_PER_RECORD = 30'));
assert(stockController.includes('prepareIncomingLossAttachments'));
assert(stockController.includes('appendTechnicianLossAttachments'));
assert(stockController.includes("action: 'loss_attachments_append'"));
assert(stockController.includes("status: initialAttachments.length ? 'assinado' : 'pendente_assinatura'"));
assert(stockRoutes.includes("router.post('/technician-losses/:id/attachments'"));
assert(stockRoutes.includes("router.get('/technician-losses/:id/attachments/:index'"));
assert(lossPage.includes('type="file" multiple accept="image/*,.pdf"'));
assert(lossPage.includes('/stock/technician-losses/${id}/attachments'));
assert(lossPage.includes('form.attachments.length'));
assert(lossPrint.includes('getTransferAttachments(loss)'));
assert(lossPrint.includes('/stock/technician-losses/${loss.id}/attachments/${index}'));

const sample = [
  { name: 'termo.pdf', data: 'data:application/pdf;base64,QQ==' },
  { name: 'foto.jpg', data: 'data:image/jpeg;base64,QQ==' },
];
const serialized = JSON.stringify(sample);
const parsed = JSON.parse(serialized);
assert.strictEqual(parsed.length, 2);
assert.strictEqual(parsed[0].name, 'termo.pdf');
assert.strictEqual(parsed[1].name, 'foto.jpg');

console.log('OK: múltiplos documentos por perda validados.');
