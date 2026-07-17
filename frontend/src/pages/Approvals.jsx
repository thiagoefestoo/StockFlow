import { useEffect, useState } from 'react';
import api from '../services/api';
import Modal from '../components/Modal';
import DetailsModal, { DetailGrid } from '../components/DetailsModal';
import KpiCard from '../components/KpiCard';

function brl(value) { return Number(value || 0).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' }); }
function dt(value) { return value ? new Date(value).toLocaleString('pt-BR') : '-'; }
function approvalTypeLabel(type) {
  const labels = {
    material_request: 'Solicitação de material',
    transfer: 'Transferência de material',
    warehouse_transfer: 'Transferência entre estoques',
    service_order: 'Ordem de serviço',
    stock_adjustment: 'Ajuste de estoque',
  };
  return labels[type] || String(type || '-').replace(/_/g, ' ');
}
function payloadLabel(key) {
  const labels = {
    requestId: 'Código interno',
    requestNumber: 'Número da solicitação',
    technicianId: 'ID do técnico',
    technicianName: 'Técnico responsável',
    serviceOrderNumber: 'Número da OS',
    customerName: 'Cliente',
    customerCpf: 'CPF do cliente',
    transferNumber: 'Guia de transferência',
    materialName: 'Material',
    serialNumber: 'Número de série',
    quantity: 'Quantidade',
    items: 'Itens solicitados',
    warehouseName: 'Estoque/região',
    fromWarehouseName: 'Estoque origem',
    toWarehouseName: 'Estoque destino',
  };
  return labels[key] || String(key || '').replace(/([A-Z])/g, ' $1').replace(/_/g, ' ').replace(/^./, (c) => c.toUpperCase());
}
function payloadValue(value) {
  if (value === null || value === undefined || value === '') return '-';
  if (Array.isArray(value)) return value.length ? value.join(', ') : '-';
  if (typeof value === 'object') return Object.entries(value).map(([key, item]) => `${payloadLabel(key)}: ${payloadValue(item)}`).join(' • ');
  return String(value);
}
function OperationalInfo({ payload, requestDetails, operationalSummary }) {
  const summary = operationalSummary || {};
  const items = summary.items || requestDetails?.MaterialRequestItems || payload?.items || [];
  const rows = items.map((item) => ({
    material: item.material || item.materialName || item.Material?.name || 'Material',
    category: item.category || item.Material?.category || '-',
    quantity: item.quantity || item.approvedQuantity || 0,
    unitCost: item.unitCost || item.Material?.unitCost || 0,
    totalCost: item.totalCost || (Number(item.quantity || 0) * Number(item.unitCost || item.Material?.unitCost || 0)),
    serialNumbers: item.serialNumbers || [],
    notes: item.notes || '-',
  }));
  return (
    <div className="detail-section">
      <h4>Itens da aprovação</h4>
      <p className="detail-helper">Confira origem, destino, materiais, quantidades e seriais antes de aprovar ou reprovar.</p>
      <div className="detail-grid compact">
        <div className="detail-card"><span>Referência</span><strong>{summary.requestNumber || payload?.requestNumber || payload?.reference || '-'}</strong></div>
        <div className="detail-card"><span>Origem</span><strong>{summary.fromWarehouseName || payload?.fromWarehouse?.name || summary.technicianName || payload?.technicianName || '-'}</strong></div>
        <div className="detail-card"><span>Destino</span><strong>{summary.toWarehouseName || payload?.toWarehouse?.name || summary.warehouseName || requestDetails?.Warehouse?.name || '-'}</strong></div>
        <div className="detail-card"><span>Itens</span><strong>{rows.length}</strong></div>
      </div>
      <div className="table-wrap compact"><table><thead><tr><th>Material</th><th>Categoria</th><th>Qtd.</th><th>Valor unit.</th><th>Total</th><th>Seriais</th><th>Observação</th></tr></thead><tbody>{rows.map((item, idx) => <tr key={idx}><td><strong>{item.material}</strong></td><td>{item.category}</td><td>{item.quantity}</td><td>{brl(item.unitCost)}</td><td>{brl(item.totalCost)}</td><td>{item.serialNumbers?.length ? item.serialNumbers.join(', ') : '-'}</td><td>{item.notes}</td></tr>)}</tbody></table></div>
      {!rows.length && <div className="empty-state">Nenhum item detalhado vinculado a esta aprovação.</div>}
    </div>
  );
}


export default function Approvals() {
  const [approvals, setApprovals] = useState([]);
  const [status, setStatus] = useState('pendente');
  const [message, setMessage] = useState('');
  const [decision, setDecision] = useState({ open: false, type: '', item: null, notes: '' });
  const [details, setDetails] = useState(null);
  async function load() {
    try {
      setMessage('');
      setApprovals((await api.get(status ? `/approvals?status=${status}` : '/approvals')).data.data);
    } catch (error) {
      setMessage(error.response?.data?.message || 'Erro ao carregar aprovações.');
    }
  }
  useEffect(() => { load(); }, [status]);
  async function decide() {
    if (!decision.item) return;
    try {
      if (decision.item.entityType === 'material_request') {
        await api.post(`/material-requests/${decision.item.entityId}/${decision.type === 'approve' ? 'approve' : 'reject'}`, { approvalNotes: decision.notes });
      } else if (decision.item.entityType === 'warehouse_transfer') {
        await api.post(`/approvals/${decision.item.id}/${decision.type === 'approve' ? 'approve' : 'reject'}`, { notes: decision.notes });
      }
      setMessage('Decisão registrada com sucesso.');
      setDecision({ open: false, type: '', item: null, notes: '' });
      load();
    } catch (error) {
      setMessage(error.response?.data?.message || 'Erro ao registrar decisão.');
    }
  }
  const pending = approvals.filter((a) => a.status === 'pendente').length;
  const approved = approvals.filter((a) => a.status === 'aprovado').length;
  const rejected = approvals.filter((a) => a.status === 'reprovado').length;
  return (
    <div className="page-grid erp-page">
      <section className="toolbar"><div><span className="eyebrow">Governança operacional</span><h2>Central de aprovações</h2><p>Aprovações de solicitação de material, reposição de carga, separação e controle de exceções.</p></div><button onClick={load}>Atualizar</button></section>
      {message && <div className="alert danger">{message}</div>}
      <div className="kpi-grid small"><KpiCard label="Pendentes" value={pending} tone={pending ? 'warning' : 'success'} /><KpiCard label="Aprovadas na visão" value={approved} tone="success" /><KpiCard label="Reprovadas na visão" value={rejected} /></div>
      <section className="panel"><label>Status<select value={status} onChange={(e) => setStatus(e.target.value)}><option value="pendente">Pendentes</option><option value="aprovado">Aprovadas</option><option value="reprovado">Reprovadas</option><option value="">Todas</option></select></label></section>
      <section className="panel">
        <div className="approval-list">
          {approvals.map((a) => (
            <article className="approval-card" key={a.id}>
              <div>
                <span className={`badge ${a.status}`}>{a.status}</span>
                <h3>{a.title}</h3>
                <p>{a.description}</p>
                <small>Solicitado por {a.requestedBy?.name || '-'} em {dt(a.requestedAt)}</small>
              </div>
              <div className="approval-side">
                <strong>{brl(a.amount)}</strong>
                <span>Prioridade: {a.priority}</span>
                {a.payload?.technicianName && <span>Técnico: {a.payload.technicianName}</span>}
                <div className="row-actions"><button className="info" onClick={() => setDetails(a)}>Detalhes</button>{a.status === 'pendente' && <><button onClick={() => setDecision({ open: true, type: 'approve', item: a, notes: '' })}>Aprovar</button><button className="ghost danger-outline" onClick={() => setDecision({ open: true, type: 'reject', item: a, notes: '' })}>Reprovar</button></>}</div>
              </div>
            </article>
          ))}
          {approvals.length === 0 && <div className="empty-state">Nenhuma aprovação encontrada nesse filtro.</div>}
        </div>
      </section>

      <DetailsModal open={!!details} title={`Detalhes da aprovação ${details?.title || ''}`} onClose={() => setDetails(null)} footer={<><button className="ghost" onClick={() => setDetails(null)}>Fechar</button>{details?.status === 'pendente' && <button onClick={() => { setDecision({ open: true, type: 'approve', item: details, notes: '' }); setDetails(null); }}>Aprovar</button>}</>}>
        {details && <><DetailGrid fields={[["Título", details.title], ["Descrição", details.description], ["Status", details.status], ["Prioridade", details.priority], ["Valor", brl(details.amount)], ["Tipo", approvalTypeLabel(details.entityType)], ["Código interno", details.entityId], ["Solicitado por", details.requestedBy?.name], ["Solicitado em", dt(details.requestedAt)], ["Decidido em", dt(details.decidedAt)], ["Decidido por", details.decidedBy?.name], ["Observação", details.decisionNotes]]} /><OperationalInfo payload={details.payload} requestDetails={details.requestDetails} operationalSummary={details.operationalSummary} /></>}
      </DetailsModal>
      <Modal open={decision.open} title={decision.type === 'approve' ? 'Aprovar item' : 'Reprovar item'} onClose={() => setDecision({ open: false, type: '', item: null, notes: '' })} footer={<><button className="ghost" onClick={() => setDecision({ open: false, type: '', item: null, notes: '' })}>Cancelar</button><button onClick={decide}>Registrar decisão</button></>}>
        <p><strong>{decision.item?.title}</strong></p>
        <label>Justificativa/observação<textarea rows="4" value={decision.notes} onChange={(e) => setDecision({ ...decision, notes: e.target.value })} /></label>
      </Modal>
    </div>
  );
}
