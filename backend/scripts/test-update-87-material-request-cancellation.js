const fs = require('fs');
const path = require('path');

const root = path.resolve(__dirname, '..', '..');
const read = (relative) => fs.readFileSync(path.join(root, relative), 'utf8');
const checks = [];
function check(name, condition) {
  checks.push({ name, ok: Boolean(condition) });
  if (!condition) throw new Error(`Falhou: ${name}`);
}

const controller = read('backend/app/controllers/materialRequestController.js');
const routes = read('backend/app/routes/materialRequestRoutes.js');
const transferController = read('backend/app/controllers/transferController.js');
const page = read('frontend/src/pages/MaterialRequests.jsx');
const cockpit = read('frontend/src/pages/OperationsCockpit.jsx');

const cancelStart = controller.indexOf('exports.cancel =');
const cancelEnd = controller.indexOf('async function deliverStockRecharge', cancelStart);
const cancelBlock = controller.slice(cancelStart, cancelEnd);

check('rota de cancelamento registrada', routes.includes("router.post('/:id/cancel', controller.cancel)"));
check('cancelamento limitado a solicitações ativas', cancelBlock.includes("['pendente_aprovacao', 'aprovado'].includes(request.status)"));
check('pedido com guia não pode ser cancelado', cancelBlock.includes('request.transferId') && cancelBlock.includes('não pode ser cancelada por este fluxo'));
check('motivos padronizados incluem técnico desistiu', controller.includes("technician_withdrew: 'Técnico desistiu do pedido'"));
check('motivos padronizados incluem entrega anterior', controller.includes("delivered_in_previous_request: 'Pedido entregue anteriormente em outro pedido'"));
check('outro motivo exige descrição', cancelBlock.includes("reasonCode === 'other' && !notes"));
check('cancelamento usa transação', cancelBlock.includes('sequelize.transaction(async (transaction)'));
check('cancelamento trava a solicitação no banco', cancelBlock.includes('lock: transaction.LOCK.UPDATE'));
check('status e horário de cancelamento são gravados', cancelBlock.includes("lockedRequest.status = 'cancelado'") && cancelBlock.includes('lockedRequest.cancelledAt = cancelledAt'));
check('motivo e autor ficam no metadata histórico', cancelBlock.includes('reasonLabel') && cancelBlock.includes('cancelledByName') && cancelBlock.includes('cancelledByRole'));
check('workflow de aprovação é encerrado', cancelBlock.includes("status: 'cancelado'") && cancelBlock.includes("entityType: 'material_request'"));
check('auditoria formal é gravada', cancelBlock.includes("action: 'material_request_cancelled'") && cancelBlock.includes("entity: 'MaterialRequest'"));
check('cancelamento não movimenta saldo', !cancelBlock.includes('adjustBalance(') && !cancelBlock.includes('StockMovement.create'));
check('técnico é avisado quando operação cancela pedido', cancelBlock.includes("role: 'tecnico'") && cancelBlock.includes('technicianId: request.technicianId'));
check('estoque é avisado quando técnico cancela pedido', cancelBlock.includes("role: 'estoquista'"));
check('entrega vinculada revalida status sob lock', transferController.includes('lockedLinkedRequest') && transferController.includes('lock: transaction.LOCK.UPDATE'));
check('frontend possui opção cancelar pedido', page.includes('Cancelar pedido') && page.includes('/cancel'));
check('frontend exige motivo do cancelamento', page.includes('Motivo do cancelamento') && page.includes('MATERIAL_REQUEST_CANCELLATION_OPTIONS'));
check('frontend mostra histórico da solicitação', page.includes('Histórico da solicitação') && page.includes('requestHistory(details)'));
check('frontend mostra dados do cancelamento nos detalhes', page.includes('Cancelado em') && page.includes('Cancelado por') && page.includes('Observação do cancelamento'));
check('resumo contabiliza canceladas', controller.includes('cancelled, total') && page.includes('label="Canceladas"'));
check('versão 87 exibida no cockpit', cockpit.includes('StockFlow • Versão 87'));

console.log(`Atualização 87: ${checks.filter((item) => item.ok).length}/${checks.length} verificações aprovadas.`);
for (const item of checks) console.log(`  ${item.ok ? 'OK' : 'ERRO'} - ${item.name}`);
