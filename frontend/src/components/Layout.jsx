import { useMemo, useState } from 'react';
import { NavLink, Outlet, useLocation } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';
import NotificationBell from './NotificationBell';
import LivePulse from './LivePulse';
import StockFlowLogo from './StockFlowLogo';

const adminGroups = [
  { title: 'Comando', emoji: '🏠', links: [['/', '🎛️', 'Cockpit'], ['/aprovacoes', '✅', 'Aprovações'], ['/dashboard', '📌', 'Dashboard legado']] },
  { title: 'Operação', emoji: '🚚', links: [['/solicitacoes-material', '📋', 'Solicitações'], ['/entrada', '📥', 'Entrada quinzenal'], ['/transferencias', '🔁', 'Transferências'], ['/os', '📲', 'Ordens de serviço'], ['/caixa-tecnico', '🧰', 'Caixa do técnico'], ['/central-caixa-tecnico', '🧑‍💼', 'Central da caixa']] },
  { title: 'Cadastros e estoque', emoji: '📦', links: [['/estoque', '📦', 'Materiais/Estoque'], ['/patrimonio', '🏷️', 'Patrimônio'], ['/tecnicos', '👷', 'Técnicos']] },
  { title: 'Administração', emoji: '🔐', adminOnly: true, links: [['/usuarios', '👥', 'Usuários e permissões']] },
  { title: 'Minha conta', emoji: '👤', links: [['/minha-conta', '⚙️', 'Configurações da conta']] },
  { title: 'BI e auditoria', emoji: '📊', links: [['/bi/executivo', '📈', 'BI Executivo'], ['/bi/financeiro', '💰', 'BI Financeiro'], ['/bi/tecnicos', '🧑‍🔧', 'BI Técnicos'], ['/bi/auditoria', '🛡️', 'BI Auditoria'], ['/historico-movimentacoes', '🧾', 'Histórico'], ['/auditoria', '🔎', 'Auditoria']] },
];
const technicianGroups = [
  { title: 'Minha operação', emoji: '📲', links: [['/caixa-tecnico', '🧰', 'Minha caixa'], ['/minha-conta', '⚙️', 'Minha conta']] },
];

export default function Layout() {
  const { user, logout, isSupervisor, isAdmin } = useAuth();
  const location = useLocation();
  const groups = isSupervisor ? adminGroups.filter((group) => !group.adminOnly || isAdmin) : technicianGroups;
  const defaultOpen = useMemo(() => Object.fromEntries(groups.map((g, i) => [g.title, i < 2])), [isSupervisor]);
  const [openGroups, setOpenGroups] = useState(defaultOpen);
  function toggle(title) { setOpenGroups((current) => ({ ...current, [title]: !current[title] })); }

  return (
    <div className="shell erp-shell stockflow-shell">
      <aside className="sidebar erp-sidebar">
        <div className="brand"><StockFlowLogo /><div><strong>StockFlow</strong><small>ERP vivo de estoque telecom</small></div></div>
        <nav className="accordion-menu">
          {groups.map((group) => {
            const isOpen = openGroups[group.title] ?? true;
            return (
              <div className={`menu-group ${isOpen ? 'open' : 'closed'}`} key={group.title}>
                <button type="button" className="menu-group-toggle" onClick={() => toggle(group.title)}>
                  <span>{group.emoji} {group.title}</span><b>{isOpen ? '−' : '+'}</b>
                </button>
                {isOpen && group.links.map(([to, icon, label]) => (
                  <NavLink key={to} to={to} end={to === '/'} className={({ isActive }) => (isActive ? 'active' : '')}>
                    <b>{icon}</b><span>{label}</span>
                  </NavLink>
                ))}
              </div>
            );
          })}
        </nav>
        <NavLink to="/minha-conta" className="sidebar-user account-user-link">
          <div className="avatar">{String(user?.name || 'U').charAt(0).toUpperCase()}</div>
          <div><small>Logado como</small><strong>{user?.name}</strong><span>{user?.role}</span></div>
        </NavLink>
      </aside>
      <main className="main">
        <header className="topbar erp-topbar">
          <div className="topbar-title-wrap">
            <StockFlowLogo compact />
            <div>
              <small>StockFlow Business Suite</small>
              <h1>{titleFor(location.pathname)}</h1>
            </div>
          </div>
          <div className="top-actions">
            <NotificationBell />
            <div className="system-status"><i /> Online</div>
            <NavLink to="/minha-conta" className="account-chip">👤 {user?.name?.split(' ')?.[0] || 'Conta'}</NavLink>
            <button className="ghost" onClick={logout}>Sair</button>
          </div>
        </header>
        <LivePulse />
        <Outlet />
      </main>
    </div>
  );
}

function titleFor(path) {
  if (path.includes('/aprovacoes')) return '✅ Central de aprovações';
  if (path.includes('/solicitacoes-material')) return '📋 Workflow de solicitações';
  if (path.includes('/central-caixa-tecnico')) return '🧑‍💼 Central administrativa da caixa do técnico';
  if (path.includes('/caixa-tecnico')) return '🧰 Caixa do técnico';
  if (path.includes('/historico-movimentacoes')) return '🧾 Histórico de movimentações';
  if (path.includes('/entrada')) return '📥 Entrada quinzenal de material';
  if (path.includes('/transferencias')) return '🔁 Transferências e guias de assinatura';
  if (path.includes('/portal-tecnico')) return '📲 Portal mobile do técnico';
  if (path.includes('/bi/financeiro')) return '💰 BI financeiro';
  if (path.includes('/bi/tecnicos')) return '🧑‍🔧 BI por técnico';
  if (path.includes('/bi/auditoria')) return '🛡️ BI de auditoria e patrimônio';
  if (path.includes('/bi')) return '📊 BI gerencial';
  if (path.includes('/patrimonio')) return '🏷️ Patrimônio serializado';
  if (path.includes('/tecnicos')) return '👷 Técnicos e terceirizadas';
  if (path.includes('/os')) return '📲 Ordens de serviço';
  if (path.includes('/usuarios')) return '🔐 Usuários e permissões';
  if (path.includes('/minha-conta')) return '👤 Minha conta';
  if (path.includes('/auditoria')) return '🔎 Auditoria completa';
  if (path.includes('/estoque')) return '📦 Estoque geral';
  if (path.includes('/dashboard')) return '📌 Dashboard legado';
  return '🎛️ Cockpit operacional';
}
