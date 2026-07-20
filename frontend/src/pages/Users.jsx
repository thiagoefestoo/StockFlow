import { useEffect, useMemo, useState } from 'react';
import api from '../services/api';
import Modal from '../components/Modal';
import DetailsModal, { DetailGrid, DetailList } from '../components/DetailsModal';
import KpiCard from '../components/KpiCard';
import { useAuth } from '../contexts/AuthContext';
import { MODULES, assignableModulesForRole, moduleLabel, normalizeModulePermissions } from '../config/modulePermissions';

const emptyUser = {
  name: '',
  email: '',
  password: '',
  role: 'tecnico',
  status: 'ativo',
  phone: '',
  jobTitle: '',
  companyName: '',
  notes: '',
  mustChangePassword: false,
  warehouseIds: [],
  cityAccessText: '',
  approvalLimit: 0,
  modulePermissions: normalizeModulePermissions(null, 'tecnico'),
};


const JOB_OPTIONS = {
  admin: ['Administrador', 'Gestor de operações', 'Coordenador administrativo'],
  supervisor: ['Supervisor de estoque', 'Supervisor operacional', 'Coordenador de campo'],
  estoquista: ['Estoquista', 'Almoxarife', 'Responsável de estoque regional'],
  tecnico: ['Técnico', 'Técnico de campo', 'Instalador', 'Técnico de manutenção'],
};

function dt(value) { return value ? new Date(value).toLocaleString('pt-BR') : '-'; }
function roleLabel(role) { return ({ admin: 'Administrador', supervisor: 'Supervisor', estoquista: 'Estoquista', tecnico: 'Técnico' }[role] || role); }
function statusLabel(user) {
  const value = user?.accessStatus || user?.status;
  return ({ ativo: 'Ativo', inativo: 'Inativo', bloqueado: 'Bloqueado', excluido: 'Excluído' }[value] || value || '-');
}
function statusTone(user) {
  const value = user?.accessStatus || user?.status;
  if (value === 'ativo') return 'ativo';
  if (value === 'bloqueado') return 'bloqueado';
  if (value === 'excluido') return 'excluido';
  return 'inativo';
}
function csvCell(value) { return `"${String(value ?? '').replace(/"/g, '""')}"`; }
function exportUsers(users) {
  const rows = [
    ['Nome', 'Email', 'Perfil', 'Status', 'Telefone', 'Cargo', 'Último login', 'Criado em'],
    ...users.map((u) => [u.name, u.email, roleLabel(u.role), statusLabel(u), u.phone || '', u.jobTitle || '', dt(u.lastLoginAt), dt(u.createdAt)]),
  ];
  const blob = new Blob([rows.map((r) => r.map(csvCell).join(';')).join('\n')], { type: 'text/csv;charset=utf-8;' });
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = `superinfra-usuarios-${new Date().toISOString().slice(0, 10)}.csv`;
  a.click();
}
function randomPassword() {
  const part = Math.random().toString(36).slice(2, 6).toUpperCase();
  const tail = Math.random().toString(36).slice(2, 8);
  return `Stock@${part}${tail}`;
}


function modulesForRole(role) {
  const allowed = new Set(assignableModulesForRole(role));
  return MODULES.filter((module) => allowed.has(module.key));
}
function modulesByGroupForRole(role) {
  return modulesForRole(role).reduce((groups, module) => {
    if (!groups[module.group]) groups[module.group] = [];
    groups[module.group].push(module);
    return groups;
  }, {});
}
function permissionSummary(keys) {
  const selected = Array.isArray(keys) ? keys : [];
  return selected.length ? `${selected.length} módulo(s) liberado(s)` : 'Nenhum módulo liberado';
}

