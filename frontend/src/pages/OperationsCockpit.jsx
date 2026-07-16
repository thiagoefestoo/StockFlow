import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import api from '../services/api';
import KpiCard from '../components/KpiCard';
import SimpleBar from '../components/SimpleBar';
import DetailsModal, { DetailGrid } from '../components/DetailsModal';

function brl(value) {
  return Number(value || 0).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
}
function dt(value) {
  return value ? new Date(value).toLocaleString('pt-BR') : '-';
}

export default function OperationsCockpit() {
  const [data, setData] = useState(null);
  const [message, setMessage] = useState('');
  const [details, setDetails] = useState(null);
  async function load() {
    try {
      setMessage('');
      setData((await api.get('/operations/cockpit')).data.data);
    } catch (error) {
      setMessage(error.response?.data?.message || error.message || 'Erro ao carregar cockpit.');
    }
  }
  useEffect(() => { load(); }, []);
  const k = data?.kpis || {};
  return (
    <div className="page-grid erp-page">
      <section className="command-center">
        <div>
          <span className="eyebrow">Cockpit operacional</span>
          <h2>Centro de controle da prestadora</h2>
          <p>Fila de aprovações, materiais em carga, guias sem assinatura, OS abertas e patrimônio sob responsabilidade técnica.</p>
        </div>
        <button onClick={load}>Atualizar agora</button>
      </section>
      {message && <div className="alert danger">{message}</div>}
      <div className="kpi-grid">
        <KpiCard label="Aprovações pendentes" value={k.pendingApprovals || 0} tone={k.pendingApprovals ? 'warning' : 'success'} />
        <KpiCard label="Separações a entregar" value={k.approvedRequests || 0} tone={k.approvedRequests ? 'warning' : 'success'} />
        <KpiCard label="Guias sem assinatura" value={k.pendingSignatures || 0} tone={k.pendingSignatures ? 'danger' : 'success'} />
        <KpiCard label="OS abertas" value={k.openOrders || 0} tone={k.openOrders ? 'warning' : 'success'} />
        <KpiCard label="Patrimônio em técnicos" value={brl(k.custodyValue)} hint={`${k.assetsWithTech || 0} itens serializados`} />
        <KpiCard label="Valor em estoque" value={brl(k.stockValue)} hint={`${k.assetsInStock || 0} itens serializados`} />
      </div>
      <section className="process-board">
        {(data?.queue || []).map((item) => (
          <Link key={item.label} to={item.route} className={`process-card tone-${item.tone || 'default'}`}>
            <small>Fila</small>
            <strong>{item.value}</strong>
            <span>{item.label}</span>
          </Link>
        ))}
      </section>
      <section className="two-col">
        <article className="panel">
          <div className="panel-title"><div><h3>Ranking de carga por técnico</h3><p>Patrimônio e materiais distribuídos por responsável.</p></div></div>
          {(data?.custodyRanking || []).map((item, idx) => (
            <SimpleBar key={item.technician} label={`${idx + 1}. ${item.technician}`} value={item.value} max={Math.max(...(data?.custodyRanking || []).map((x) => x.value || 1))} money />
          ))}
          {(data?.custodyRanking || []).length === 0 && <div className="empty-state">Nenhuma carga distribuída.</div>}
        </article>
        <article className="panel">
          <div className="panel-title"><div><h3>Solicitações recentes</h3><p>Pedidos de carga e reposição aguardando andamento.</p></div><Link className="ghost" to="/solicitacoes-material">Ver todas</Link></div>
          <div className="timeline">
            {(data?.recentRequests || []).map((r) => (
              <div className="event compact" key={r.id}>
                <strong>{r.requestNumber} • {r.Technician?.name}</strong>
                <span>{r.status} · {Number(r.totalQuantity || 0)} item(ns) · {brl(r.totalValue)}</span>
                <small>{dt(r.createdAt)}</small>
              </div>
            ))}
            {(data?.recentRequests || []).length === 0 && <div className="empty-state">Nenhuma solicitação recente.</div>}
          </div>
        </article>
      </section>
      <section className="panel">
        <div className="panel-title"><div><h3>Últimas movimentações</h3><p>Rastro operacional para auditoria: entrada, transferência, baixa por OS e ajustes.</p></div><Link className="ghost" to="/historico-movimentacoes">Histórico completo</Link></div>
        <div className="table-wrap"><table><thead><tr><th>Data</th><th>Tipo</th><th>Material</th><th>Origem</th><th>Destino</th><th>Referência</th><th>Opções</th></tr></thead><tbody>{(data?.recentMovements || []).map((m) => <tr key={m.id}><td>{dt(m.movementAt)}</td><td><span className="badge">{m.type}</span></td><td>{m.Material?.name || '-'}</td><td>{m.fromTechnician?.name || m.fromOwnerType || '-'}</td><td>{m.toTechnician?.name || m.toOwnerType || '-'}</td><td>{m.reference || '-'}</td><td><button className="info" onClick={() => setDetails(m)}>Detalhes</button></td></tr>)}</tbody></table></div>
      </section>

      <DetailsModal open={!!details} title="Detalhes da movimentação" onClose={() => setDetails(null)}>
        {details && <DetailGrid fields={[["Data", details.movementAt], ["Tipo", details.type], ["Material", details.Material?.name], ["Origem", details.fromTechnician?.name || details.fromOwnerType], ["Destino", details.toTechnician?.name || details.toOwnerType], ["Referência", details.reference], ["Serial", details.serialNumber], ["Quantidade", details.quantity], ["Observação", details.notes]]} />}
      </DetailsModal>
    </div>
  );
}
