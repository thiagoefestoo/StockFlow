import { useEffect, useMemo, useState } from 'react';
import api from '../services/api';
import KpiCard from '../components/KpiCard';
import DetailsModal, { DetailGrid } from '../components/DetailsModal';

function dt(value) { return value ? new Date(value).toLocaleString('pt-BR') : '-'; }
function downloadExcelLike(filename, rows) {
  const htmlRows = rows.map((row) => `<tr>${row.map((cell) => `<td>${String(cell ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;')}</td>`).join('')}</tr>`).join('');
  const blob = new Blob([`<html><head><meta charset="utf-8" /></head><body><table>${htmlRows}</table></body></html>`], { type: 'application/vnd.ms-excel;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}
function csvEscape(value) { return `"${String(value ?? '').replace(/"/g, '""')}"`; }

const FIELD_LABELS = {
  id: 'ID',
  name: 'Nome',
  email: 'E-mail',
  role: 'Perfil',
  status: 'Status',
  phone: 'Telefone',
  notes: 'Observações',
  jobTitle: 'Cargo/função',
  cityAccess: 'Cidades autorizadas',
  warehouseIds: 'Estoques autorizados',
  approvalLimit: 'Limite de aprovação',
  mustChangePassword: 'Trocar senha no próximo acesso',
  passwordChangedAt: 'Senha alterada em',
  createdAt: 'Criado em',
  updatedAt: 'Atualizado em',
  deletedAt: 'Excluído em',
  blockedAt: 'Bloqueado em',
  technicianId: 'Técnico vinculado',
  'Technician.id': 'Técnico - ID',
  'Technician.name': 'Técnico - Nome',
  'Technician.email': 'Técnico - e-mail',
  'Technician.phone': 'Técnico - telefone',
  'Technician.status': 'Técnico - status',
  'Technician.type': 'Técnico - tipo',
  'Technician.serviceCities': 'Técnico - cidades atendidas',
  'Technician.defaultWarehouseId': 'Técnico - estoque padrão',
  'Technician.notes': 'Técnico - observações',
};

const HIDDEN_FIELDS = new Set([
  'password',
  'passwordHash',
  'token',
  'accessToken',
  'refreshToken',
  'resetToken',
]);

function labelFor(path) {
  if (FIELD_LABELS[path]) return FIELD_LABELS[path];
  const last = String(path).split('.').pop();
  if (FIELD_LABELS[last]) return FIELD_LABELS[last];
  return String(path)
    .replace(/([A-Z])/g, ' $1')
    .replace(/_/g, ' ')
    .replace(/\b\w/g, (l) => l.toUpperCase())
    .trim();
}

function isPlainObject(value) {
  return value && typeof value === 'object' && !Array.isArray(value) && !(value instanceof Date);
}

function looksLikeDate(value) {
  return typeof value === 'string' && /^\d{4}-\d{2}-\d{2}T/.test(value);
}

function formatValue(value) {
  if (value === null || value === undefined || value === '') return '-';
  if (typeof value === 'boolean') return value ? 'Sim' : 'Não';
  if (looksLikeDate(value)) return dt(value);
  if (Array.isArray(value)) {
    if (!value.length) return '-';
    if (value.every((item) => !isPlainObject(item))) return value.join(', ');
    return `${value.length} registro(s)`;
  }
  if (isPlainObject(value)) {
    if (value.name) return value.name;
    if (value.email) return value.email;
    if (value.serialNumber) return value.serialNumber;
    if (value.id) return `Registro #${value.id}`;
    return 'Registro relacionado';
  }
  return String(value);
}

function flattenObject(obj, prefix = '', result = {}, depth = 0) {
  if (!isPlainObject(obj) || depth > 4) return result;

  Object.entries(obj).forEach(([key, value]) => {
    if (HIDDEN_FIELDS.has(key)) return;
    const path = prefix ? `${prefix}.${key}` : key;

    if (HIDDEN_FIELDS.has(path)) return;

    if (isPlainObject(value)) {
      flattenObject(value, path, result, depth + 1);
    } else {
      result[path] = value;
    }
  });

  return result;
}

function normalized(value) {
  if (value === null || value === undefined || value === '') return '';
  if (Array.isArray(value)) return JSON.stringify(value.map((item) => isPlainObject(item) ? flattenObject(item) : item));
  if (isPlainObject(value)) return JSON.stringify(flattenObject(value));
  return String(value);
}

function buildChangeRows(beforeData, afterData) {
  const before = flattenObject(beforeData || {});
  const after = flattenObject(afterData || {});
  const keys = Array.from(new Set([...Object.keys(before), ...Object.keys(after)]));

  return keys
    .filter((key) => normalized(before[key]) !== normalized(after[key]))
    .map((key) => ({
      key,
      label: labelFor(key),
      before: formatValue(before[key]),
      after: formatValue(after[key]),
    }));
}

function AuditChangeView({ beforeData, afterData }) {
  const rows = buildChangeRows(beforeData, afterData);

  if (!beforeData && !afterData) {
    return <div className="empty-state small">Este evento não possui dados anteriores ou posteriores registrados.</div>;
  }

  if (!rows.length) {
    return <div className="empty-state small">Nenhuma diferença relevante foi encontrada neste evento.</div>;
  }

  return (
    <div className="audit-readable">
      <div className="panel-soft audit-readable-head">
        <h4>Resumo legível da alteração</h4>
        <p className="muted">Os dados técnicos foram convertidos para uma visão de conferência. Senhas e tokens não são exibidos.</p>
      </div>
      <div className="table-wrap compact">
        <table>
          <thead>
            <tr>
              <th>Campo</th>
              <th>Antes</th>
              <th>Depois</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((row) => (
              <tr key={row.key}>
                <td><strong>{row.label}</strong></td>
                <td>{row.before}</td>
                <td>{row.after}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

export default function Audit() {
  const [logs, setLogs] = useState([]);
  const [search, setSearch] = useState('');
  const [action, setAction] = useState('');
  const [entity, setEntity] = useState('');
  const [details, setDetails] = useState(null);
  const [message, setMessage] = useState('');

  async function load() {
    try {
      setMessage('');
      const params = new URLSearchParams({ limit: '2000' });
      if (action) params.set('action', action);
      if (entity) params.set('entity', entity);
      if (search.trim()) params.set('search', search.trim());
      const res = await api.get(`/audit?${params.toString()}`);
      setLogs(res.data.data);
    } catch (error) {
      setMessage(error.response?.data?.message || 'Erro ao carregar auditoria.');
    }
  }

  useEffect(() => { load(); }, []);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return logs;
    return logs.filter((log) => [log.message, log.action, log.entity, log.entityId, log.actor?.name, log.actor?.email].filter(Boolean).join(' ').toLowerCase().includes(q));
  }, [logs, search]);

  const stats = useMemo(() => {
    const actions = new Set(filtered.map((l) => l.action)).size;
    const entities = new Set(filtered.map((l) => l.entity)).size;
    const admins = filtered.filter((l) => l.actor?.role === 'admin').length;
    const system = filtered.filter((l) => !l.actor).length;
    return { actions, entities, admins, system };
  }, [filtered]);

  const actionOptions = useMemo(() => Array.from(new Set(logs.map((l) => l.action).filter(Boolean))).sort(), [logs]);
  const entityOptions = useMemo(() => Array.from(new Set(logs.map((l) => l.entity).filter(Boolean))).sort(), [logs]);

  function exportExcel() {
    const header = ['Data', 'Acao', 'Entidade', 'ID entidade', 'Mensagem', 'Operador', 'Email', 'Perfil', 'IP'];
    const body = filtered.map((log) => [dt(log.createdAt), log.action, log.entity, log.entityId, log.message, log.actor?.name || 'Sistema', log.actor?.email || '', log.actor?.role || '', log.ip || '']);
    downloadExcelLike('superinfra-auditoria-completa.xls', [header, ...body]);
  }

  function exportCsv() {
    const header = ['Data', 'Acao', 'Entidade', 'ID entidade', 'Mensagem', 'Operador', 'Email', 'Perfil', 'IP'];
    const body = filtered.map((log) => [dt(log.createdAt), log.action, log.entity, log.entityId, log.message, log.actor?.name || 'Sistema', log.actor?.email || '', log.actor?.role || '', log.ip || '']);
    const csv = [header, ...body].map((row) => row.map(csvEscape).join(';')).join('\n');
    const blob = new Blob([`\ufeff${csv}`], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'superinfra-auditoria-completa.csv';
    a.click();
    URL.revokeObjectURL(url);
  }

  return (
    <div className="page-grid audit-page">
      <div className="toolbar">
        <div><span className="eyebrow">Auditoria avançada</span><h2>Auditoria completa da operação</h2><p>Consulta corporativa de alterações, aprovações, transferências, anexos, baixas, edições e eventos do sistema.</p></div>
        <div className="row-actions"><button className="ghost" onClick={load}>🔄 Atualizar</button><button className="ghost" onClick={exportCsv}>⬇️ CSV</button><button onClick={exportExcel}>📗 Excel</button></div>
      </div>
      {message && <div className="alert danger">{message}</div>}
      <div className="kpi-grid small"><KpiCard label="Registros" value={filtered.length} /><KpiCard label="Tipos de ação" value={stats.actions} /><KpiCard label="Entidades afetadas" value={stats.entities} /><KpiCard label="Ações admin" value={stats.admins} /><KpiCard label="Eventos sistema" value={stats.system} /></div>
      <section className="panel filters"><div className="form-grid"><label>🔎 Pesquisar<input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Mensagem, operador, entidade, ação..." /></label><label>Ação<select value={action} onChange={(e) => setAction(e.target.value)}><option value="">Todas</option>{actionOptions.map((item) => <option key={item} value={item}>{item}</option>)}</select></label><label>Entidade<select value={entity} onChange={(e) => setEntity(e.target.value)}><option value="">Todas</option>{entityOptions.map((item) => <option key={item} value={item}>{item}</option>)}</select></label><label className="filter-action"><span>&nbsp;</span><button onClick={load}>Aplicar filtros</button></label></div></section>
      <section className="panel audit-grid">
        <div className="timeline audit-timeline">
          {filtered.map((log) => <button type="button" className="event audit-event" key={log.id} onClick={() => setDetails(log)}><strong>{iconFor(log.action)} {log.message}</strong><span>{log.action} • {log.entity} #{log.entityId || '-'} • {dt(log.createdAt)}</span><small>{log.actor?.name || 'Sistema'} {log.actor?.role ? `• ${log.actor.role}` : ''}</small></button>)}
          {filtered.length === 0 && <div className="empty-state">Nenhum evento encontrado para os filtros selecionados.</div>}
        </div>
        <aside className="audit-side panel-soft">
          <h3>🛡️ O que esta página responde?</h3>
          <ul>
            <li>Quem alterou um registro?</li>
            <li>Quando uma guia foi assinada?</li>
            <li>Qual entidade foi afetada?</li>
            <li>Antes/depois da alteração administrativa.</li>
            <li>Exportação para análise externa no Excel.</li>
          </ul>
        </aside>
      </section>
      <DetailsModal open={!!details} title="🔎 Detalhes do evento de auditoria" onClose={() => setDetails(null)}>
        {details && <div className="audit-detail-grid"><DetailGrid fields={[["Data", dt(details.createdAt)], ["Ação", details.action], ["Entidade", details.entity], ["ID", details.entityId], ["Mensagem", details.message], ["Operador", details.actor?.name || 'Sistema'], ["E-mail", details.actor?.email], ["Perfil", details.actor?.role], ["IP", details.ip || '-']]} /><AuditChangeView beforeData={details.beforeData} afterData={details.afterData} /></div>}
      </DetailsModal>
    </div>
  );
}

function iconFor(action) {
  if (action === 'create') return '➕';
  if (action === 'update') return '✏️';
  if (action === 'delete') return '🗑️';
  if (action === 'sign') return '🖊️';
  if (action === 'approve') return '✅';
  if (action === 'reject') return '⛔';
  return '🧾';
}