export default function Users() {
  const { user: loggedUser, isAdmin } = useAuth();
  const [users, setUsers] = useState([]);
  const [stats, setStats] = useState({});
  const [warehouses, setWarehouses] = useState([]);
  const [filters, setFilters] = useState({ q: '', role: '', status: '', includeDeleted: 'true' });
  const [form, setForm] = useState(emptyUser);
  const [modal, setModal] = useState(false);
  const [passwordModal, setPasswordModal] = useState({ open: false, user: null, password: '', mustChangePassword: false });
  const [statusModal, setStatusModal] = useState({ open: false, user: null, action: '', reason: '' });
  const [details, setDetails] = useState({ open: false, loading: false, data: null });
  const [message, setMessage] = useState('');

  const filteredUsers = useMemo(() => users, [users]);
  const cityOptions = useMemo(() => {
    const values = new Set();
    warehouses.forEach((w) => { if (w.city) values.add(String(w.city).trim()); });
    users.forEach((u) => (u.cityAccess || []).forEach((city) => { if (city) values.add(String(city).trim()); }));
    String(form.cityAccessText || '').split(',').map((x) => x.trim()).filter(Boolean).forEach((city) => values.add(city));
    return Array.from(values).sort((a, b) => a.localeCompare(b, 'pt-BR'));
  }, [warehouses, users, form.cityAccessText]);

  async function load() {
    const params = new URLSearchParams(filters).toString();
    const [u, w] = await Promise.all([api.get(`/users?${params}`), api.get('/warehouses').catch(() => ({ data: { data: [] } }))]);
    setUsers(u.data.data.users || []);
    setStats(u.data.data.stats || {});
    setWarehouses(w.data.data || []);
  }

  useEffect(() => { load(); }, []); // eslint-disable-line react-hooks/exhaustive-deps

  function openCreate(role = 'tecnico') {
    setForm({ ...emptyUser, role, password: role === 'tecnico' ? 'tec123456' : '', modulePermissions: normalizeModulePermissions(null, role) });
    setModal(true);
  }
  function openEdit(user) {
    setForm({ ...emptyUser, ...user, password: '', mustChangePassword: !!user.mustChangePassword, warehouseIds: user.warehouseIds || [], cityAccessText: (user.cityAccess || []).join(', '), approvalLimit: user.approvalLimit || 0, companyName: user.companyName || user.Technician?.ContractorCompany?.name || '', modulePermissions: normalizeModulePermissions(user.modulePermissions, user.role) });
    setModal(true);
  }
  function patchForm(patch) {
    const next = { ...form, ...patch };
    if (patch.role) {
      next.modulePermissions = normalizeModulePermissions(null, patch.role);
      if (patch.role !== 'tecnico') next.technicianId = '';
    }
    setForm(next);
  }
  function selectedCitiesFromForm() {
    return String(form.cityAccessText || '').split(',').map((x) => x.trim()).filter(Boolean);
  }
  function toggleCityAccess(city) {
    const selected = new Set(selectedCitiesFromForm());
    if (selected.has(city)) selected.delete(city);
    else selected.add(city);
    patchForm({ cityAccessText: Array.from(selected).join(', ') });
  }
  function selectedWarehouseIds() {
    return (form.warehouseIds || []).map((id) => Number(id)).filter(Boolean);
  }
  function toggleWarehouseAccess(warehouse) {
    const selected = new Set(selectedWarehouseIds());
    const id = Number(warehouse.id);
    if (selected.has(id)) selected.delete(id);
    else selected.add(id);

    const selectedCities = new Set(selectedCitiesFromForm());
    if (!selected.has(id) && warehouse.city) {
      const stillUsed = warehouses.some((w) => selected.has(Number(w.id)) && w.city === warehouse.city);
      if (!stillUsed) selectedCities.delete(warehouse.city);
    }
    if (selected.has(id) && warehouse.city) selectedCities.add(warehouse.city);

    patchForm({ warehouseIds: Array.from(selected), cityAccessText: Array.from(selectedCities).join(', ') });
  }
  function toggleModulePermission(moduleKey) {
    if (form.role === 'admin') return;
    const selected = new Set(normalizeModulePermissions(form.modulePermissions, form.role));
    if (selected.has(moduleKey)) selected.delete(moduleKey);
    else selected.add(moduleKey);
    patchForm({ modulePermissions: normalizeModulePermissions(Array.from(selected), form.role) });
  }
  async function saveUser() {
    try {
      setMessage('');
      if (form.password && String(form.password).length < 6) {
        setMessage('A senha precisa ter pelo menos 6 caracteres.');
        return;
      }
      const payload = { ...form, warehouseIds: form.warehouseIds || [], cityAccess: String(form.cityAccessText || '').split(',').map((x) => x.trim()).filter(Boolean), approvalLimit: Number(form.approvalLimit || 0), modulePermissions: normalizeModulePermissions(form.modulePermissions, form.role) };
      delete payload.technicianId;
      if (form.id) {
        if (!payload.password) delete payload.password;
        await api.put(`/users/${form.id}`, payload);
        setMessage('✅ Usuário atualizado e auditoria registrada.');
      } else {
        await api.post('/users', payload);
        setMessage('✅ Usuário criado com sucesso.');
      }
      setModal(false);
      setForm(emptyUser);
      await load();
    } catch (error) {
      setMessage(error.response?.data?.message || error.message || 'Erro ao salvar usuário.');
    }
  }
  async function openDetails(user) {
    setDetails({ open: true, loading: true, data: null });
    try {
      const { data } = await api.get(`/users/${user.id}`);
      setDetails({ open: true, loading: false, data: data.data });
    } catch (error) {
      setDetails({ open: false, loading: false, data: null });
      setMessage(error.response?.data?.message || 'Erro ao abrir detalhes.');
    }
  }
  async function resetPassword() {
    try {
      if (!passwordModal.password || String(passwordModal.password).length < 6) {
        setMessage('Informe uma nova senha manual com pelo menos 6 caracteres.');
        return;
      }
      await api.patch(`/users/${passwordModal.user.id}/password`, { password: String(passwordModal.password), mustChangePassword: passwordModal.mustChangePassword });
      setMessage(`✅ Senha redefinida para ${passwordModal.user.email}.`);
      setPasswordModal({ open: false, user: null, password: '', mustChangePassword: false });
      await load();
    } catch (error) {
      setMessage(error.response?.data?.message || 'Erro ao redefinir senha.');
    }
  }
  async function runStatusAction() {
    try {
      if (statusModal.action === 'delete') {
        await api.delete(`/users/${statusModal.user.id}`, { data: { reason: statusModal.reason } });
      } else {
        await api.patch(`/users/${statusModal.user.id}/status`, { action: statusModal.action, reason: statusModal.reason });
      }
      setMessage('✅ Status do usuário atualizado.');
      setStatusModal({ open: false, user: null, action: '', reason: '' });
      await load();
    } catch (error) {
      setMessage(error.response?.data?.message || 'Erro ao alterar status.');
    }
  }
  function askStatus(user, action) {
    setStatusModal({ open: true, user, action, reason: '' });
  }

  if (!isAdmin) {
    return <div className="alert danger">Apenas administradores podem acessar o gerenciamento de usuários.</div>;
  }

  return (
    <div className="page-grid users-admin-page erp-page">
      <section className="command-center user-management-hero">
        <div>
          <span className="eyebrow">🔐 Administração de acesso</span>
          <h2>Gerenciamento completo de usuários</h2>
          <p>Crie contas, vincule usuários técnicos, edite perfis, redefina senhas, bloqueie acessos e consulte o histórico de alterações.</p>
        </div>
        <div className="row-actions">
          <button className="ghost" onClick={() => exportUsers(filteredUsers)}>⬇️ Exportar CSV</button>
          <button className="ghost" onClick={load}>🔄 Atualizar</button>
          <button onClick={() => openCreate('tecnico')}>➕ Novo usuário</button>
        </div>
      </section>

      {message && <div className={message.startsWith('✅') ? 'alert success' : 'alert danger'}>{message}</div>}

      <div className="kpi-grid small">
        <KpiCard label="Usuários" value={stats.total || 0} />
        <KpiCard label="Ativos" value={stats.ativos || 0} />
        <KpiCard label="Bloqueados" value={stats.bloqueados || 0} />
        <KpiCard label="Técnicos" value={stats.tecnicos || 0} />
      </div>

      <section className="panel filters user-filters">
        <div className="form-grid">
          <label>Buscar usuário
            <input value={filters.q} onChange={(e) => setFilters({ ...filters, q: e.target.value })} placeholder="nome, e-mail, telefone ou cargo" />
          </label>
          <label>Perfil
            <select value={filters.role} onChange={(e) => setFilters({ ...filters, role: e.target.value })}>
              <option value="">Todos</option>
              <option value="admin">Administrador</option>
              <option value="supervisor">Supervisor</option>
              <option value="estoquista">Estoquista</option>
              <option value="tecnico">Técnico</option>
            </select>
          </label>
          <label>Status
            <select value={filters.status} onChange={(e) => setFilters({ ...filters, status: e.target.value })}>
              <option value="">Todos</option>
              <option value="ativo">Ativo</option>
              <option value="inativo">Inativo</option>
              <option value="bloqueado">Bloqueado</option>
              <option value="excluido">Excluído</option>
            </select>
          </label>
          <label>Excluídos
            <select value={filters.includeDeleted} onChange={(e) => setFilters({ ...filters, includeDeleted: e.target.value })}>
              <option value="true">Mostrar</option>
              <option value="false">Ocultar</option>
            </select>
          </label>
          <div className="filter-action"><button onClick={load}>Aplicar filtros</button></div>
        </div>
      </section>

      <section className="panel">
        <div className="panel-title">
          <div><h3>👥 Contas do sistema</h3><p>Somente administradores visualizam esta página. Contas técnicas criam ou sincronizam automaticamente o cadastro do técnico pelo nome/e-mail.</p></div>
          <div className="row-actions"><button className="ghost" onClick={() => openCreate('admin')}>Criar admin</button><button className="ghost" onClick={() => openCreate('supervisor')}>Criar supervisor</button><button onClick={() => openCreate('tecnico')}>Criar técnico</button></div>
        </div>
        <div className="table-wrap">
          <table>
            <thead><tr><th>Usuário</th><th>Perfil</th><th>Status</th><th>Último login</th><th>Criado em</th><th className="action-cell wide-actions">Opções</th></tr></thead>
            <tbody>
              {users.map((u) => (
                <tr key={u.id} className={u.deletedAt ? 'muted-row' : ''}>
                  <td><button className="link-button" onClick={() => openDetails(u)}>👤 {u.name}</button><small className="block">{u.email}</small></td>
                  <td><span className={`badge role-${u.role}`}>{roleLabel(u.role)}</span></td>
                  <td><span className={`badge ${statusTone(u)}`}>{statusLabel(u)}</span></td>
                  <td>{dt(u.lastLoginAt)}</td>
                  <td>{dt(u.createdAt)}</td>
                  <td>
                    <div className="action-toolbar">
                      <button className="info" onClick={() => openDetails(u)}>🔎 Detalhes</button>
                      {!u.deletedAt && <button className="ghost" onClick={() => openEdit(u)}>✏️ Editar</button>}
                      {!u.deletedAt && <button className="soft" onClick={() => setPasswordModal({ open: true, user: u, password: '', mustChangePassword: true })}>🔑 Senha</button>}
                      {u.accessStatus === 'ativo' && Number(u.id) !== Number(loggedUser?.id) && <button className="danger-outline" onClick={() => askStatus(u, 'block')}>🚫 Bloquear</button>}
                      {u.accessStatus === 'bloqueado' && <button className="success-btn" onClick={() => askStatus(u, 'unblock')}>✅ Desbloquear</button>}
                      {u.accessStatus === 'inativo' && <button className="success-btn" onClick={() => askStatus(u, 'activate')}>✅ Ativar</button>}
                      {!u.deletedAt && Number(u.id) !== Number(loggedUser?.id) && <button className="danger-outline" onClick={() => askStatus(u, 'delete')}>🗑️ Excluir</button>}
                      {u.deletedAt && <button className="success-btn" onClick={() => askStatus(u, 'restore')}>♻️ Restaurar</button>}
                    </div>
                  </td>
                </tr>
              ))}
              {users.length === 0 && <tr><td colSpan="6"><div className="empty-state">Nenhum usuário encontrado.</div></td></tr>}
            </tbody>
          </table>
        </div>
      </section>

      <Modal open={modal} title={form.id ? '✏️ Editar usuário' : '➕ Criar usuário'} onClose={() => setModal(false)} footer={<><button className="ghost" onClick={() => setModal(false)}>Cancelar</button><button onClick={saveUser}>Salvar usuário</button></>}>
        <div className="form-stack">
          <div className="form-grid">
            <label>Nome completo<input value={form.name} onChange={(e) => patchForm({ name: e.target.value })} /></label>
            <label>E-mail de login<input type="email" value={form.email} onChange={(e) => patchForm({ email: e.target.value })} /></label>
            <label>Telefone<input value={form.phone || ''} onChange={(e) => patchForm({ phone: e.target.value })} /></label>
            <label>Cargo/função<select value={form.jobTitle || ''} onChange={(e) => patchForm({ jobTitle: e.target.value })}><option value="">Selecione</option>{(JOB_OPTIONS[form.role] || JOB_OPTIONS.tecnico).map((option) => <option key={option} value={option}>{option}</option>)}</select></label>
            {form.role === 'tecnico' && <label>Nome da empresa<input value={form.companyName || ''} onChange={(e) => patchForm({ companyName: e.target.value })} placeholder="Ex.: Super Infra, terceirizada ou equipe própria" /></label>}
            <label>Perfil
              <select value={form.role} onChange={(e) => patchForm({ role: e.target.value })}>
                <option value="admin">Administrador</option>
                <option value="supervisor">Supervisor</option>
                <option value="estoquista">Estoquista</option>
                <option value="tecnico">Técnico</option>
              </select>
            </label>
            <label>Status
              <select value={form.status} onChange={(e) => patchForm({ status: e.target.value })}>
                <option value="ativo">Ativo</option>
                <option value="inativo">Inativo</option>
              </select>
            </label>
            {['estoquista', 'tecnico', 'supervisor'].includes(form.role) && <div className="form-field full-span">
              <span className="field-label">Estoques autorizados</span>
              <div className="city-checkbox-list warehouse-checkbox-list">
                {warehouses.map((w) => <label className="check-pill" key={w.id}><input type="checkbox" checked={selectedWarehouseIds().includes(Number(w.id))} onChange={() => toggleWarehouseAccess(w)} /><span>{w.name} • {w.city || w.region || w.code}</span></label>)}
                {warehouses.length === 0 && <small>Nenhum estoque regional cadastrado. Crie o estoque antes de vincular ao usuário.</small>}
              </div>
              <small>O usuário verá e movimentará apenas os estoques marcados pelo administrador.</small>
            </div>}
            {['estoquista', 'tecnico', 'supervisor'].includes(form.role) && <div className="form-field full-span">
              <span className="field-label">Cidades autorizadas</span>
              <div className="city-checkbox-list">
                {cityOptions.map((city) => <label className="check-pill" key={city}><input type="checkbox" checked={selectedCitiesFromForm().includes(city)} onChange={() => toggleCityAccess(city)} /><span>{city}</span></label>)}
                {cityOptions.length === 0 && <small>Nenhuma cidade disponível. Cadastre a cidade no estoque regional.</small>}
              </div>
              <small>As cidades vêm dos estoques regionais e podem ser marcadas/desmarcadas pelo administrador.</small>
            </div>}
            {form.role === 'estoquista' && <label>Limite de aprovação do usuário
              <input type="number" value={form.approvalLimit || 0} onChange={(e) => patchForm({ approvalLimit: e.target.value })} />
            </label>}
            <div className="form-field full-span module-permission-panel">
              <div className="module-permission-head">
                <div>
                  <h4>Controle de acesso aos módulos</h4>
                  <p>Todos os módulos ficam disponíveis para seleção. Marque apenas o que este usuário poderá ver e acessar. Administrador mantém acesso total.</p>
                </div>
                <span className="badge soft">{permissionSummary(normalizeModulePermissions(form.modulePermissions, form.role))}</span>
              </div>
              {form.role === 'admin' ? <div className="viz-callout">Administrador possui acesso completo por segurança operacional.</div> : Object.entries(modulesByGroupForRole(form.role)).map(([group, modules]) => (
                <div className="module-permission-group" key={group}>
                  <strong>{group}</strong>
                  <div className="module-permission-grid">
                    {modules.map((module) => {
                      const selected = normalizeModulePermissions(form.modulePermissions, form.role).includes(module.key);
                      return <label className={`module-permission-check ${selected ? 'checked' : ''}`} key={module.key}><input type="checkbox" checked={selected} onChange={() => toggleModulePermission(module.key)} /><span>{module.label}</span></label>;
                    })}
                  </div>
                </div>
              ))}
              <small>Exemplo: libere BI Executivo/Operacional para o estoquista e mantenha BI Financeiro desmarcado. O módulo Usuários e permissões continua reservado ao administrador.</small>
            </div>
            <label>{form.id ? 'Nova senha manual opcional' : 'Senha inicial'}
              <div className="input-with-button"><input type="text" value={form.password || ''} onChange={(e) => patchForm({ password: e.target.value })} placeholder={form.id ? 'Digite uma nova senha ou deixe vazio para manter' : 'Digite uma senha ou gere automaticamente'} /><button type="button" className="ghost" onClick={() => patchForm({ password: randomPassword() })}>Gerar</button></div>
              <small>Ao preencher manualmente e clicar em Salvar usuário, exatamente essa senha será gravada no banco Neon.</small>
            </label>
          </div>
          <label className="form-check"><input className="form-check-input" type="checkbox" checked={!!form.mustChangePassword} onChange={(e) => patchForm({ mustChangePassword: e.target.checked })} /><span className="form-check-label">Solicitar troca de senha no próximo acesso</span></label>
          <label>Observações administrativas<textarea rows="3" value={form.notes || ''} onChange={(e) => patchForm({ notes: e.target.value })} placeholder="Motivo da criação, restrições, observações de auditoria..." /></label>
          {form.role === 'tecnico' && <div className="viz-callout">📱 Ao logar no celular, este usuário técnico será direcionado para a própria caixa. O vínculo técnico é criado automaticamente pelo e-mail/nome do usuário.</div>}
        </div>
      </Modal>

      <Modal open={passwordModal.open} title={`🔑 Redefinir senha: ${passwordModal.user?.name || ''}`} onClose={() => setPasswordModal({ open: false, user: null, password: '', mustChangePassword: false })} footer={<><button className="ghost" onClick={() => setPasswordModal({ open: false, user: null, password: '', mustChangePassword: false })}>Cancelar</button><button onClick={resetPassword}>Salvar nova senha</button></>}>
        <div className="form-stack">
          <label>Nova senha manual<div className="input-with-button"><input type="text" value={passwordModal.password} onChange={(e) => setPasswordModal({ ...passwordModal, password: e.target.value })} placeholder="Digite a senha desejada" /><button type="button" className="ghost" onClick={() => setPasswordModal({ ...passwordModal, password: randomPassword() })}>Gerar senha</button></div><small>A senha digitada manualmente será a senha salva ao clicar em Salvar nova senha.</small></label>
          <label className="form-check"><input className="form-check-input" type="checkbox" checked={passwordModal.mustChangePassword} onChange={(e) => setPasswordModal({ ...passwordModal, mustChangePassword: e.target.checked })} /><span className="form-check-label">Marcar para troca de senha no próximo acesso</span></label>
          <div className="alert warning">Guarde a senha antes de fechar esta janela. Por segurança, ela não ficará visível depois.</div>
        </div>
      </Modal>

      <Modal open={statusModal.open} title="Confirmar alteração de acesso" onClose={() => setStatusModal({ open: false, user: null, action: '', reason: '' })} footer={<><button className="ghost" onClick={() => setStatusModal({ open: false, user: null, action: '', reason: '' })}>Cancelar</button><button className={['block', 'delete', 'deactivate'].includes(statusModal.action) ? 'danger-outline' : ''} onClick={runStatusAction}>Confirmar</button></>}>
        <div className="form-stack">
          <p>Usuário: <strong>{statusModal.user?.name}</strong> — {statusModal.user?.email}</p>
          <label>Motivo/observação<textarea rows="3" value={statusModal.reason} onChange={(e) => setStatusModal({ ...statusModal, reason: e.target.value })} placeholder="Motivo para auditoria" /></label>
          <div className="viz-callout">Toda alteração de status fica registrada na auditoria do sistema.</div>
        </div>
      </Modal>

      <DetailsModal open={details.open} title="🔎 Detalhes do usuário" onClose={() => setDetails({ open: false, loading: false, data: null })} footer={<><button className="ghost" onClick={() => setDetails({ open: false, loading: false, data: null })}>Fechar</button>{details.data?.user && !details.data.user.deletedAt && <button onClick={() => { openEdit(details.data.user); setDetails({ open: false, loading: false, data: null }); }}>✏️ Editar</button>}</>}>
        {details.loading && <div className="empty-state">Carregando...</div>}
        {details.data?.user && <>
          <DetailGrid fields={[
            ['Nome', details.data.user.name], ['E-mail', details.data.user.email], ['Perfil', roleLabel(details.data.user.role)], ['Status', statusLabel(details.data.user)],
            ['Telefone', details.data.user.phone], ['Cargo/função', details.data.user.jobTitle], ['Empresa do técnico', details.data.user.companyName || details.data.user.Technician?.ContractorCompany?.name],
            ['Último login', dt(details.data.user.lastLoginAt)], ['Senha alterada em', dt(details.data.user.passwordChangedAt)], ['Criado em', dt(details.data.user.createdAt)], ['Atualizado em', dt(details.data.user.updatedAt)],
            ['Bloqueado em', dt(details.data.user.blockedAt)], ['Motivo bloqueio', details.data.user.blockedReason], ['Excluído em', dt(details.data.user.deletedAt)], ['Motivo exclusão', details.data.user.deletedReason],
            ['Estoques autorizados', (details.data.user.warehouseIds || []).join(', ') || '-'], ['Cidades autorizadas', (details.data.user.cityAccess || []).length ? `${(details.data.user.cityAccess || []).length} cidade(s)` : '-'], ['Módulos liberados', permissionSummary(normalizeModulePermissions(details.data.user.modulePermissions, details.data.user.role))], ['Limite aprovação', Number(details.data.user.approvalLimit || 0).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })], ['Observações', details.data.user.notes],
          ]} />
          <div className="detail-section"><h4>Cidades autorizadas</h4><div className="city-chip-list">{(details.data.user.cityAccess || []).length ? details.data.user.cityAccess.map((city) => <span className="city-chip" key={city}>{city}</span>) : <span className="muted">Nenhuma cidade definida.</span>}</div></div>
          <div className="detail-section"><h4>Módulos liberados</h4><div className="city-chip-list">{normalizeModulePermissions(details.data.user.modulePermissions, details.data.user.role).map((key) => <span className="city-chip" key={key}>{moduleLabel(key)}</span>)}</div></div>
          <DetailList title="🧾 Histórico de alterações do usuário" items={details.data.audits || []} render={(audit) => <><b>{audit.action} • {dt(audit.createdAt)}</b><span>{audit.message}</span><small>Operador: {audit.actor?.name || 'Sistema'} • IP: {audit.ip || '-'}</small></>} />
        </>}
      </DetailsModal>
    </div>
  );
}
