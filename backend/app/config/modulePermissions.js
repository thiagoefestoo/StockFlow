const MODULES = [
  { key: 'operationsCockpit', label: 'Cockpit operacional', group: 'Comando', roles: ['admin', 'supervisor', 'estoquista'], routes: ['/', '/dashboard'] },
  { key: 'approvals', label: 'Aprovações', group: 'Comando', roles: ['admin', 'supervisor', 'estoquista'], routes: ['/aprovacoes'] },
  { key: 'materialRequests', label: 'Solicitações de material', group: 'Operação', roles: ['admin', 'supervisor', 'estoquista', 'tecnico'], routes: ['/solicitacoes-material'] },
  { key: 'warehouses', label: 'Estoques regionais', group: 'Operação', roles: ['admin', 'supervisor', 'estoquista'], routes: ['/estoques-regionais'] },
  { key: 'receiving', label: 'Entrada de material', group: 'Operação', roles: ['admin', 'supervisor', 'estoquista'], routes: ['/entrada'] },
  { key: 'transfers', label: 'Transferências e guias', group: 'Operação', roles: ['admin', 'supervisor', 'estoquista'], routes: ['/transferencias'] },
  { key: 'technicianLosses', label: 'Perdas/descontos', group: 'Operação', roles: ['admin', 'supervisor', 'estoquista'], routes: ['/perdas-tecnico'] },
  { key: 'serviceOrders', label: 'Ordens de serviço', group: 'Operação', roles: ['admin', 'supervisor', 'estoquista', 'tecnico'], routes: ['/os'] },
  { key: 'technicianInbox', label: 'Caixa do técnico', group: 'Operação', roles: ['admin', 'supervisor', 'estoquista', 'tecnico'], routes: ['/caixa-tecnico', '/portal-tecnico'] },
  { key: 'technicianBoxControl', label: 'Central da caixa do técnico', group: 'Operação', roles: ['admin', 'supervisor', 'estoquista'], routes: ['/central-caixa-tecnico'] },
  { key: 'technicianReturns', label: 'Retorno caixa para estoque', group: 'Operação', roles: ['admin', 'supervisor', 'estoquista'], routes: ['/retorno-caixa-estoque'] },
  { key: 'stock', label: 'Materiais/Estoque', group: 'Cadastros e estoque', roles: ['admin', 'supervisor', 'estoquista'], routes: ['/estoque'] },
  { key: 'patrimony', label: 'Patrimônio', group: 'Cadastros e estoque', roles: ['admin', 'supervisor', 'estoquista'], routes: ['/patrimonio'] },
  { key: 'serialLife', label: 'Vida do serial', group: 'Cadastros e estoque', roles: ['admin', 'supervisor', 'estoquista', 'tecnico'], routes: ['/vida-serial'] },
  { key: 'technicians', label: 'Técnicos', group: 'Cadastros e estoque', roles: ['admin', 'supervisor', 'estoquista'], routes: ['/tecnicos'] },
  { key: 'users', label: 'Usuários e permissões', group: 'Administração', roles: ['admin'], routes: ['/usuarios'] },
  { key: 'biExecutive', label: 'BI Executivo/Operacional', group: 'BI e auditoria', roles: ['admin', 'supervisor', 'estoquista'], routes: ['/bi/executivo'] },
  { key: 'biFinancial', label: 'BI Financeiro', group: 'BI e auditoria', roles: ['admin', 'supervisor', 'estoquista'], routes: ['/bi/financeiro'] },
  { key: 'biTechnicians', label: 'BI Técnicos', group: 'BI e auditoria', roles: ['admin', 'supervisor', 'estoquista'], routes: ['/bi/tecnicos'] },
  { key: 'biAudit', label: 'BI Auditoria e patrimônio', group: 'BI e auditoria', roles: ['admin', 'supervisor', 'estoquista'], routes: ['/bi/auditoria'] },
  { key: 'lossEvaluation', label: 'Avaliação de perdas', group: 'BI e auditoria', roles: ['admin', 'supervisor', 'estoquista'], routes: ['/avaliacao-perdas'] },
  { key: 'movementHistory', label: 'Histórico de movimentações', group: 'BI e auditoria', roles: ['admin', 'supervisor', 'estoquista'], routes: ['/historico-movimentacoes'] },
  { key: 'audit', label: 'Auditoria completa', group: 'BI e auditoria', roles: ['admin', 'supervisor', 'estoquista'], routes: ['/auditoria'] },
];

const ALL_MODULE_KEYS = MODULES.map((module) => module.key);
const ADMIN_ONLY_MODULE_KEYS = ['users'];
const ASSIGNABLE_MODULE_KEYS = ALL_MODULE_KEYS.filter((key) => !ADMIN_ONLY_MODULE_KEYS.includes(key));

const DEFAULT_MODULES_BY_ROLE = {
  admin: ALL_MODULE_KEYS,
  supervisor: ALL_MODULE_KEYS.filter((key) => key !== 'users'),
  estoquista: [
    'operationsCockpit',
    'approvals',
    'materialRequests',
    'warehouses',
    'receiving',
    'transfers',
    'technicianLosses',
    'serviceOrders',
    'technicianInbox',
    'technicianBoxControl',
    'stock',
    'patrimony',
    'serialLife',
    'technicians',
    'biExecutive',
    'biTechnicians',
    'movementHistory',
    'lossEvaluation',
  ],
  tecnico: ['materialRequests', 'serviceOrders', 'technicianInbox', 'serialLife'],
};

function assignableForRole(role) {
  if (role === 'admin') return ALL_MODULE_KEYS;
  return ASSIGNABLE_MODULE_KEYS;
}

// Compatibilidade: agora o admin pode liberar qualquer módulo operacional/BI
// para qualquer perfil. Mantemos 'users' reservado ao administrador.
function allowedForRole(role) {
  return assignableForRole(role);
}

function normalizeModulePermissions(value, role = 'tecnico') {
  const allowed = new Set(assignableForRole(role));
  if (role === 'admin') return ALL_MODULE_KEYS;

  if (Array.isArray(value)) {
    const selected = value.map(String).filter((key) => allowed.has(key));
    return Array.from(new Set(selected));
  }

  if (value && typeof value === 'object') {
    const selected = Object.entries(value)
      .filter(([, enabled]) => !!enabled)
      .map(([key]) => key)
      .filter((key) => allowed.has(key));
    return Array.from(new Set(selected));
  }

  return (DEFAULT_MODULES_BY_ROLE[role] || []).filter((key) => allowed.has(key));
}

function hasModuleAccess(user, moduleKey) {
  if (!moduleKey) return true;
  if (!user) return false;
  if (user.role === 'admin') return true;
  const allowed = normalizeModulePermissions(user.modulePermissions, user.role);
  return allowed.includes(moduleKey);
}

module.exports = {
  MODULES,
  ALL_MODULE_KEYS,
  ADMIN_ONLY_MODULE_KEYS,
  ASSIGNABLE_MODULE_KEYS,
  DEFAULT_MODULES_BY_ROLE,
  assignableForRole,
  allowedForRole,
  normalizeModulePermissions,
  hasModuleAccess,
};
