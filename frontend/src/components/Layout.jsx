import { useMemo, useState } from 'react';
import { NavLink, Outlet, useLocation } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';
import NotificationBell from './NotificationBell';
import LivePulse from './LivePulse';
import SuperInfraLogo from './SuperInfraLogo';

const adminGroups = [
  { title: 'Comando', links: [['/', 'OP', 'Cockpit'], ['/aprovacoes', 'AP', 'Aprovações'], ['/dashboard', 'DB', 'Dashboard legado']] },
  { title: 'Operação', links: [['/solicitacoes-material', 'SM', 'Solicitações'], ['/estoques-regionais', 'ER', 'Estoques regionais'], ['/entrada', 'EN', 'Entrada quinzenal'], ['/transferencias', 'TR', 'Transferências'], ['/os', 'OS', 'Ordens de serviço'], ['/caixa-tecnico', 'CT', 'Caixa do técnico'], ['/central-caixa-tecnico', 'CC', 'Central da caixa']] },
  { title: 'Cadastros e estoque', links: [['/estoque', 'MT', 'Materiais/Estoque'], ['/patrimonio', 'PA', 'Patrimônio'], ['/vida-serial', 'VS', 'Vida do serial'], ['/tecnicos', 'TE', 'Técnicos']] },
  { title: 'Administração', adminOnly: true, links: [['/usuarios', 'US', 'Usuários e permissões']] },
  { title: 'Minha conta', links: [['/minha-conta', 'CO', 'Configurações da conta']] },
  { title: 'BI e auditoria', links: [['/bi/executivo', 'BE', 'BI Executivo'], ['/bi/financeiro', 'BF', 'BI Financeiro'], ['/bi/tecnicos', 'BT', 'BI Técnicos'], ['/bi/auditoria', 'BA', 'BI Auditoria'], ['/historico-movimentacoes', 'HM', 'Histórico'], ['/auditoria', 'AU', 'Auditoria']] },
];
const technicianGroups = [
  { title: 'Minha operação', links: [['/caixa-tecnico', 'CX', 'Minha caixa'], ['/vida-serial', 'VS', 'Vida do serial'], ['/minha-conta', 'CO', 'Minha conta']] },
];

export default function Layout() {
  const { user, logout, isSupervisor, isAdmin } = useAuth();
  const location = useLocation();
  const groups = isSupervisor ? adminGroups.filter((group) => !group.adminOnly || isAdmin) : technicianGroups;
  const defaultOpen = useMemo(() => Object.fromEntries(groups.map((g, i) => [g.title, i < 2])), [isSupervisor]);
  const [openGroups, setOpenGroups] = useState(defaultOpen);
  function toggle(title) { setOpenGroups((current) => ({ ...current, [title]: !current[title] })); }

  return (
    <div className="shell erp-shell superinfra-shell">
      <aside className="sidebar erp-sidebar">
        <div className="brand superinfra-brand"><SuperInfraLogo /></div>
        <nav className="accordion-menu">
          {groups.map((group) => {
            const isOpen = openGroups[group.title] ?? true;
            return (
              <div className={`menu-group ${isOpen ? 'open' : 'closed'}`} key={group.title}>
                <button type="button" className="menu-group-toggle" onClick={() => toggle(group.title)}>
                  <span>{group.title}</span><b>{isOpen ? '−' : '+'}</b>
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
            <SuperInfraLogo compact />
            <div>
              <small>Super Infra Business Suite</small>
              <h1>{titleFor(location.pathname)}</h1>
            </div>
          </div>
          <div className="top-actions">
            <NotificationBell />
            <div className="system-status"><i /> Online</div>
            <NavLink to="/minha-conta" className="account-chip">{user?.name?.split(' ')?.[0] || 'Conta'}</NavLink>
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
  if (path.includes('/aprovacoes')) return 'Central de aprovações';
  if (path.includes('/solicitacoes-material')) return 'Workflow de solicitações';
  if (path.includes('/central-caixa-tecnico')) return 'Central administrativa da caixa do técnico';
  if (path.includes('/caixa-tecnico')) return 'Caixa do técnico';
  if (path.includes('/historico-movimentacoes')) return 'Histórico de movimentações';
  if (path.includes('/estoques-regionais')) return 'Estoques regionais';
  if (path.includes('/vida-serial')) return 'Vida útil do serial';
  if (path.includes('/entrada')) return 'Entrada quinzenal de material';
  if (path.includes('/transferencias')) return 'Transferências e guias de assinatura';
  if (path.includes('/portal-tecnico')) return 'Portal mobile do técnico';
  if (path.includes('/bi/financeiro')) return 'BI financeiro';
  if (path.includes('/bi/tecnicos')) return 'BI por técnico';
  if (path.includes('/bi/auditoria')) return 'BI de auditoria e patrimônio';
  if (path.includes('/bi')) return 'BI gerencial';
  if (path.includes('/patrimonio')) return 'Patrimônio serializado';
  if (path.includes('/tecnicos')) return 'Técnicos e terceirizadas';
  if (path.includes('/os')) return 'Ordens de serviço';
  if (path.includes('/usuarios')) return 'Usuários e permissões';
  if (path.includes('/minha-conta')) return 'Minha conta';
  if (path.includes('/auditoria')) return 'Auditoria completa';
  if (path.includes('/estoque')) return 'Estoque geral';
  if (path.includes('/dashboard')) return 'Dashboard legado';
  return 'Cockpit operacional';
}
