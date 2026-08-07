const fs = require('fs');
const path = require('path');

const root = path.resolve(__dirname, '..', '..');
const read = (relative) => fs.readFileSync(path.join(root, relative), 'utf8');
const checks = [];
function check(name, condition) {
  checks.push({ name, ok: Boolean(condition) });
  if (!condition) throw new Error(`Falhou: ${name}`);
}

const transferController = read('backend/app/controllers/transferController.js');
const toolController = read('backend/app/controllers/technicianToolController.js');
const toolRoutes = read('backend/app/routes/technicianToolRoutes.js');
const transfersPage = read('frontend/src/pages/Transfers.jsx');
const techniciansPage = read('frontend/src/pages/Technicians.jsx');
const transferPrint = read('frontend/src/pages/TransferPrint.jsx');
const cockpit = read('frontend/src/pages/OperationsCockpit.jsx');

check('trava backend só para transferência direta', transferController.includes("if (!materialRequestId) {") && transferController.includes("status: 'aprovado'") && transferController.includes("requestType: 'reposicao_carga'"));
check('código de erro da pendência existe', transferController.includes('PENDING_MATERIAL_REQUEST_DELIVERY'));
check('entrega vinculada continua validada separadamente', transferController.includes("if (materialRequestId) {") && transferController.includes("linkedRequest.status !== 'aprovado'"));
check('nenhuma alteração em fluxo de OS neste patch', !transferController.includes('serviceOrderId'));
check('rota de baixa múltipla registrada', toolRoutes.includes("router.post('/remove-batch'"));
check('baixa múltipla é transacional', toolController.includes('exports.removeBatch') && toolController.includes('sequelize.transaction(async (transaction)'));
check('baixa múltipla exige ferramentas ativas do mesmo técnico', toolController.includes("status: 'com_tecnico'") && toolController.includes('technicianId: technician.id'));
check('baixa múltipla gera guia única', toolController.includes("transferType: 'baixa_ferramenta'") && toolController.includes('nextToolRemovalNumber'));
check('devolução múltipla retorna saldo ao estoque', toolController.includes("type: 'retorno_tecnico'") && toolController.includes('delta: group.quantity'));
check('substituição individual preservada', toolController.includes('Substituições continuam sendo feitas individualmente') && toolController.includes('exports.remove ='));
check('frontend bloqueia revisão quando há pendência', transfersPage.includes('directTransferBlocked') && transfersPage.includes('Resolva a preparação pendente'));
check('frontend leva direto para preparar pendência', transfersPage.includes('📦 Preparar pendência'));
check('fila mostra data e hora', transfersPage.includes('<th>Data/hora</th>') && transfersPage.includes('dt(request.createdAt)'));
check('baixa múltipla disponível na ficha do técnico', techniciansPage.includes('Baixar várias ferramentas') && techniciansPage.includes('remove-batch'));
check('baixa múltipla permite quantidade por tipo', techniciansPage.includes('setBulkRemovalQuantity') && techniciansPage.includes('bulk-tool-removal-quantity'));
check('guia de baixa possui impressão própria', transferPrint.includes('GUIA DE BAIXA DE FERRAMENTAS'));
check('versão 86 exibida no cockpit', cockpit.includes('StockFlow • Versão 86'));

console.log(`Atualização 86: ${checks.filter((item) => item.ok).length}/${checks.length} verificações aprovadas.`);
for (const item of checks) console.log(`  ${item.ok ? 'OK' : 'ERRO'} - ${item.name}`);
