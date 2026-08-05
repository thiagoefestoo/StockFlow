const assert = require('assert');
const fs = require('fs');
const path = require('path');
const { notificationMatchesResolvedScope } = require('../app/services/notificationScopeMatcher');

const supervisor = { id: 10, role: 'supervisor', technicianId: null };
const saoPedroScope = {
  unrestricted: false,
  warehouseIds: [2],
  technicianIds: [20, 21],
  cities: ['São Pedro da Aldeia'],
  cityKeys: new Set(['sao pedro da aldeia']),
};
const base = { userId: null, role: 'supervisor' };

assert.strictEqual(
  notificationMatchesResolvedScope(base, supervisor, saoPedroScope, { warehouseIds: [3], technicianIds: [], cities: [] }),
  false,
  'Alarme de outro estoque não pode aparecer.'
);
assert.strictEqual(
  notificationMatchesResolvedScope(base, supervisor, saoPedroScope, { warehouseIds: [2], technicianIds: [], cities: [] }),
  true,
  'Alarme do estoque autorizado precisa aparecer.'
);
assert.strictEqual(
  notificationMatchesResolvedScope(base, supervisor, saoPedroScope, { warehouseIds: [], technicianIds: [99], cities: [] }),
  false,
  'Alarme de técnico de outra cidade não pode aparecer.'
);
assert.strictEqual(
  notificationMatchesResolvedScope(base, supervisor, saoPedroScope, { warehouseIds: [], technicianIds: [20], cities: [] }),
  true,
  'Alarme de técnico autorizado precisa aparecer.'
);
assert.strictEqual(
  notificationMatchesResolvedScope(base, supervisor, saoPedroScope, { warehouseIds: [], technicianIds: [], cities: ['vila velha'] }),
  false,
  'Alarme com cidade diferente precisa ser ocultado.'
);
assert.strictEqual(
  notificationMatchesResolvedScope(base, supervisor, saoPedroScope, { warehouseIds: [], technicianIds: [], cities: ['sao pedro da aldeia'] }),
  true,
  'Alarme da cidade autorizada precisa aparecer.'
);
assert.strictEqual(
  notificationMatchesResolvedScope(base, supervisor, saoPedroScope, { warehouseIds: [], technicianIds: [], cities: [] }),
  true,
  'Dicas gerais sem vínculo operacional continuam visíveis.'
);
assert.strictEqual(
  notificationMatchesResolvedScope({ userId: 10, role: 'todos' }, supervisor, saoPedroScope, { warehouseIds: [3], technicianIds: [], cities: [] }),
  true,
  'Notificação individual do próprio usuário permanece visível.'
);
assert.strictEqual(
  notificationMatchesResolvedScope(base, { id: 1, role: 'admin' }, { unrestricted: true }, { warehouseIds: [3], technicianIds: [], cities: [] }),
  true,
  'Administrador mantém visão global.'
);

const root = path.resolve(__dirname, '..');
const operationsSource = fs.readFileSync(path.join(root, 'app/controllers/operationsController.js'), 'utf8');
const notificationSource = fs.readFileSync(path.join(root, 'app/controllers/notificationController.js'), 'utf8');
const intelligenceSource = fs.readFileSync(path.join(root, 'app/services/intelligenceService.js'), 'utf8');
const livePulseSource = fs.readFileSync(path.join(root, '../frontend/src/components/LivePulse.jsx'), 'utf8');

assert.ok(operationsSource.includes('countTechniciansMissingToolTerm(scope)'), 'Pendência documental de técnicos precisa receber o escopo.');
assert.ok(operationsSource.includes('resolveOperationalScope(user)'), 'Menu de pendências precisa resolver o escopo da conta.');
assert.ok(operationsSource.includes('countVisibleUnreadNotifications(user)'), 'Contagem de notificações precisa respeitar o escopo.');
assert.ok(operationsSource.includes('serviceOrderScopeWhere(scope)'), 'Alarmes de OS precisam respeitar a cidade.');
assert.ok(notificationSource.includes('findVisibleNotifications(req.user'), 'Sino precisa usar notificações filtradas.');
assert.ok(notificationSource.includes('filterNotificationsForUser([notification], req.user)'), 'Leitura de notificação precisa validar o acesso.');
assert.ok(intelligenceSource.includes('warehouseId: request.warehouseId'), 'Novas notificações de solicitações precisam carregar o estoque.');
assert.ok(intelligenceSource.includes('warehouseId: transfer.warehouseId'), 'Novas notificações de transferências precisam carregar o estoque.');

[
  'Mantenha um calendário de inventário rotativo',
  'A entrada de saldo exige dupla conferência',
  'Conte os itens junto com o técnico',
  'Leia o serial antes de cada movimentação',
  'Concilie a caixa do técnico regularmente',
  'Devolução também precisa de conferência',
].forEach((tip) => assert.ok(livePulseSource.includes(tip), `Dica ausente: ${tip}`));
assert.ok(livePulseSource.includes(']).slice(0, 28);'), 'A rotação precisa comportar as novas dicas.');

console.log('✅ Alarmes por cidade/estoque/técnico e novas dicas de inventário validados.');
