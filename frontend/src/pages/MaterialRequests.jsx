/* eslint-disable react-hooks/exhaustive-deps */
import { useEffect, useMemo, useState } from 'react';
import api from '../services/api';
import { useAuth } from '../contexts/AuthContext';
import Modal from '../components/Modal';
import DetailsModal, { DetailGrid, DetailList } from '../components/DetailsModal';
import KpiCard from '../components/KpiCard';

const emptyForm = { technicianId: '', priority: 'media', neededBy: '', requesterNotes: '', items: [] };
function brl(value) { return Number(value || 0).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' }); }
function dt(value) { return value ? new Date(value).toLocaleString('pt-BR') : '-'; }
function statusLabel(value) {
  return ({ pendente_aprovacao: 'Pendente aprovação', aprovado: 'Aprovado', entregue: 'Entregue', reprovado: 'Reprovado', cancelado: 'Cancelado' }[value] || value);
}

export default function MaterialRequests() {
  const { isSupervisor, user } = useAuth();
  const [requests, setRequests] = useState([]);
  const [materials, setMaterials] = useState([]);
  const [technicians, setTechnicians] = useState([]);
  const [summary, setSummary] = useState({});
  const [modal, setModal] = useState(false);
  const [form, setForm] = useState(emptyForm);
  const [decision, setDecision] = useState({ open: false, type: '', item: null, notes: '' });
  const [details, setDetails] = useState(null);
  const [message, setMessage] = useState('');
  const [statusFilter, setStatusFilter] = useState('');

  async function load() {
    try {
      setMessage('');
      const [reqRes, matRes, sumRes] = await Promise.all([
        api.get(statusFilter ? `/material-requests?status=${statusFilter}` : '/material-requests'),
        api.get('/materials'),
        api.get('/material-requests/summary'),
      ]);
      setRequests(reqRes.data.data);
      setMaterials(matRes.data.data);
      setSummary(sumRes.data.data || {});
      if (isSupervisor) setTechnicians((await api.get('/technicians')).data.data);
    } catch (error) {
      setMessage(error.response?.data?.message || error.message || 'Erro ao carregar solicitações.');
    }
  }
  useEffect(() => { load(); }, [statusFilter]);

  function addItem() {
    setForm({ ...form, items: [...form.items, { materialId: materials[0]?.id || '', quantity: 1, notes: '' }] });
  }
  function updateItem(index, patch) {
    const items = [...form.items];
    items[index] = { ...items[index], ...patch };
    setForm({ ...form, items });
  }
  function removeItem(index) {
    setForm({ ...form, items: form.items.filter((_, i) => i !== index) });
  }
  async function save(e) {
    e.preventDefault();
    try {
      await api.post('/material-requests', form);
      setMessage('Solicitação enviada para aprovação.');
      setModal(false);
      setForm(emptyForm);
      load();
    } catch (error) {
      setMessage(error.response?.data?.message || error.message || 'Erro ao salvar solicitação.');
    }
  }
  async function runDecision() {
    if (!decision.item) return;
    try {
      if (decision.type === 'approve') await api.post(`/material-requests/${decision.item.id}/approve`, { approvalNotes: decision.notes });
      if (decision.type === 'reject') await api.post(`/material-requests/${decision.item.id}/reject`, { approvalNotes: decision.notes });
      if (decision.type === 'deliver') await api.post(`/material-requests/${decision.item.id}/deliver`, { logisticsNotes: decision.notes });
      setMessage('Operação concluída com sucesso.');
      setDecision({ open: false, type: '', item: null, notes: '' });
      load();
    } catch (error) {
      setMessage(error.response?.data?.message || error.message || 'Erro ao processar decisão.');
    }
  }

  const totalValue = useMemo(() => requests.reduce((sum, r) => sum + Number(r.totalValue || 0), 0), [requests]);
  const defaultTechId = form.technicianId || technicians[0]?.id || '';

  return (
    <div className="page-grid erp-page">
      <section className="toolbar">
        <div><span className="eyebrow">Workflow de carga</span><h2>Solicitações de material</h2><p>Fluxo tipo ERP: técnico solicita, supervisor aprova, estoque separa e a guia é gerada automaticamente.</p></div>
        <button onClick={() => { setForm({ ...emptyForm, technicianId: defaultTechId }); setModal(true); }}>Nova solicitação</button>
      </section>
      {message && <div className="alert danger">{message}</div>}
      <div className="kpi-grid">
        <KpiCard label="Pendentes" value={summary.pending || 0} tone={summary.pending ? 'warning' : 'success'} />
        <KpiCard label="Aprovadas" value={summary.approved || 0} />
        <KpiCard label="Entregues" value={summary.delivered || 0} tone="success" />
        <KpiCard label="Reprovadas" value={summary.rejected || 0} />
        <KpiCard label="Solicitações" value={summary.total || 0} />
        <KpiCard label="Valor exibido" value={brl(totalValue)} />
      </div>
      <section className="panel"><div className="inline filters"><label>Status<select value={statusFilter} onChange={(e) => setStatusFilter(e.target.value)}><option value="">Todos</option><option value="pendente_aprovacao">Pendente aprovação</option><option value="aprovado">Aprovado</option><option value="entregue">Entregue</option><option value="reprovado">Reprovado</option></select></label><button className="ghost" onClick={load}>Atualizar</button></div></section>
      <section className="panel">
        <div className="table-wrap"><table><thead><tr><th>Número</th><th>Técnico</th><th>Status</th><th>Prioridade</th><th>Itens</th><th>Valor</th><th>Solicitado</th><th className="action-cell">Ações</th></tr></thead><tbody>{requests.map((r) => <tr key={r.id}><td><strong>{r.requestNumber}</strong><small className="block">{r.requestType}</small></td><td>{r.Technician?.name || '-'}</td><td><span className={`badge ${r.status}`}>{statusLabel(r.status)}</span></td><td>{r.priority}</td><td>{Number(r.totalQuantity || 0)}</td><td>{brl(r.totalValue)}</td><td>{dt(r.createdAt)}</td><td><div className="row-actions"><button className="info" onClick={() => setDetails(r)}>Detalhes</button>{isSupervisor && r.status === 'pendente_aprovacao' && <><button className="ghost" onClick={() => setDecision({ open: true, type: 'approve', item: r, notes: '' })}>Aprovar</button><button className="ghost danger-outline" onClick={() => setDecision({ open: true, type: 'reject', item: r, notes: '' })}>Reprovar</button></>}{isSupervisor && r.status === 'aprovado' && <button onClick={() => setDecision({ open: true, type: 'deliver', item: r, notes: '' })}>Entregar carga</button>}{r.Transfer && <a className="ghost" href={`/transferencias/${r.Transfer.id}`}>Guia</a>}</div></td></tr>)}</tbody></table></div>
      </section>
      <Modal open={modal} title="Nova solicitação de material" onClose={() => setModal(false)} footer={<><button className="ghost" onClick={() => setModal(false)}>Cancelar</button><button onClick={save}>Enviar para aprovação</button></>}>
        <form className="form-stack" onSubmit={save}>
          <div className="form-grid">
            {isSupervisor && <label>Técnico<select value={form.technicianId} onChange={(e) => setForm({ ...form, technicianId: e.target.value })}><option value="">Selecione</option>{technicians.map((t) => <option key={t.id} value={t.id}>{t.name}</option>)}</select></label>}
            {!isSupervisor && <div className="mini-card"><small>Solicitante</small><strong>{user?.name}</strong></div>}
            <label>Prioridade<select value={form.priority} onChange={(e) => setForm({ ...form, priority: e.target.value })}><option value="baixa">Baixa</option><option value="media">Média</option><option value="alta">Alta</option><option value="critica">Crítica</option></select></label>
            <label>Necessário até<input type="date" value={form.neededBy} onChange={(e) => setForm({ ...form, neededBy: e.target.value })} /></label>
          </div>
          <label>Justificativa<textarea rows="3" value={form.requesterNotes} onChange={(e) => setForm({ ...form, requesterNotes: e.target.value })} placeholder="Ex.: reposição de carga para instalações da semana" /></label>
          <div className="subtoolbar"><h4>Itens solicitados</h4><button type="button" className="ghost" onClick={addItem}>Adicionar item</button></div>
          {form.items.map((item, i) => <div className="item-card" key={i}><div className="form-grid"><label>Material<select value={item.materialId} onChange={(e) => updateItem(i, { materialId: e.target.value })}>{materials.map((m) => <option key={m.id} value={m.id}>{m.name} • estoque {m.mainStock}</option>)}</select></label><label>Quantidade<input type="number" step="0.001" min="0" value={item.quantity} onChange={(e) => updateItem(i, { quantity: e.target.value })} /></label></div><label>Observação<input value={item.notes || ''} onChange={(e) => updateItem(i, { notes: e.target.value })} /></label><button type="button" className="ghost danger-outline" onClick={() => removeItem(i)}>Remover item</button></div>)}
          {form.items.length === 0 && <div className="empty-state">Adicione materiais para enviar a solicitação.</div>}
        </form>
      </Modal>

      <DetailsModal open={!!details} title={`Detalhes da solicitação ${details?.requestNumber || ''}`} onClose={() => setDetails(null)} footer={<><button className="ghost" onClick={() => setDetails(null)}>Fechar</button>{isSupervisor && details?.status === 'pendente_aprovacao' && <button onClick={() => { setDecision({ open: true, type: 'approve', item: details, notes: '' }); setDetails(null); }}>Aprovar</button>}{isSupervisor && details?.status === 'aprovado' && <button onClick={() => { setDecision({ open: true, type: 'deliver', item: details, notes: '' }); setDetails(null); }}>Entregar carga</button>}</>}>
        {details && <><DetailGrid fields={[["Número", details.requestNumber], ["Técnico", details.Technician?.name], ["Status", statusLabel(details.status)], ["Prioridade", details.priority], ["Qtd. total", details.totalQuantity], ["Valor", brl(details.totalValue)], ["Necessário até", details.neededBy], ["Solicitado em", details.createdAt], ["Aprovado em", details.approvedAt], ["Entregue em", details.deliveredAt], ["Justificativa", details.requesterNotes], ["Observação aprovação", details.approvalNotes], ["Observação logística", details.logisticsNotes]]} /><DetailList title="Itens solicitados" items={details.MaterialRequestItems || []} render={(item) => <><b>{item.Material?.name || 'Material'}</b><span>Qtd. {item.quantity} • {brl(item.totalCost)} • {item.notes || 'sem observação'}</span></>} />{details.Transfer && <div className="viz-callout">Guia vinculada: {details.Transfer.transferNumber}</div>}</>}
      </DetailsModal>
      <Modal open={decision.open} title={decision.type === 'approve' ? 'Aprovar solicitação' : decision.type === 'reject' ? 'Reprovar solicitação' : 'Entregar carga e gerar guia'} onClose={() => setDecision({ open: false, type: '', item: null, notes: '' })} footer={<><button className="ghost" onClick={() => setDecision({ open: false, type: '', item: null, notes: '' })}>Cancelar</button><button onClick={runDecision}>{decision.type === 'deliver' ? 'Entregar e gerar guia' : 'Confirmar'}</button></>}>
        <p><strong>{decision.item?.requestNumber}</strong> • {decision.item?.Technician?.name}</p>
        <label>Observação interna<textarea rows="4" value={decision.notes} onChange={(e) => setDecision({ ...decision, notes: e.target.value })} /></label>
        {decision.type === 'deliver' && <div className="viz-callout">O sistema irá movimentar os materiais do estoque para a caixa do técnico, criar o histórico patrimonial e gerar a guia para assinatura.</div>}
      </Modal>
    </div>
  );
}
