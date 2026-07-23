import { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import api from '../services/api';
import KpiCard from '../components/KpiCard';
import AttachmentPreview from '../components/AttachmentPreview';
import DetailsModal, { DetailGrid, DetailList } from '../components/DetailsModal';
import { formatQuantity, formatQuantityWithUnit } from '../utils/formatQuantity';

function brl(value) { return Number(value || 0).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' }); }
function dt(value) { return value ? new Date(value).toLocaleString('pt-BR') : '-'; }
function textOf(loss) {
  return [
    loss.transferNumber,
    loss.Technician?.name,
    loss.notes,
    loss.status,
    ...(loss.TransferItems || []).flatMap((item) => [item.Material?.name, item.serialNumber, item.SerializedAsset?.serialNumber]),
  ].filter(Boolean).join(' ').toLowerCase();
}
function extractReason(notes = '') {
  const text = String(notes || '');
  const match = text.match(/Motivo:\s*([^.|]+)/i);
  return match?.[1]?.trim() || text.replace('GUIA DE PERDA/DESCONTO.', '').trim() || '-';
}

export default function LossEvaluation() {
  const [losses, setLosses] = useState([]);
  const [technicians, setTechnicians] = useState([]);
  const [technicianId, setTechnicianId] = useState('');
  const [status, setStatus] = useState('');
  const [search, setSearch] = useState('');
  const [details, setDetails] = useState(null);
  const [loading, setLoading] = useState(true);

  async function load() {
    setLoading(true);
    const [lossRes, techRes] = await Promise.all([
      api.get('/stock/technician-losses'),
      api.get('/technicians').catch(() => ({ data: { data: [] } })),
    ]);
    setLosses(lossRes.data.data || []);
    setTechnicians(techRes.data.data || []);
    setLoading(false);
  }

  useEffect(() => { load(); }, []);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return losses.filter((loss) => {
      if (technicianId && Number(loss.technicianId) !== Number(technicianId)) return false;
      if (status && loss.status !== status) return false;
      if (q && !textOf(loss).includes(q)) return false;
      return true;
    });
  }, [losses, technicianId, status, search]);

  const summary = useMemo(() => {
    const allItems = filtered.flatMap((loss) => loss.TransferItems || []);
    const serialItems = allItems.filter((item) => item.serialNumber || item.SerializedAsset?.serialNumber);
    const pendingDocs = filtered.filter((loss) => !loss.attachmentName || loss.status === 'pendente_assinatura');
    const byTech = {};
    filtered.forEach((loss) => {
      const key = loss.Technician?.name || 'Sem técnico';
      byTech[key] = byTech[key] || { name: key, count: 0, value: 0, quantity: 0 };
      byTech[key].count += 1;
      byTech[key].value += Number(loss.totalValue || 0);
      byTech[key].quantity += Number(loss.totalQuantity || 0);
    });
    const ranking = Object.values(byTech).sort((a, b) => b.value - a.value);
    return {
      total: filtered.length,
      quantity: filtered.reduce((sum, loss) => sum + Number(loss.totalQuantity || 0), 0),
      value: filtered.reduce((sum, loss) => sum + Number(loss.totalValue || 0), 0),
      serialCount: serialItems.length,
      pendingDocs: pendingDocs.length,
      ranking,
    };
  }, [filtered]);

  return (
    <div className="page-grid loss-evaluation-page">
      <div className="toolbar">
        <div><h2>🔎 Avaliação detalhada de perdas</h2><p>Analise com precisão os equipamentos e materiais baixados como perda/desconto por técnico.</p></div>
        <div className="row-actions"><button className="ghost" onClick={load}>🔄 Atualizar</button><button onClick={() => window.print()}>🖨️ Imprimir</button></div>
      </div>

      <section className="kpi-grid small">
        <KpiCard label="Perdas filtradas" value={summary.total} />
        <KpiCard label="Qtd. perdida" value={formatQuantity(summary.quantity)} tone="danger" />
        <KpiCard label="Valor perdido" value={brl(summary.value)} tone="danger" />
        <KpiCard label="Equip. com serial" value={summary.serialCount} />
        <KpiCard label="Guias/doc. pendentes" value={summary.pendingDocs} tone="warning" />
      </section>

      <section className="panel filters">
        <div className="form-grid">
          <label>🔎 Pesquisar
            <input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Serial, técnico, guia, motivo ou material" />
          </label>
          <label>Técnico
            <select value={technicianId} onChange={(e) => setTechnicianId(e.target.value)}>
              <option value="">Todos</option>
              {technicians.map((tech) => <option key={tech.id} value={tech.id}>{tech.name}</option>)}
            </select>
          </label>
          <label>Status da guia
            <select value={status} onChange={(e) => setStatus(e.target.value)}>
              <option value="">Todos</option>
              <option value="pendente_assinatura">Pendente de assinatura</option>
              <option value="assinado">Assinado/anexado</option>
              <option value="cancelado">Cancelado</option>
            </select>
          </label>
        </div>
      </section>

      <section className="two-col loss-evaluation-grid">
        <article className="panel">
          <h3>Ranking por técnico</h3>
          <div className="timeline">
            {summary.ranking.map((row) => <div className="event compact" key={row.name}><strong>{row.name}</strong><span>{row.count} guia(s) • {formatQuantity(row.quantity)} item(ns)</span><small>{brl(row.value)}</small></div>)}
            {summary.ranking.length === 0 && <div className="empty-state">Nenhuma perda encontrada nos filtros.</div>}
          </div>
        </article>
        <article className="panel">
          <h3>Critérios de conferência</h3>
          <div className="timeline">
            <div className="event compact"><strong>Documento assinado</strong><span>Confira se a guia possui anexo e status assinado.</span></div>
            <div className="event compact"><strong>Serial e material</strong><span>Valide se o serial perdido realmente saiu da caixa do técnico.</span></div>
            <div className="event compact"><strong>Valor do desconto</strong><span>Use o valor unitário registrado na entrada/patrimônio.</span></div>
            <div className="event compact"><strong>Auditoria</strong><span>Consulte histórico e vida do serial quando necessário.</span></div>
          </div>
        </article>
      </section>

      <section className="panel">
        <div className="table-wrap">
          <table>
            <thead><tr><th>Guia</th><th>Técnico</th><th>Data</th><th>Motivo</th><th>Itens/seriais</th><th>Valor</th><th>Status</th><th>Documento</th><th>Opções</th></tr></thead>
            <tbody>
              {filtered.map((loss) => (
                <tr key={loss.id}>
                  <td><strong>{loss.transferNumber}</strong></td>
                  <td>{loss.Technician?.name || '-'}</td>
                  <td>{dt(loss.deliveredAt || loss.createdAt)}</td>
                  <td>{extractReason(loss.notes)}</td>
                  <td>{(loss.TransferItems || []).slice(0, 3).map((item) => <div key={item.id}><b>{item.Material?.name || 'Material'}</b> {item.serialNumber ? `• ${item.serialNumber}` : <>• Qtd. {formatQuantity(item.quantity)}</>}</div>)}{(loss.TransferItems || []).length > 3 && <small>+ {(loss.TransferItems || []).length - 3} item(ns)</small>}</td>
                  <td>{brl(loss.totalValue)}</td>
                  <td><span className={`badge ${loss.status}`}>{loss.status}</span></td>
                  <td>{loss.attachmentName ? <AttachmentPreview compact name={loss.attachmentName} data={loss.attachmentData} /> : <span className="badge pendente_assinatura">Sem anexo</span>}</td>
                  <td><div className="action-toolbar"><button className="info" onClick={() => setDetails(loss)}>Detalhes</button><Link className="ghost" to={`/perdas-tecnico/${loss.id}`}>Guia</Link></div></td>
                </tr>
              ))}
            </tbody>
          </table>
          {!loading && filtered.length === 0 && <div className="empty-state">Nenhuma perda encontrada.</div>}
          {loading && <div className="empty-state">Carregando avaliação de perdas...</div>}
        </div>
      </section>

      <DetailsModal open={!!details} title={`Avaliação ${details?.transferNumber || ''}`} onClose={() => setDetails(null)} footer={<>{details && <Link className="ghost" to={`/perdas-tecnico/${details.id}`}>Abrir guia</Link>}<button onClick={() => setDetails(null)}>Fechar</button></>}>
        {details && <>
          <DetailGrid fields={[["Guia", details.transferNumber], ["Técnico", details.Technician?.name], ["Data", details.deliveredAt], ["Motivo", extractReason(details.notes)], ["Status", details.status], ["Documento", details.attachmentName || 'Sem anexo'], ["Responsável assinatura", details.signatureResponsible], ["Qtd. total", formatQuantity(details.totalQuantity)], ["Valor total", brl(details.totalValue)], ["Observações", details.notes]]} />
          {details.attachmentName && <AttachmentPreview name={details.attachmentName} data={details.attachmentData} label="Documento de reconhecimento" />}
          <DetailList title="Materiais avaliados" items={details.TransferItems || []} render={(item) => <><b>{item.Material?.name || 'Material'}</b><span>{item.serialNumber ? `Serial ${item.serialNumber}` : <>Qtd. {formatQuantity(item.quantity)}</>} • {brl(item.totalCost)}</span>{item.serialNumber && <Link to={`/vida-serial?serial=${encodeURIComponent(item.serialNumber)}`}>Ver vida do serial</Link>}</>} />
        </>}
      </DetailsModal>
    </div>
  );
}
