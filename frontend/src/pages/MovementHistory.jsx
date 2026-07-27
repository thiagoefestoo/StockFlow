/* eslint-disable react-hooks/exhaustive-deps */
import { useEffect, useMemo, useState } from 'react';
import api from '../services/api';
import KpiCard from '../components/KpiCard';
import Pagination from '../components/Pagination';
import DetailsModal, { DetailGrid } from '../components/DetailsModal';
import { formatQuantity } from '../utils/formatQuantity';

function dt(value) { return value ? new Date(value).toLocaleString('pt-BR') : '-'; }
function brl(value) { return Number(value || 0).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' }); }
function csvEscape(value) { return `"${String(value ?? '').replace(/"/g, '""')}"`; }
function movementTypeLabel(type) {
  const labels = { entrada: 'Entrada', transferencia_tecnico: 'Transferência técnico', retorno_tecnico: 'Retorno técnico', baixa_os: 'Baixa por OS', ajuste: 'Ajuste', perda: 'Perda', cancelamento: 'Cancelamento', saida_logistica_reversa: 'Saída logística reversa' };
  return labels[type] || type || '-';
}
function movementOrigin(row) { return row.fromWarehouse?.name || row.fromTechnician?.name || row.fromOwnerType || '-'; }
function movementDestination(row) { return row.toWarehouse?.name || row.toTechnician?.name || row.toOwnerType || '-'; }
function downloadExcelLike(filename, rows) {
  const htmlRows = rows.map((row) => `<tr>${row.map((cell) => `<td>${String(cell ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;')}</td>`).join('')}</tr>`).join('');
  const blob = new Blob([`<html><head><meta charset="utf-8" /></head><body><table>${htmlRows}</table></body></html>`], { type: 'application/vnd.ms-excel;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a'); a.href = url; a.download = filename; a.click(); URL.revokeObjectURL(url);
}

export default function MovementHistory() {
  const [rows, setRows] = useState([]);
  const [search, setSearch] = useState('');
  const [type, setType] = useState('');
  const [technicianId, setTechnicianId] = useState('');
  const [technicians, setTechnicians] = useState([]);
  const [message, setMessage] = useState('');
  const [details, setDetails] = useState(null);
  const [page, setPage] = useState(1);
  const [pagination, setPagination] = useState({ page: 1, pageSize: 15, total: 0, totalPages: 1 });
  const [loading, setLoading] = useState(false);

  async function load(targetPage = page, refreshTechnicians = false) {
    setLoading(true);
    try {
      setMessage('');
      const params = { page: targetPage, pageSize: 15 };
      if (type) params.type = type;
      if (technicianId) params.technicianId = technicianId;
      if (search.trim()) params.search = search.trim();
      const requests = [api.get('/stock/movements', { params })];
      if (refreshTechnicians || !technicians.length) requests.push(api.get('/technicians'));
      const [mov, tech] = await Promise.all(requests);
      setRows(mov.data.data || []);
      setPagination(mov.data.pagination || { page: targetPage, pageSize: 15, total: mov.data.data?.length || 0, totalPages: 1 });
      setPage(targetPage);
      if (tech) setTechnicians(tech.data.data || []);
    } catch (error) {
      setMessage(error.response?.data?.message || 'Erro ao carregar histórico.');
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => { load(1, true); }, []);

  const stats = useMemo(() => {
    const serials = rows.filter((m) => m.serialNumber).length;
    const transferencias = rows.filter((m) => m.type === 'transferencia_tecnico').length;
    const baixas = rows.filter((m) => m.type === 'baixa_os').length;
    const reversas = rows.filter((m) => m.type === 'saida_logistica_reversa').length;
    const quantidade = rows.reduce((sum, m) => sum + Number(m.quantity || 0), 0);
    return { serials, transferencias, baixas, reversas, quantidade };
  }, [rows]);

  function exportExcel() {
    const header = ['Data', 'Tipo', 'Material', 'Quantidade', 'Serial', 'Origem', 'Destino', 'Referencia', 'Operador', 'Observacao'];
    const body = rows.map((m) => [dt(m.movementAt), movementTypeLabel(m.type), m.Material?.name || '', formatQuantity(m.quantity), m.serialNumber || '', movementOrigin(m), movementDestination(m), m.reference || '', m.createdBy?.name || 'Sistema', m.notes || '']);
    downloadExcelLike('superinfra-historico-movimentacoes-pagina.xls', [header, ...body]);
  }

  function exportCsv() {
    const header = ['Data', 'Tipo', 'Material', 'Quantidade', 'Serial', 'Origem', 'Destino', 'Referencia', 'Operador', 'Observacao'];
    const body = rows.map((m) => [dt(m.movementAt), movementTypeLabel(m.type), m.Material?.name || '', formatQuantity(m.quantity), m.serialNumber || '', movementOrigin(m), movementDestination(m), m.reference || '', m.createdBy?.name || 'Sistema', m.notes || '']);
    const csv = [header, ...body].map((row) => row.map(csvEscape).join(';')).join('\n');
    const blob = new Blob([`\ufeff${csv}`], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob); const a = document.createElement('a'); a.href = url; a.download = 'superinfra-historico-movimentacoes-pagina.csv'; a.click(); URL.revokeObjectURL(url);
  }

  return (
    <div className="page-grid history-page">
      <section className="toolbar"><div><span className="eyebrow">🧾 Auditoria patrimonial</span><h2>Histórico de movimentações completo</h2><p>Rastreamento de entrada, transferência, retorno, baixa por OS, ajuste, perda, cancelamento e saídas de logística reversa.</p></div><div className="row-actions"><button className="ghost" onClick={() => load(page)}>🔄 Atualizar</button><button className="ghost" onClick={exportCsv}>⬇️ CSV da página</button><button onClick={exportExcel}>📗 Excel da página</button></div></section>
      {message && <div className="alert danger">{message}</div>}
      <div className="kpi-grid small"><KpiCard label="Movimentos nesta página" value={rows.length} /><KpiCard label="Total encontrado" value={pagination.total || 0} /><KpiCard label="Qtd. movimentada" value={formatQuantity(stats.quantidade)} /><KpiCard label="Com serial" value={stats.serials} /><KpiCard label="Baixas por OS" value={stats.baixas} /><KpiCard label="Saídas reversas" value={stats.reversas} /></div>
      <section className="panel filters"><div className="form-grid"><label>🔎 Pesquisar<input value={search} onChange={(e) => setSearch(e.target.value)} onKeyDown={(e) => { if (e.key === 'Enter') load(1); }} placeholder="Serial, material, técnico, referência..." /></label><label>Tipo<select value={type} onChange={(e) => setType(e.target.value)}><option value="">Todos</option><option value="entrada">Entrada</option><option value="transferencia_tecnico">Transferência técnico</option><option value="retorno_tecnico">Retorno técnico</option><option value="baixa_os">Baixa OS</option><option value="ajuste">Ajuste</option><option value="perda">Perda</option><option value="cancelamento">Cancelamento</option><option value="saida_logistica_reversa">Saída logística reversa</option></select></label><label>Técnico<select value={technicianId} onChange={(e) => setTechnicianId(e.target.value)}><option value="">Todos</option>{technicians.map((t) => <option key={t.id} value={t.id}>{t.name}</option>)}</select></label><label className="filter-action"><span>&nbsp;</span><button type="button" onClick={() => load(1)} disabled={loading}>{loading ? 'Carregando...' : 'Aplicar filtros'}</button></label></div></section>
      <section className="panel"><div className="table-wrap"><table><thead><tr><th>Data</th><th>Tipo</th><th>Material</th><th>Qtd.</th><th>Serial</th><th>Origem</th><th>Destino</th><th>Referência</th><th>Operador</th><th className="action-cell">Opções</th></tr></thead><tbody>{rows.map((m) => <tr key={m.id}><td>{dt(m.movementAt)}</td><td><span className={`badge ${m.type}`}>{movementTypeLabel(m.type)}</span></td><td>{m.Material?.name || '-'}</td><td>{formatQuantity(m.quantity)}</td><td>{m.serialNumber || '-'}</td><td>{movementOrigin(m)}</td><td>{movementDestination(m)}</td><td>{m.reference || '-'}</td><td>{m.createdBy?.name || 'Sistema'}</td><td><div className="action-toolbar"><button className="info" onClick={() => setDetails(m)}>🔎 Detalhes</button></div></td></tr>)}</tbody></table></div><Pagination {...pagination} page={page} loading={loading} onPageChange={load} /></section>
      <DetailsModal open={!!details} title="🔎 Detalhes completos da movimentação" onClose={() => setDetails(null)}>
        {details && <><DetailGrid fields={[["Data", dt(details.movementAt)], ["Tipo", movementTypeLabel(details.type)], ["Material", details.Material?.name], ["Categoria", details.Material?.category], ["Quantidade", formatQuantity(details.quantity)], ["Serial", details.serialNumber], ["MAC", details.SerializedAsset?.mac], ["Marca/modelo", `${details.SerializedAsset?.brand || '-'} ${details.SerializedAsset?.model || ''}`], ["Valor do ativo", brl(details.SerializedAsset?.acquisitionCost)], ["Origem", movementOrigin(details)], ["Destino", movementDestination(details)], ["Referência", details.reference], ["Operador", details.createdBy?.name || 'Sistema'], ["E-mail operador", details.createdBy?.email], ["Observação", details.notes], ["Criado em", dt(details.createdAt)], ["Atualizado em", dt(details.updatedAt)]]} /><div className="viz-callout">🛡️ Este registro ajuda a responder quem movimentou, quando movimentou, de onde saiu, para onde foi, qual serial estava envolvido e qual documento operacional originou a ação.</div></>}
      </DetailsModal>
    </div>
  );
}
