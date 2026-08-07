const fs = require('fs');
const path = require('path');

const root = path.resolve(__dirname, '..', '..');

function read(relative) {
  return fs.readFileSync(path.join(root, relative), 'utf8');
}

const checks = [];
function check(name, condition) {
  checks.push({ name, ok: Boolean(condition) });
}

const technicianController = read('backend/app/controllers/technicianController.js');
const materialController = read('backend/app/controllers/materialController.js');
const stockController = read('backend/app/controllers/stockController.js');
const materialRequestController = read('backend/app/controllers/materialRequestController.js');
const approvalService = read('backend/app/services/materialRequestApprovalService.js');
const api = read('frontend/src/services/api.js');
const box = read('frontend/src/pages/TechnicianBoxControl.jsx');
const inbox = read('frontend/src/pages/TechnicianInbox.jsx');
const receiving = read('frontend/src/pages/Receiving.jsx');
const cockpit = read('frontend/src/pages/OperationsCockpit.jsx');
const layout = read('frontend/src/components/Layout.jsx');
const bell = read('frontend/src/components/NotificationBell.jsx');
const pulse = read('frontend/src/components/LivePulse.jsx');

check('Técnicos possui modo compacto aditivo', technicianController.includes("req.query.compact") && technicianController.includes('if (compact) return ok'));
check('Modo compacto evita bloco de métricas N+1', technicianController.indexOf('if (compact) return ok') < technicianController.indexOf('const assetCount = await SerializedAsset.count'));
check('Carga do técnico possui view operacional', technicianController.includes("req.query.view") && technicianController.includes("=== 'operational'"));
check('View operacional encerra antes do histórico pesado', technicianController.indexOf('if (operationalView)') < technicianController.indexOf('const rawMovements = await StockMovement.findAll'));
check('Histórico de guias da carga exclui attachmentData', technicianController.includes("attributes: { exclude: ['attachmentData'] }"));

check('Materiais possui modo compacto', materialController.includes("req.query.compact") && materialController.includes('if (compact && !needsStockContext)'));
check('Modo compacto de materiais preserva contexto de estoque quando solicitado', materialController.includes('needsStockContext'));
check('Central/retorno possui view operacional', stockController.includes("const operationalView = String(req.query.view"));
check('View operacional da caixa retorna antes de movimentos/OS', stockController.indexOf('if (operationalView)') < stockController.indexOf('const rawMovements = await StockMovement.findAll'));
check('Detalhe de perda não lê attachmentData', /exports\.getTechnicianLoss[\s\S]*?attributes: \{ exclude: \['attachmentData'\] \}/.test(stockController));
check('Vida do serial não carrega binário da guia', stockController.includes("model: Transfer, attributes: { exclude: ['attachmentData', 'stampText'] }"));

check('Solicitações não incluem binário da guia', materialRequestController.includes("model: Transfer, attributes: { exclude: ['attachmentData', 'stampText'] }"));
check('Aprovação de solicitação não recarrega binário da guia', approvalService.includes("model: Transfer, attributes: { exclude: ['attachmentData', 'stampText'] }"));

check('API emite evento único após escrita bem-sucedida', api.includes("superinfra:data-changed") && api.includes("method !== 'get'"));
check('Menu usa cache passivo de 5 minutos', layout.includes("pending-menu', {}, 300000") && layout.includes('setInterval(refreshWhenVisible, 300000)'));
check('Sino usa cache passivo de 5 minutos', bell.includes("limit: 20 } }, 300000") && bell.includes('setInterval(refreshWhenVisible, 300000)'));
check('Sino força dado atual quando o usuário abre', bell.includes("api.clearGetCache('/notifications')") && bell.includes("api.clearGetCache('/operations/pending-menu')"));
check('LivePulse usa cache passivo de 5 minutos', pulse.includes("limit: 20 } }, 300000") && pulse.includes('window.setInterval(refreshWhenVisible, 300000)'));
check('Globais reagem imediatamente a mutações', [layout, bell, pulse].every((text) => text.includes("addEventListener('superinfra:data-changed'")));

check('Central da caixa passou de 1 para 5 minutos', box.includes('setInterval(refreshWhenVisible, 300000)') && !box.includes('setInterval(refreshWhenVisible, 60000)'));
check('Central evita refresh por foco antes de 5 minutos', box.includes('lastBoxRefreshAtRef') && box.includes('Date.now() - lastBoxRefreshAtRef.current >= 300000'));
check('Minha caixa passou de 1 para 5 minutos', inbox.includes('setInterval(refreshWhenVisible, 300000)') && !inbox.includes('setInterval(refreshWhenVisible, 60000)'));
check('Minha caixa usa endpoint operacional', inbox.includes('/stock?view=operational'));
check('Minha caixa usa catálogo compacto', inbox.includes("api.get('/materials?compact=true')"));
check('Entrada de estoque usa catálogo compacto', receiving.includes("api.get('/materials?compact=true')"));
check('Cockpit registra Versão 84', cockpit.includes('StockFlow • Versão 84'));

const selectorFiles = [
  'frontend/src/pages/TechnicianPortal.jsx',
  'frontend/src/pages/TechnicianReturns.jsx',
  'frontend/src/pages/MaterialRequests.jsx',
  'frontend/src/pages/MovementHistory.jsx',
  'frontend/src/pages/TechnicianBoxControl.jsx',
  'frontend/src/pages/TechnicianLosses.jsx',
  'frontend/src/pages/TechnicianInbox.jsx',
  'frontend/src/pages/ServiceOrders.jsx',
  'frontend/src/pages/Transfers.jsx',
  'frontend/src/pages/LossEvaluation.jsx',
];
check('Telas de seleção usam lista compacta de técnicos', selectorFiles.every((file) => read(file).includes('/technicians?compact=true')));
check('Tela administrativa de Técnicos mantém resposta completa', read('frontend/src/pages/Technicians.jsx').includes("api.get('/technicians')") && !read('frontend/src/pages/Technicians.jsx').includes('/technicians?compact=true'));

const failed = checks.filter((item) => !item.ok);
for (const item of checks) {
  console.log(`${item.ok ? '[OK]' : '[FALHA]'} ${item.name}`);
}
console.log(`\nResultado: ${checks.length - failed.length}/${checks.length} verificações aprovadas.`);
if (failed.length) process.exit(1);
