import { useEffect, useMemo, useState } from 'react';
import api from '../services/api';
import KpiCard from '../components/KpiCard';
import DetailsModal, { DetailGrid } from '../components/DetailsModal';

function dt(value) { return value ? new Date(value).toLocaleString('pt-BR') : '-'; }
function brl(value) { return Number(value || 0).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' }); }
function csvEscape(value) { return `"${String(value ?? '').replace(/"/g, '""')}"`; }
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

export default function MovementHistory() {
  const [rows, setRows] = useState([]);
  const [search, setSearch] = useState('');
  const [type, setType] = useState('');
  const [technicianId, setTechnicianId] = useState('');
  const [technicians, setTechnicians] = useState([]);
  const [message, setMessage] = useState('');
  const [details, setDetails] = useState(null);

  async function load() {
    try {
      setMessage('');
      const params = new URLSearchParams({ limit: '2000' });
      if (type) params.set('type', type);
      if (technicianId) params.set('technicianId', technicianId);
      if (search.trim()) params.set('search', search.trim());
      const [mov, tech] = await Promise.all([api.get(`/stock/movements?${params.toString()}`), api.get('/technicians')]);
      setRows(mov.data.data);
      setTechnicians(tech.data.data);
    } catch (error) { setMessage(error.response?.data?.message || 'Erro ao carregar histórico.'); }
  }

  useEffect(() => { load(); }, []);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return rows;
    return rows.filter((m) => [m.type, m.serialNumber, m.reference, m.notes, m.Material?.name, m.fromTechnician?.name, m.toTechnician?.name, m.createdBy?.name].filter(Boolean).join(' ').toLowerCase().includes(q));
  }, [rows, search]);

  const stats = useMemo(() => {
    const serials = filtered.filter((m) => m.serialNumber).length;
    const transferencias = filtered.filter((m) => m.type === 'transferencia_tecnico').length;
    const baixas = filtered.filter((m) => m.type === 'baixa_os').length;
    const quantidade = filtered.reduce((sum, m) => sum + Number(m.quantity || 0), 0);
    return { serials, transferencias, baixas, quantidade };
  }, [filtered]);

  function exportExcel() {
    const header = ['Data', 'Tipo', 'Material', 'Quantidade', 'Serial', 'Origem', 'Destino', 'Referencia', 'Operador', 'Observacao'];
    const body = filtered.map((m) => [dt(m.movementAt), m.type, m.Material?.name || '', m.quantity, m.serialNumber || '', m.fromTechnician?.name || m.fromOwnerType || '', m.toTechnician?.name || m.toOwnerType || '', m.reference || '', m.createdBy?.name || 'Sistema', m.notes || '']);
    downloadExcelLike('superinfra-historico-movimentacoes.xls', [header, ...body]);
  }

  function exportCsv() {
    const header = ['Data', 'Tipo', 'Material', 'Quantidade', 'Serial', 'Origem', 'Destino', 'Referencia', 'Operador', 'Observacao'];
    const body = filtered.map((m) => [dt(m.movementAt), m.type, m.Material?.name || '', m.quantity, m.serialNumber || '', m.fromTechnician?.name || m.fromOwnerType || '', m.toTechnician?.name || m.toOwnerType || '', m.reference || '', m.createdBy?.name || 'Sistema', m.notes || '']);
    const csv = [header, ...body].map((row) => row.map(csvEscape).join(';')).join('\n');
    const blob = new Blob([`\ufeff${csv}`], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'superinfra-historico-movimentacoes.csv';
    a.click();
    URL.revokeObjectURL(url);
  }

  return (
    <div className="page-grid history-page">
      <section className="toolbar"><div><span className="eyebrow">🧾 Auditoria patrimonial</span><h2>Histórico de movimentações completo</h2><p>Rastreamento de entrada, transferência, retorno, baixa por OS, ajuste, perda e cancelamento.</p></div><div className="row-actions"><button className="ghost" onClick={load}>🔄 Atualizar</button><button className="ghost" onClick={exportCsv}>⬇️ CSV</button><button onClick={exportExcel}>📗 Excel</button></div></section>
      {message && <div className="alert danger">{message}</div>}
      <div className="kpi-grid small"><KpiCard label="Movimentos exibidos" value={filtered.length} /><KpiCard label="Qtd. movimentada" value={stats.quantidade.toLocaleString('pt-BR')} /><KpiCard label="Com serial" value={stats.serials} /><KpiCard label="Transferências" value={stats.transferencias} /><KpiCard label="Baixas por OS" value={stats.baixas} /></div>
      <section className="panel filters"><div className="form-grid"><label>🔎 Pesquisar<input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Serial, material, técnico, referência..." /></label><label>Tipo<select value={type} onChange={(e) => setType(e.target.value)}><option value="">Todos</option><option value="entrada">Entrada</option><option value="transferencia_tecnico">Transferência técnico</option><option value="retorno_tecnico">Retorno técnico</option><option value="baixa_os">Baixa OS</option><option value="ajuste">Ajuste</option><option value="perda">Perda</option><option value="cancelamento">Cancelamento</option></select></label><label>Técnico<select value={technicianId} onChange={(e) => setTechnicianId(e.target.value)}><option value="">Todos</option>{technicians.map((t) => <option key={t.id} value={t.id}>{t.name}</option>)}</select></label><label className="filter-action"><span>&nbsp;</span><button type="button" onClick={load}>Aplicar filtros</button></label></div></section>
      <section className="panel"><div className="table-wrap"><table><thead><tr><th>Data</th><th>Tipo</th><th>Material</th><th>Qtd.</th><th>Serial</th><th>Origem</th><th>Destino</th><th>Referência</th><th>Operador</th><th className="action-cell">Opções</th></tr></thead><tbody>{filtered.map((m) => <tr key={m.id}><td>{dt(m.movementAt)}</td><td><span className="badge">{m.type}</span></td><td>{m.Material?.name || '-'}</td><td>{m.quantity}</td><td>{m.serialNumber || '-'}</td><td>{m.fromTechnician?.name || m.fromOwnerType || '-'}</td><td>{m.toTechnician?.name || m.toOwnerType || '-'}</td><td>{m.reference || '-'}</td><td>{m.createdBy?.name || 'Sistema'}</td><td><div className="action-toolbar"><button className="info" onClick={() => setDetails(m)}>🔎 Detalhes</button></div></td></tr>)}</tbody></table></div></section>
      <DetailsModal open={!!details} title="🔎 Detalhes completos da movimentação" onClose={() => setDetails(null)}>
        {details && <><DetailGrid fields={[["Data", dt(details.movementAt)], ["Tipo", details.type], ["Material", details.Material?.name], ["Categoria", details.Material?.category], ["Quantidade", details.quantity], ["Serial", details.serialNumber], ["MAC", details.SerializedAsset?.mac], ["Marca/modelo", `${details.SerializedAsset?.brand || '-'} ${details.SerializedAsset?.model || ''}`], ["Valor do ativo", brl(details.SerializedAsset?.acquisitionCost)], ["Origem", details.fromTechnician?.name || details.fromOwnerType], ["Destino", details.toTechnician?.name || details.toOwnerType], ["Referência", details.reference], ["Operador", details.createdBy?.name || 'Sistema'], ["E-mail operador", details.createdBy?.email], ["Observação", details.notes], ["Criado em", dt(details.createdAt)], ["Atualizado em", dt(details.updatedAt)]]} /><div className="viz-callout">🛡️ Este registro ajuda a responder quem movimentou, quando movimentou, de onde saiu, para onde foi, qual serial estava envolvido e qual documento operacional originou a ação.</div></>}
      </DetailsModal>
    </div>
  );
}
