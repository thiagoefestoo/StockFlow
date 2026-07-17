import { useEffect, useMemo, useState } from 'react';
import api from '../services/api';
import Modal from '../components/Modal';
import DetailsModal, { DetailGrid, DetailList } from '../components/DetailsModal';
import KpiCard from '../components/KpiCard';
import { useAuth } from '../contexts/AuthContext';

const emptyUser = {
  name: '',
  email: '',
  password: '',
  role: 'tecnico',
  status: 'ativo',
  technicianId: '',
  phone: '',
  jobTitle: '',
  notes: '',
  mustChangePassword: false,
  warehouseIds: [],
  cityAccessText: '',
  approvalLimit: 0,
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
    ['Nome', 'Email', 'Perfil', 'Status', 'Técnico vinculado', 'Telefone', 'Cargo', 'Último login', 'Criado em'],
    ...users.map((u) => [u.name, u.email, roleLabel(u.role), statusLabel(u), u.Technician?.name || '', u.phone || '', u.jobTitle || '', dt(u.lastLoginAt), dt(u.createdAt)]),
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

export default function Users() {
  const { user: loggedUser, isAdmin } = useAuth();
  const [users, setUsers] = useState([]);
  const [stats, setStats] = useState({});
  const [technicians, setTechnicians] = useState([]);
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
    technicians.forEach((t) => (t.serviceCities || []).forEach((city) => { if (city) values.add(String(city).trim()); }));
    users.forEach((u) => (u.cityAccess || []).forEach((city) => { if (city) values.add(String(city).trim()); }));
    String(form.cityAccessText || '').split(',').map((x) => x.trim()).filter(Boolean).forEach((city) => values.add(city));
    return Array.from(values).sort((a, b) => a.localeCompare(b, 'pt-BR'));
  }, [warehouses, technicians, users, form.cityAccessText]);

  async function load() {
    const params = new URLSearchParams(filters).toString();
    const [u, t, w] = await Promise.all([api.get(`/users?${params}`), api.get('/technicians'), api.get('/warehouses').catch(() => ({ data: { data: [] } }))]);
    setUsers(u.data.data.users || []);
    setStats(u.data.data.stats || {});
    setTechnicians(t.data.data || []);
    setWarehouses(w.data.data || []);
  }

  useEffect(() => { load(); }, []); // eslint-disable-line react-hooks/exhaustive-deps

  function openCreate(role = 'tecnico') {
    setForm({ ...emptyUser, role, password: role === 'tecnico' ? 'tec123456' : '' });
    setModal(true);
  }
  function openEdit(user) {
    setForm({ ...emptyUser, ...user, password: '', technicianId: user.technicianId || '', mustChangePassword: !!user.mustChangePassword, warehouseIds: user.warehouseIds || [], cityAccessText: (user.cityAccess || []).join(', '), approvalLimit: user.approvalLimit || 0 });
    setModal(true);
  }
  function patchForm(patch) {
    const next = { ...form, ...patch };
    if (patch.role && patch.role !== 'tecnico') next.technicianId = '';
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
  function addManualCity(value) {
    const city = String(value || '').trim();
    if (!city) return;
    const selected = new Set(selectedCitiesFromForm());
    selected.add(city);
    patchForm({ cityAccessText: Array.from(selected).join(', '), newCityText: '' });
  }
  async function saveUser() {
    try {
      setMessage('');
      if (form.password && String(form.password).length < 6) {
        setMessage('A senha precisa ter pelo menos 6 caracteres.');
        return;
      }
      const payload = { ...form, technicianId: form.role === 'tecnico' ? form.technicianId || null : null, warehouseIds: form.warehouseIds || [], cityAccess: String(form.cityAccessText || '').split(',').map((x) => x.trim()).filter(Boolean), approvalLimit: Number(form.approvalLimit || 0) };
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
          <div><h3>👥 Contas do sistema</h3><p>Somente administradores visualizam esta página. Contas de técnico podem ser vinculadas ao cadastro do técnico para abrir a caixa mobile.</p></div>
          <div className="row-actions"><button className="ghost" onClick={() => openCreate('admin')}>Criar admin</button><button className="ghost" onClick={() => openCreate('supervisor')}>Criar supervisor</button><button onClick={() => openCreate('tecnico')}>Criar técnico</button></div>
        </div>
        <div className="table-wrap">
          <table>
            <thead><tr><th>Usuário</th><th>Perfil</th><th>Status</th><th>Técnico vinculado</th><th>Último login</th><th>Criado em</th><th className="action-cell wide-actions">Opções</th></tr></thead>
            <tbody>
              {users.map((u) => (
                <tr key={u.id} className={u.deletedAt ? 'muted-row' : ''}>
                  <td><button className="link-button" onClick={() => openDetails(u)}>👤 {u.name}</button><small className="block">{u.email}</small></td>
                  <td><span className={`badge role-${u.role}`}>{roleLabel(u.role)}</span></td>
                  <td><span className={`badge ${statusTone(u)}`}>{statusLabel(u)}</span></td>
                  <td>{u.Technician?.name || (u.role === 'tecnico' ? '⚠️ sem vínculo' : '-')}</td>
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
              {users.length === 0 && <tr><td colSpan="7"><div className="empty-state">Nenhum usuário encontrado.</div></td></tr>}
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
            <label>Cargo/função<input value={form.jobTitle || ''} onChange={(e) => patchForm({ jobTitle: e.target.value })} placeholder="Ex.: Estoquista, Técnico de campo" /></label>
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
            {form.role === 'tecnico' && <label>Técnico vinculado
              <select value={form.technicianId || ''} onChange={(e) => patchForm({ technicianId: e.target.value })}>
                <option value="">Selecione o técnico</option>
                {technicians.map((t) => <option key={t.id} value={t.id}>{t.name} {t.document ? `• ${t.document}` : ''}</option>)}
              </select>
            </label>}
            {form.role === 'estoquista' && <label>Estoques autorizados
              <select multiple value={form.warehouseIds || []} onChange={(e) => patchForm({ warehouseIds: Array.from(e.target.selectedOptions).map((option) => Number(option.value)) })}>
                {warehouses.map((w) => <option key={w.id} value={w.id}>{w.name} • {w.city || w.region || w.code}</option>)}
              </select>
              <small>Use Ctrl para selecionar mais de um estoque.</small>
            </label>}
            {['estoquista', 'tecnico'].includes(form.role) && <div className="form-field full-span">
              <span className="field-label">Cidades autorizadas</span>
              <div className="city-checkbox-list">
                {cityOptions.map((city) => <label className="check-pill" key={city}><input type="checkbox" checked={selectedCitiesFromForm().includes(city)} onChange={() => toggleCityAccess(city)} /><span>{city}</span></label>)}
                {cityOptions.length === 0 && <small>Nenhuma cidade cadastrada em estoques ou técnicos. Adicione manualmente abaixo.</small>}
              </div>
              <div className="input-with-button"><input value={form.newCityText || ''} onChange={(e) => patchForm({ newCityText: e.target.value })} placeholder="Adicionar cidade manualmente" /><button type="button" className="ghost" onClick={() => addManualCity(form.newCityText)}>Adicionar cidade</button></div>
              <small>As cidades marcadas limitam o login a operações e visões autorizadas pela administração.</small>
            </div>}
            {form.role === 'estoquista' && <label>Limite de aprovação do usuário
              <input type="number" value={form.approvalLimit || 0} onChange={(e) => patchForm({ approvalLimit: e.target.value })} />
            </label>}
            <label>{form.id ? 'Nova senha manual opcional' : 'Senha inicial'}
              <div className="input-with-button"><input type="text" value={form.password || ''} onChange={(e) => patchForm({ password: e.target.value })} placeholder={form.id ? 'Digite uma nova senha ou deixe vazio para manter' : 'Digite uma senha ou gere automaticamente'} /><button type="button" className="ghost" onClick={() => patchForm({ password: randomPassword() })}>Gerar</button></div>
              <small>Ao preencher manualmente e clicar em Salvar usuário, exatamente essa senha será gravada no banco Neon.</small>
            </label>
          </div>
          <label className="form-check"><input className="form-check-input" type="checkbox" checked={!!form.mustChangePassword} onChange={(e) => patchForm({ mustChangePassword: e.target.checked })} /><span className="form-check-label">Solicitar troca de senha no próximo acesso</span></label>
          <label>Observações administrativas<textarea rows="3" value={form.notes || ''} onChange={(e) => patchForm({ notes: e.target.value })} placeholder="Motivo da criação, restrições, observações de auditoria..." /></label>
          {form.role === 'tecnico' && <div className="viz-callout">📱 Ao logar no celular, este usuário técnico será direcionado para a própria caixa de materiais, com acesso reduzido ao que precisa operar.</div>}
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
            ['Telefone', details.data.user.phone], ['Cargo/função', details.data.user.jobTitle], ['Técnico vinculado', details.data.user.Technician?.name || '-'], ['Documento técnico', details.data.user.Technician?.document || '-'],
            ['Último login', dt(details.data.user.lastLoginAt)], ['Senha alterada em', dt(details.data.user.passwordChangedAt)], ['Criado em', dt(details.data.user.createdAt)], ['Atualizado em', dt(details.data.user.updatedAt)],
            ['Bloqueado em', dt(details.data.user.blockedAt)], ['Motivo bloqueio', details.data.user.blockedReason], ['Excluído em', dt(details.data.user.deletedAt)], ['Motivo exclusão', details.data.user.deletedReason],
            ['Estoques autorizados', (details.data.user.warehouseIds || []).join(', ') || '-'], ['Cidades autorizadas', (details.data.user.cityAccess || []).length ? `${(details.data.user.cityAccess || []).length} cidade(s)` : '-'], ['Limite aprovação', Number(details.data.user.approvalLimit || 0).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })], ['Observações', details.data.user.notes],
          ]} />
          <div className="detail-section"><h4>Cidades autorizadas</h4><div className="city-chip-list">{(details.data.user.cityAccess || []).length ? details.data.user.cityAccess.map((city) => <span className="city-chip" key={city}>{city}</span>) : <span className="muted">Nenhuma cidade definida.</span>}</div></div>
          <DetailList title="🧾 Histórico de alterações do usuário" items={details.data.audits || []} render={(audit) => <><b>{audit.action} • {dt(audit.createdAt)}</b><span>{audit.message}</span><small>Operador: {audit.actor?.name || 'Sistema'} • IP: {audit.ip || '-'}</small></>} />
        </>}
      </DetailsModal>
    </div>
  );
}
