/* eslint-disable react-hooks/exhaustive-deps */
import { useEffect, useState } from 'react';
import api from '../services/api';
import KpiCard from '../components/KpiCard';
import DetailsModal, { DetailGrid } from '../components/DetailsModal';

function brl(value) { return Number(value || 0).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' }); }

export default function Patrimony() {
  const [assets, setAssets] = useState([]);
  const [serial, setSerial] = useState('');
  const [details, setDetails] = useState(null);
  async function load() { setAssets((await api.get('/stock/assets', { params: { serial } })).data.data); }
  useEffect(() => { load(); }, []);
  const total = assets.reduce((s, a) => s + Number(a.acquisitionCost || 0), 0);
  return (
    <div className="page-grid">
      <div className="toolbar"><div><h2>Consulta patrimonial</h2><p>Rastreie ONUs e equipamentos por serial, técnico, cliente e status.</p></div><div className="inline"><input value={serial} onChange={(e) => setSerial(e.target.value)} placeholder="Buscar serial" /><button onClick={load}>Buscar</button></div></div>
      <div className="kpi-grid small"><KpiCard label="Equipamentos listados" value={assets.length} /><KpiCard label="Valor patrimonial" value={brl(total)} /><KpiCard label="Com técnicos" value={assets.filter((a) => a.ownerType === 'tecnico').length} /></div>
      <section className="panel"><div className="table-wrap"><table><thead><tr><th>Serial</th><th>Material</th><th>MAC</th><th>Status</th><th>Responsável</th><th>Cliente</th><th>Dias carga</th><th>Valor</th><th className="action-cell">Opções</th></tr></thead><tbody>{assets.map((a) => <tr key={a.id}><td>{a.serialNumber}</td><td>{a.Material?.name}</td><td>{a.mac || '-'}</td><td>{a.status}</td><td>{a.Technician?.name || a.ownerType}</td><td>{a.customerName || '-'}</td><td>{a.custodyDays}</td><td>{brl(a.acquisitionCost)}</td><td><div className="action-toolbar"><button className="info" onClick={() => setDetails(a)}>Detalhes</button></div></td></tr>)}</tbody></table></div></section>
      <DetailsModal open={!!details} title={`Detalhes do patrimônio ${details?.serialNumber || ''}`} onClose={() => setDetails(null)}>
        {details && <><DetailGrid fields={[["Serial", details.serialNumber], ["Material", details.Material?.name], ["MAC", details.mac], ["Marca", details.brand], ["Modelo", details.model], ["Status", details.status], ["Local atual", details.ownerType], ["Técnico", details.Technician?.name], ["Cliente", details.customerName], ["CPF cliente", details.customerCpf], ["Data custódia", details.custodyStartedAt], ["Dias em carga", details.custodyDays], ["Instalado em", details.installedAt], ["Último movimento", details.lastMovementAt], ["Valor", brl(details.acquisitionCost)], ["Observações", details.notes]]} /><div className="viz-callout">Use esta janela para conferência de inventário, auditoria de serial e consulta rápida de responsabilidade patrimonial.</div></>}
      </DetailsModal>
    </div>
  );
}
