/* eslint-disable react-hooks/exhaustive-deps */
import { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import api from '../services/api';
import { useAuth } from '../contexts/AuthContext';
import Modal from '../components/Modal';
import DetailsModal, { DetailGrid, DetailList } from '../components/DetailsModal';
import KpiCard from '../components/KpiCard';
import { formatQuantity, formatQuantityInput, formatQuantityLabel } from '../utils/formatQuantity';

const baseForm = { requestType: 'reposicao_carga', technicianId: '', warehouseId: '', priority: 'media', neededBy: '', requesterNotes: '', items: [] };

function brl(value) { return Number(value || 0).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' }); }
function dt(value) { return value ? new Date(value).toLocaleString('pt-BR') : '-'; }
function statusLabel(value) {
  return ({ pendente_aprovacao: 'Pendente aprovação', aprovado: 'Aprovado', entregue: 'Entregue', reprovado: 'Reprovado', cancelado: 'Cancelado' }[value] || value);
}
function requestTypeLabel(value) {
  return value === 'recarga_estoque' ? 'Recarga de estoque' : 'Carga para técnico';
}
function splitSerials(value) {
  return String(value || '').split(/\n|,|;/).map((item) => item.trim()).filter(Boolean);
}

export default function MaterialRequests() {
  const { isSupervisor, isAdmin, isTechnician, user } = useAuth();
  const [requests, setRequests] = useState([]);
  const [materials, setMaterials] = useState([]);
  const [technicians, setTechnicians] = useState([]);
  const [warehouses, setWarehouses] = useState([]);
  const [summary, setSummary] = useState({});
  const [modal, setModal] = useState(false);
  const [form, setForm] = useState(baseForm);
  const [decision, setDecision] = useState({ open: false, type: '', item: null, notes: '', items: [] });
  const [details, setDetails] = useState(null);
  const [message, setMessage] = useState('');
  const [statusFilter, setStatusFilter] = useState('');

  async function load() {
    try {
      setMessage('');
      const reqUrl = statusFilter ? `/material-requests?status=${statusFilter}` : '/material-requests';
      const [reqRes, matRes, sumRes, whRes] = await Promise.all([
        api.get(reqUrl),
        api.get('/materials'),
        api.get('/material-requests/summary'),
        api.get('/warehouses'),
      ]);
      setRequests(reqRes.data.data || []);
      setMaterials(matRes.data.data || []);
      setSummary(sumRes.data.data || {});
      setWarehouses(whRes.data.data || []);
      if (isSupervisor) setTechnicians((await api.get('/technicians')).data.data || []);
    } catch (error) {
      setMessage(error.response?.data?.message || error.message || 'Erro ao carregar solicitações.');
    }
  }

  useEffect(() => { load(); }, [statusFilter]);

  const totalValue = useMemo(() => requests.reduce((sum, r) => sum + Number(r.totalValue || 0), 0), [requests]);

  function openCreate() {
    const firstWarehouseId = warehouses[0]?.id || '';
    const nextType = isTechnician ? 'reposicao_carga' : user?.role === 'estoquista' ? 'recarga_estoque' : 'reposicao_carga';
    setForm({
      ...baseForm,
      requestType: nextType,
      technicianId: !isTechnician && nextType === 'reposicao_carga' ? technicians[0]?.id || '' : '',
      warehouseId: nextType === 'recarga_estoque' ? firstWarehouseId : '',
    });
    setModal(true);
  }

  function selectedMaterial(materialId) {
    return materials.find((m) => Number(m.id) === Number(materialId));
  }

  function addItem() {
    setForm({ ...form, items: [...form.items, { materialId: '', quantity: 1, notes: '', serialNumbersText: '' }] });
  }
  function updateItem(index, patch) {
    const items = [...form.items];
    items[index] = { ...items[index], ...patch };
    setForm({ ...form, items });
  }
  function removeItem(index) {
    setForm({ ...form, items: form.items.filter((_, i) => i !== index) });
  }

  function requestPayload() {
    const payload = {
      ...form,
      items: form.items.map((item) => ({
        ...item,
        serialNumbers: splitSerials(item.serialNumbersText),
      })),
    };
    if (isTechnician) {
      delete payload.technicianId;
      payload.requestType = 'reposicao_carga';
    }
    if (payload.requestType === 'recarga_estoque') {
      payload.technicianId = null;
    }
    return payload;
  }

  async function save(e) {
    e.preventDefault();
    const invalidItem = form.items.find((item) => !item.materialId || Number(item.quantity || 0) <= 0);
    if (!form.items.length || invalidItem) {
      setMessage('Adicione materiais, selecione o item na lista e informe uma quantidade válida.');
      return;
    }
    if (!isTechnician && form.requestType === 'reposicao_carga' && !form.technicianId) {
      setMessage('Selecione o técnico antes de enviar a solicitação.');
      return;
    }
    if (form.requestType === 'recarga_estoque' && !form.warehouseId) {
      setMessage('Selecione o estoque que receberá a recarga.');
      return;
    }
    try {
      await api.post('/material-requests', requestPayload());
      setMessage(form.requestType === 'recarga_estoque' ? 'Solicitação de recarga enviada para aprovação do admin.' : 'Solicitação enviada para aprovação.');
      setModal(false);
      setForm(baseForm);
      load();
    } catch (error) {
      setMessage(error.response?.data?.message || error.message || 'Erro ao salvar solicitação.');
    }
  }

  function openDecision(type, item) {
    const decisionItems = (item.MaterialRequestItems || []).map((requestItem) => ({
      requestItemId: requestItem.id,
      materialId: requestItem.materialId,
      materialName: requestItem.Material?.name,
      requiresSerial: !!requestItem.Material?.requiresSerial,
      approvedQuantity: formatQuantityInput(requestItem.approvedQuantity || requestItem.quantity),
      serialNumbersText: (requestItem.serialNumbers || []).join('\n'),
    }));
    setDecision({ open: true, type, item, notes: '', items: decisionItems });
  }

  function updateDecisionItem(index, patch) {
    const items = [...decision.items];
    items[index] = { ...items[index], ...patch };
    setDecision({ ...decision, items });
  }

  async function runDecision() {
    if (!decision.item) return;
    try {
      if (decision.type === 'approve') await api.post(`/material-requests/${decision.item.id}/approve`, { approvalNotes: decision.notes });
      if (decision.type === 'reject') await api.post(`/material-requests/${decision.item.id}/reject`, { approvalNotes: decision.notes });
      if (decision.type === 'deliver') {
        await api.post(`/material-requests/${decision.item.id}/deliver`, {
          logisticsNotes: decision.notes,
          items: decision.items.map((item) => ({
            requestItemId: item.requestItemId,
            approvedQuantity: item.approvedQuantity,
            serialNumbers: splitSerials(item.serialNumbersText),
          })),
        });
      }
      setMessage('Operação concluída com sucesso.');
      setDecision({ open: false, type: '', item: null, notes: '', items: [] });
      load();
    } catch (error) {
      setMessage(error.response?.data?.message || error.message || 'Erro ao processar decisão.');
    }
  }

  const canApprove = isAdmin || user?.role === 'supervisor';
  const canDeliver = ['admin', 'supervisor', 'estoquista'].includes(user?.role);

  return (
    <div className="page-grid erp-page">
      <section className="toolbar">
        <div>
          <span className="eyebrow">Workflow de carga</span>
          <h2>Solicitações de material</h2>
          <p>{isTechnician ? 'Solicite material para reposição da sua caixa técnica.' : 'Técnicos solicitam material e estoquistas solicitam recarga para seus estoques regionais.'}</p>
        </div>
        <button onClick={openCreate}>{isTechnician ? 'Solicitar material' : 'Nova solicitação'}</button>
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

      <section className="panel">
        <div className="inline filters">
          <label>Status<select value={statusFilter} onChange={(e) => setStatusFilter(e.target.value)}><option value="">Todos</option><option value="pendente_aprovacao">Pendente aprovação</option><option value="aprovado">Aprovado</option><option value="entregue">Entregue</option><option value="reprovado">Reprovado</option></select></label>
          <button className="ghost" onClick={load}>Atualizar</button>
        </div>
      </section>

      <section className="panel">
        <div className="table-wrap"><table><thead><tr><th>Número</th><th>Tipo</th><th>Destino</th><th>Status</th><th>Prioridade</th><th>Itens</th><th>Valor</th><th>Solicitado</th><th className="action-cell">Ações</th></tr></thead><tbody>{requests.map((r) => <tr key={r.id}><td><strong>{r.requestNumber}</strong><small className="block">{r.requestType}</small></td><td>{requestTypeLabel(r.requestType)}</td><td>{r.requestType === 'recarga_estoque' ? r.Warehouse?.name || '-' : r.Technician?.name || '-'}</td><td><span className={`badge ${r.status}`}>{statusLabel(r.status)}</span></td><td>{r.priority}</td><td>{formatQuantity(r.totalQuantity)}</td><td>{brl(r.totalValue)}</td><td>{dt(r.createdAt)}</td><td><div className="row-actions"><button className="info" onClick={() => setDetails(r)}>Detalhes</button>{canApprove && r.status === 'pendente_aprovacao' && <><button className="ghost" onClick={() => openDecision('approve', r)}>Aprovar</button><button className="ghost danger-outline" onClick={() => openDecision('reject', r)}>Reprovar</button></>}{canDeliver && r.status === 'aprovado' && (r.requestType === 'recarga_estoque' ? <button onClick={() => openDecision('deliver', r)}>Receber recarga</button> : <Link className="ghost" to={`/transferencias?requestId=${r.id}`}>Entregar carga</Link>)}{r.Transfer && <a className="ghost" href={`/transferencias/${r.Transfer.id}`}>Guia</a>}</div></td></tr>)}</tbody></table></div>
      </section>

      <Modal open={modal} title={isTechnician ? 'Solicitar material para minha caixa' : 'Nova solicitação de material'} onClose={() => setModal(false)} footer={<><button className="ghost" onClick={() => setModal(false)}>Cancelar</button><button onClick={save}>Enviar para aprovação</button></>}>
        <form className="form-stack" onSubmit={save}>
          <div className="form-grid">
            {!isTechnician && <label>Tipo de solicitação<select value={form.requestType} onChange={(e) => setForm({ ...form, requestType: e.target.value, technicianId: '', warehouseId: e.target.value === 'recarga_estoque' ? warehouses[0]?.id || '' : '' })}><option value="recarga_estoque">Recarga de estoque regional</option><option value="reposicao_carga">Carga para técnico</option></select></label>}
            {isTechnician && <div className="mini-card"><small>Solicitante</small><strong>{user?.name}</strong><span>Reposição da minha caixa</span></div>}
            {!isTechnician && form.requestType === 'reposicao_carga' && <label>Técnico<select value={form.technicianId} onChange={(e) => setForm({ ...form, technicianId: e.target.value })}><option value="">Selecione</option>{technicians.map((t) => <option key={t.id} value={t.id}>{t.name}</option>)}</select></label>}
            {form.requestType === 'recarga_estoque' && <label>Estoque que receberá a recarga<select value={form.warehouseId} onChange={(e) => setForm({ ...form, warehouseId: e.target.value })}><option value="">Selecione</option>{warehouses.map((w) => <option key={w.id} value={w.id}>{w.name} • {w.city} {w.state}</option>)}</select></label>}
            <label>Prioridade<select value={form.priority} onChange={(e) => setForm({ ...form, priority: e.target.value })}><option value="baixa">Baixa</option><option value="media">Média</option><option value="alta">Alta</option><option value="critica">Crítica</option></select></label>
            <label>Necessário até<input type="date" value={form.neededBy} onChange={(e) => setForm({ ...form, neededBy: e.target.value })} /></label>
          </div>
          <label>Justificativa<textarea rows="3" value={form.requesterNotes} onChange={(e) => setForm({ ...form, requesterNotes: e.target.value })} placeholder="Ex.: reposição para instalações da semana ou recarga do estoque regional" /></label>
          <div className="subtoolbar"><h4>Itens solicitados</h4><button type="button" className="ghost" onClick={addItem}>Adicionar item</button></div>
          {form.items.map((item, i) => {
            const material = selectedMaterial(item.materialId);
            return <div className="item-card" key={i}><div className="form-grid"><label>Material<select value={item.materialId} onChange={(e) => updateItem(i, { materialId: e.target.value, serialNumbersText: '' })}><option value="">Selecione o material</option>{materials.map((m) => <option key={m.id} value={m.id}>{m.name} • {m.category}</option>)}</select></label><label>Quantidade<input type="number" step="0.001" min="0" value={item.quantity} onChange={(e) => updateItem(i, { quantity: e.target.value })} /></label></div>{form.requestType === 'recarga_estoque' && material?.requiresSerial && <label>Seriais da recarga, se já souber<textarea rows="3" value={item.serialNumbersText || ''} onChange={(e) => updateItem(i, { serialNumbersText: e.target.value })} placeholder="Um serial por linha. Também pode preencher no recebimento após aprovação." /></label>}<label>Observação<input value={item.notes || ''} onChange={(e) => updateItem(i, { notes: e.target.value })} /></label><button type="button" className="ghost danger-outline" onClick={() => removeItem(i)}>Remover item</button></div>;
          })}
          {form.items.length === 0 && <div className="empty-state">Adicione materiais para enviar a solicitação.</div>}
        </form>
      </Modal>

      <DetailsModal open={!!details} title={`Detalhes da solicitação ${details?.requestNumber || ''}`} onClose={() => setDetails(null)} footer={<><button className="ghost" onClick={() => setDetails(null)}>Fechar</button>{canApprove && details?.status === 'pendente_aprovacao' && <button onClick={() => { openDecision('approve', details); setDetails(null); }}>Aprovar</button>}{canDeliver && details?.status === 'aprovado' && (details?.requestType === 'recarga_estoque' ? <button onClick={() => { openDecision('deliver', details); setDetails(null); }}>Receber recarga</button> : <Link className="ghost" to={`/transferencias?requestId=${details.id}`}>Entregar carga</Link>)}</>}>
        {details && <><DetailGrid fields={[["Número", details.requestNumber], ["Tipo", requestTypeLabel(details.requestType)], ["Destino", details.requestType === 'recarga_estoque' ? details.Warehouse?.name : details.Technician?.name], ["Status", statusLabel(details.status)], ["Prioridade", details.priority], ["Qtd. total", formatQuantity(details.totalQuantity)], ["Valor", brl(details.totalValue)], ["Necessário até", details.neededBy], ["Solicitado em", details.createdAt], ["Aprovado em", details.approvedAt], ["Entregue em", details.deliveredAt], ["Justificativa", details.requesterNotes], ["Observação aprovação", details.approvalNotes], ["Observação logística", details.logisticsNotes]]} /><DetailList title="Itens solicitados" items={details.MaterialRequestItems || []} render={(item) => <><b>{item.Material?.name || 'Material'}</b><span>Qtd. {formatQuantity(item.quantity)} • {brl(item.totalCost)} • {item.notes || 'sem observação'}</span>{(item.serialNumbers || []).length > 0 && <small>Seriais: {(item.serialNumbers || []).join(', ')}</small>}</>} />{details.Transfer && <div className="viz-callout">Guia vinculada: {details.Transfer.transferNumber}</div>}</>}
      </DetailsModal>

      <Modal open={decision.open} title={decision.type === 'approve' ? 'Aprovar solicitação' : decision.type === 'reject' ? 'Reprovar solicitação' : decision.item?.requestType === 'recarga_estoque' ? 'Receber recarga no estoque' : 'Entregar carga e gerar guia'} onClose={() => setDecision({ open: false, type: '', item: null, notes: '', items: [] })} footer={<><button className="ghost" onClick={() => setDecision({ open: false, type: '', item: null, notes: '', items: [] })}>Cancelar</button><button onClick={runDecision}>{decision.type === 'deliver' ? decision.item?.requestType === 'recarga_estoque' ? 'Receber no estoque' : 'Entregar e gerar guia' : 'Confirmar'}</button></>}>
        <p><strong>{decision.item?.requestNumber}</strong> • {decision.item?.requestType === 'recarga_estoque' ? decision.item?.Warehouse?.name : decision.item?.Technician?.name}</p>
        <label>Observação interna<textarea rows="4" value={decision.notes} onChange={(e) => setDecision({ ...decision, notes: e.target.value })} /></label>
        {decision.type === 'deliver' && decision.item?.requestType === 'recarga_estoque' && <div className="form-stack"><div className="viz-callout">A recarga aprovada será adicionada ao estoque regional selecionado. Para equipamentos serializados, informe os seriais antes de receber.</div>{decision.items.map((item, index) => <div className="item-card" key={item.requestItemId}><div className="form-grid"><div><small>Material</small><strong>{item.materialName}</strong></div><label>Quantidade recebida<input type="number" step="0.001" min="0" value={item.approvedQuantity} onChange={(e) => updateDecisionItem(index, { approvedQuantity: e.target.value })} /></label></div>{item.requiresSerial && <label>Seriais recebidos<textarea rows="4" value={item.serialNumbersText || ''} onChange={(e) => updateDecisionItem(index, { serialNumbersText: e.target.value })} placeholder="Um serial por linha" /></label>}</div>)}</div>}
        {decision.type === 'deliver' && decision.item?.requestType !== 'recarga_estoque' && <div className="viz-callout">O sistema irá movimentar os materiais do estoque regional para a caixa do técnico, criar histórico patrimonial e gerar a guia para assinatura.</div>}
      </Modal>
    </div>
  );
}
