import { useState } from 'react';
import api from '../services/api';
import KpiCard from '../components/KpiCard';

function brl(v) { return Number(v || 0).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' }); }
function dt(v) { return v ? new Date(v).toLocaleString('pt-BR') : '-'; }

export default function SerialLife() {
  const [serial, setSerial] = useState('');
  const [data, setData] = useState(null);
  const [message, setMessage] = useState('');
  async function search() {
    try { setMessage(''); setData((await api.get(`/stock/serial-life/${encodeURIComponent(serial)}`)).data.data); }
    catch (e) { setData(null); setMessage(e.response?.data?.message || 'Serial não encontrado.'); }
  }
  const s = data?.summary || {};
  return <div className="page-grid erp-page">
    <section className="toolbar"><div><span className="eyebrow">Rastreabilidade patrimonial</span><h2>Vida útil do serial</h2><p>Consulte toda a trajetória de um equipamento: entrada, estoque, transferências, caixa do técnico, cliente, OS e devoluções.</p></div></section>
    <section className="panel"><div className="inline filters"><label>Número de série<input value={serial} onChange={(e) => setSerial(e.target.value)} onKeyDown={(e) => { if (e.key === 'Enter') search(); }} placeholder="Ex.: DEMO-ONU-0001" /></label><button onClick={search}>Buscar serial</button></div></section>
    {message && <div className="alert danger">{message}</div>}
    {data && <>
      <div className="kpi-grid small"><KpiCard label="Material" value={s.material || '-'} /><KpiCard label="Status atual" value={s.status || '-'} /><KpiCard label="Valor" value={brl(s.acquisitionCost)} /><KpiCard label="Movimentos" value={s.movementCount || 0} /></div>
      <section className="panel"><h3>Resumo atual</h3><div className="detail-grid"><div className="detail-card"><span>Serial</span><strong>{s.serial}</strong></div><div className="detail-card"><span>Responsável atual</span><strong>{s.technician || s.warehouse || s.customerName || s.currentOwner}</strong></div><div className="detail-card"><span>Primeiro movimento</span><strong>{dt(s.firstMovement)}</strong></div><div className="detail-card"><span>Último movimento</span><strong>{dt(s.lastMovement)}</strong></div></div></section>
      <section className="panel"><h3>Linha do tempo operacional</h3><div className="timeline">{(data.lifecycle || []).map((m) => <div className="event" key={m.id}><strong>{dt(m.movementAt)} • {m.type}</strong><span>{m.Material?.name} • {m.reference || '-'} • {m.fromWarehouse?.name || m.fromTechnician?.name || m.fromOwnerType || '-'} → {m.toWarehouse?.name || m.toTechnician?.name || m.toOwnerType || '-'}</span><small>{m.notes || 'Sem observação'}</small></div>)}</div></section>
      <section className="panel"><h3>Guias e ordens vinculadas</h3><div className="table-wrap"><table><thead><tr><th>Tipo</th><th>Número</th><th>Data</th><th>Responsável/cliente</th><th>Status</th></tr></thead><tbody>{(data.transfers || []).map((i) => <tr key={`t-${i.id}`}><td>Guia</td><td>{i.Transfer?.transferNumber}</td><td>{dt(i.Transfer?.deliveredAt)}</td><td>{i.Transfer?.Technician?.name}</td><td>{i.Transfer?.status}</td></tr>)}{(data.serviceOrders || []).map((i) => <tr key={`o-${i.id}`}><td>OS</td><td>{i.ServiceOrder?.osNumber}</td><td>{dt(i.ServiceOrder?.completedAt || i.ServiceOrder?.createdAt)}</td><td>{i.ServiceOrder?.customerName}</td><td>{i.ServiceOrder?.status}</td></tr>)}</tbody></table></div></section>
    </>}
  </div>;
}
