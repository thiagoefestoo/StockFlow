/* eslint-disable react-hooks/exhaustive-deps */
import { useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import api from '../services/api';
import { useAuth } from '../contexts/AuthContext';
import Modal from '../components/Modal';
import DetailsModal, { DetailGrid, DetailList } from '../components/DetailsModal';
import KpiCard from '../components/KpiCard';
import { formatQuantity, formatQuantityInput, formatQuantityLabel } from '../utils/formatQuantity';
import { MATERIAL_REQUEST_JUSTIFICATION_OPTIONS } from '../constants/operationOptions';
import FloatingAlert from '../components/FloatingAlert';
import { duplicateItemIds, optionsWithoutSelected } from '../utils/operationSelections';

const baseForm = { requestType: 'reposicao_carga', technicianId: '', warehouseId: '', priority: 'media', neededBy: '', requesterNotes: '', items: [] };

function brl(value) { return Number(value || 0).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' }); }
function dt(value) { return value ? new Date(value).toLocaleString('pt-BR') : '-'; }
function statusLabel(value) {
  return ({ pendente_aprovacao: 'Pendente aprovação', aprovado: 'Aprovado', entregue: 'Entregue', reprovado: 'Reprovado', cancelado: 'Cancelado' }[value] || value);
}
function requestTypeLabel(value) {
  return value === 'recarga_estoque' ? 'Recarga de estoque' : 'Carga para técnico';
}
function priorityLabel(value) {
  return ({ baixa: 'Baixa', media: 'Média', alta: 'Alta', critica: 'Crítica' }[value] || value || '-');
}
function dateOnlyLabel(value) {
  if (!value) return 'Não informado';
  const [year, month, day] = String(value).split('-');
  return year && month && day ? `${day}/${month}/${year}` : value;
}
function splitSerials(value) {
  return String(value || '').split(/\n|,|;/).map((item) => item.trim()).filter(Boolean);
}

function justificationOptions(requestType) {
  return MATERIAL_REQUEST_JUSTIFICATION_OPTIONS[requestType] || MATERIAL_REQUEST_JUSTIFICATION_OPTIONS.reposicao_carga;
}

export default function MaterialRequests() {
  const { isSupervisor, isAdmin, isTechnician, user, canAccessModule } = useAuth();
  const navigate = useNavigate();
  const [requests, setRequests] = useState([]);
  const [materials, setMaterials] = useState([]);
  const [technicians, setTechnicians] = useState([]);
  const [warehouses, setWarehouses] = useState([]);
  const [summary, setSummary] = useState({});
  const [modal, setModal] = useState(false);
  const [form, setForm] = useState(baseForm);
  const [decision, setDecision] = useState({ open: false, type: '', item: null, notes: '', items: [] });
  const [details, setDetails] = useState(null);
  const [message, setMessage] = useState({ text: '', type: 'danger' });
  const [statusFilter, setStatusFilter] = useState('');
  const [confirmRequestOpen, setConfirmRequestOpen] = useState(false);
  const [submittingRequest, setSubmittingRequest] = useState(false);

  async function load() {
    try {
      setMessage({ text: '', type: 'danger' });
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
      setMessage({ text: error.response?.data?.message || error.message || 'Erro ao carregar solicitações.', type: 'danger' });
    }
  }

  useEffect(() => { load(); }, [statusFilter]);

  const totalValue = useMemo(() => requests.reduce((sum, r) => sum + Number(r.totalValue || 0), 0), [requests]);
  const requestReview = useMemo(() => {
    const reviewItems = form.items.map((item) => {
      const material = materials.find((row) => Number(row.id) === Number(item.materialId));
      const quantity = Number(item.quantity || 0);
      const unitCost = Number(material?.unitCost || 0);
      const serials = splitSerials(item.serialNumbersText);
      return {
        key: `${item.materialId}-${material?.name || 'material'}-${quantity}`,
        name: material?.name || 'Material não identificado',
        category: material?.category || '-',
        unit: material?.unit || 'un',
        quantity,
        unitCost,
        totalCost: quantity * unitCost,
        serialCount: serials.length,
        requiresSerial: !!material?.requiresSerial,
      };
    });
    const destination = form.requestType === 'recarga_estoque'
      ? warehouses.find((warehouse) => String(warehouse.id) === String(form.warehouseId))
      : isTechnician
        ? { name: user?.name || 'Minha caixa técnica' }
        : technicians.find((technician) => String(technician.id) === String(form.technicianId));
    return {
      items: reviewItems,
      destination: form.requestType === 'recarga_estoque'
        ? [destination?.name, destination?.city, destination?.state].filter(Boolean).join(' • ') || '-'
        : destination?.name || '-',
      totalQuantity: reviewItems.reduce((sum, item) => sum + item.quantity, 0),
      totalValue: reviewItems.reduce((sum, item) => sum + item.totalCost, 0),
    };
  }, [form, materials, warehouses, technicians, isTechnician, user?.name]);

  function openCreate() {
    setForm({
      ...baseForm,
      requestType: 'reposicao_carga',
      technicianId: !isTechnician ? technicians[0]?.id || '' : '',
      warehouseId: '',
      items: [{ materialId: '', quantity: 1, serialNumbersText: '' }],
    });
    setModal(true);
  }

  function addItem() {
    setForm({ ...form, items: [...form.items, { materialId: '', quantity: 1, serialNumbersText: '' }] });
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
    const repeatedMaterials = duplicateItemIds(form.items);
    if (repeatedMaterials.length) {
      setMessage({ text: 'O mesmo material não pode ser selecionado mais de uma vez na solicitação.', type: 'danger' });
      return;
    }
    if (!form.items.length || invalidItem) {
      setMessage({ text: 'Adicione materiais, selecione o item na lista e informe uma quantidade válida.', type: 'danger' });
      return;
    }
    if (!isTechnician && form.requestType === 'reposicao_carga' && !form.technicianId) {
      setMessage({ text: 'Selecione o técnico antes de enviar a solicitação.', type: 'danger' });
      return;
    }
    if (form.requestType === 'recarga_estoque' && !form.warehouseId) {
      setMessage({ text: 'Selecione o estoque que receberá a recarga.', type: 'danger' });
      return;
    }
    if (!form.requesterNotes) {
      setMessage({ text: 'Selecione uma justificativa para a solicitação.', type: 'danger' });
      return;
    }
    setModal(false);
    setConfirmRequestOpen(true);
  }

  async function confirmRequestSubmission() {
    if (submittingRequest) return;
    setSubmittingRequest(true);
    try {
      const response = await api.post('/material-requests', requestPayload());
      setMessage({ text: response.data?.message || (form.requestType === 'recarga_estoque' ? 'Solicitação de recarga enviada para aprovação.' : 'Solicitação registrada.'), type: 'success' });
      setConfirmRequestOpen(false);
      setModal(false);
      setForm(baseForm);
      await load();
    } catch (error) {
      setMessage({ text: error.response?.data?.message || error.message || 'Erro ao salvar solicitação.', type: 'danger' });
      setConfirmRequestOpen(false);
      setModal(true);
    } finally {
      setSubmittingRequest(false);
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
      setMessage({ text: 'Operação concluída com sucesso.', type: 'success' });
      setDecision({ open: false, type: '', item: null, notes: '', items: [] });
      load();
    } catch (error) {
      setMessage({ text: error.response?.data?.message || error.message || 'Erro ao processar decisão.', type: 'danger' });
    }
  }

  function openTransferForRequest(request) {
    if (!request?.id) return;
    setDetails(null);
    navigate(`/transferencias?requestId=${request.id}`);
  }

  function canApproveRequest(request) {
    if (!request || !canAccessModule('approvals')) return false;
    if (isAdmin) return true;
    const approvalLimit = Number(user?.approvalLimit || 0);
    return approvalLimit > 0 && Number(request.totalValue || 0) <= approvalLimit;
  }
  const canApprove = isAdmin || canAccessModule('approvals');
  const canReceiveRecharge = ['admin', 'supervisor', 'estoquista'].includes(user?.role);
  const canDeliverTechnicianLoad = isAdmin || (canAccessModule('materialRequestDelivery') && canAccessModule('transfers'));

  return (
    <div className="page-grid erp-page">
      <section className="toolbar">
        <div>
          <span className="eyebrow">Workflow de carga</span>
          <h2>Solicitações de material</h2>
          <p>{isTechnician ? 'Solicite material para reposição da sua caixa técnica.' : 'Registre cargas de material destinadas aos técnicos.'}</p>
        </div>
        <button onClick={openCreate}>{isTechnician ? 'Solicitar material' : 'Nova solicitação'}</button>
      </section>

      <FloatingAlert message={message.text} type={message.type} onClose={() => setMessage({ text: '', type: 'danger' })} />

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
        <div className="table-wrap"><table><thead><tr><th>Número</th><th>Tipo</th><th>Destino</th><th>Status</th><th>Prioridade</th><th>Itens</th><th>Valor</th><th>Solicitado</th><th className="action-cell">Ações</th></tr></thead><tbody>{requests.map((r) => <tr key={r.id}><td><strong>{r.requestNumber}</strong><small className="block">{r.requestType}</small></td><td>{requestTypeLabel(r.requestType)}</td><td>{r.requestType === 'recarga_estoque' ? r.Warehouse?.name || '-' : r.Technician?.name || '-'}</td><td><span className={`badge ${r.status}`}>{statusLabel(r.status)}</span></td><td>{r.priority}</td><td>{formatQuantity(r.totalQuantity)}</td><td>{brl(r.totalValue)}</td><td>{dt(r.createdAt)}</td><td><div className="row-actions"><button className="info" onClick={() => setDetails(r)}>Detalhes</button>{canApprove && r.status === 'pendente_aprovacao' && <><button className="ghost" disabled={!canApproveRequest(r)} title={!canApproveRequest(r) ? 'Valor acima do seu limite de aprovação.' : ''} onClick={() => openDecision('approve', r)}>Aprovar</button><button className="ghost danger-outline" disabled={!canApproveRequest(r)} onClick={() => openDecision('reject', r)}>Reprovar</button></>}{r.status === 'aprovado' && (r.requestType === 'recarga_estoque' ? canReceiveRecharge && <button onClick={() => openDecision('deliver', r)}>Receber recarga</button> : canDeliverTechnicianLoad && <button onClick={() => openTransferForRequest(r)}>Entregar carga</button>)}{r.Transfer && <a className="ghost" href={`/transferencias/${r.Transfer.id}`}>Guia</a>}</div></td></tr>)}</tbody></table></div>
      </section>

      <Modal open={modal} title={isTechnician ? 'Solicitar material para minha caixa' : 'Nova solicitação de material'} onClose={() => setModal(false)} footer={<><button className="ghost" onClick={() => setModal(false)}>Cancelar</button><button onClick={save}>Enviar solicitação</button></>}>
        <form className="form-stack" onSubmit={save}>
          <div className="form-grid">
            {!isTechnician && <div className="mini-card"><small>Tipo de solicitação</small><strong>Carga para técnico</strong><span>A recarga de estoque regional não é criada nesta tela.</span></div>}
            {isTechnician && <div className="mini-card"><small>Solicitante</small><strong>{user?.name}</strong><span>Reposição da minha caixa</span></div>}
            {!isTechnician && <label>Técnico<select value={form.technicianId} onChange={(e) => setForm({ ...form, technicianId: e.target.value })}><option value="">Selecione</option>{technicians.map((t) => <option key={t.id} value={t.id}>{t.name}</option>)}</select></label>}
            <label>Prioridade<select value={form.priority} onChange={(e) => setForm({ ...form, priority: e.target.value })}><option value="baixa">Baixa</option><option value="media">Média</option><option value="alta">Alta</option><option value="critica">Crítica</option></select></label>
            <label>Necessário até<input type="date" value={form.neededBy} onChange={(e) => setForm({ ...form, neededBy: e.target.value })} /></label>
          </div>
          <label>Justificativa<select value={form.requesterNotes} onChange={(e) => setForm({ ...form, requesterNotes: e.target.value })} required><option value="">Selecione uma justificativa</option>{justificationOptions(form.requestType).map((option) => <option key={option} value={option}>{option}</option>)}</select></label>
          <div className="subtoolbar"><h4>Itens solicitados</h4><button type="button" className="ghost" onClick={addItem}>Adicionar item</button></div>
          {form.items.map((item, i) => {
            const availableMaterials = optionsWithoutSelected(materials, form.items, i);
            return <div className="item-card" key={i}><div className="form-grid"><label>Material<select value={item.materialId} onChange={(e) => updateItem(i, { materialId: e.target.value, serialNumbersText: '' })}><option value="">Selecionar item</option>{availableMaterials.map((m) => <option key={m.id} value={m.id}>{m.name} • {m.category}</option>)}</select></label><label>Quantidade<input type="number" step="1" min="1" value={item.quantity} onChange={(e) => updateItem(i, { quantity: e.target.value })} /></label></div><button type="button" className="ghost danger-outline" onClick={() => removeItem(i)}>Remover item</button></div>;
          })}
          {form.items.length === 0 && <div className="empty-state">Adicione materiais para enviar a solicitação.</div>}
        </form>
      </Modal>

      <DetailsModal open={!!details} title={`Detalhes da solicitação ${details?.requestNumber || ''}`} onClose={() => setDetails(null)} footer={<><button className="ghost" onClick={() => setDetails(null)}>Fechar</button>{canApprove && details?.status === 'pendente_aprovacao' && <button disabled={!canApproveRequest(details)} onClick={() => { openDecision('approve', details); setDetails(null); }}>Aprovar</button>}{details?.status === 'aprovado' && (details?.requestType === 'recarga_estoque' ? canReceiveRecharge && <button onClick={() => { openDecision('deliver', details); setDetails(null); }}>Receber recarga</button> : canDeliverTechnicianLoad && <button onClick={() => openTransferForRequest(details)}>Entregar carga</button>)}</>}>
        {details && <><DetailGrid fields={[["Número", details.requestNumber], ["Tipo", requestTypeLabel(details.requestType)], ["Destino", details.requestType === 'recarga_estoque' ? details.Warehouse?.name : details.Technician?.name], ["Status", statusLabel(details.status)], ["Prioridade", details.priority], ["Qtd. total", formatQuantity(details.totalQuantity)], ["Valor", brl(details.totalValue)], ["Necessário até", details.neededBy], ["Solicitado em", details.createdAt], ["Aprovado em", details.approvedAt], ["Entregue em", details.deliveredAt], ["Justificativa", details.requesterNotes], ["Observação aprovação", details.approvalNotes], ["Observação logística", details.logisticsNotes]]} /><DetailList title="Itens solicitados" items={details.MaterialRequestItems || []} render={(item) => <><b>{item.Material?.name || 'Material'}</b><span>Qtd. {formatQuantity(item.quantity)} • {brl(item.totalCost)}</span>{(item.serialNumbers || []).length > 0 && <small>Seriais: {(item.serialNumbers || []).join(', ')}</small>}</>} />{details.Transfer && <div className="viz-callout">Guia vinculada: {details.Transfer.transferNumber}</div>}</>}
      </DetailsModal>

      <Modal
        open={confirmRequestOpen}
        title="Revise e confirme a solicitação"
        onClose={() => { if (!submittingRequest) { setConfirmRequestOpen(false); setModal(true); } }}
        footer={<>
          <button type="button" className="ghost" disabled={submittingRequest} onClick={() => { setConfirmRequestOpen(false); setModal(true); }}>Não, voltar</button>
          <button type="button" disabled={submittingRequest} onClick={confirmRequestSubmission}>{submittingRequest ? 'Enviando...' : 'Sim, confirmar solicitação'}</button>
        </>}
      >
        <div className="form-stack">
          <div>
            <h4>Deseja realmente solicitar este material?</h4>
            <p>Confira o resumo completo antes de confirmar.</p>
          </div>
          <div className="detail-grid compact">
            <div className="detail-card"><span>Tipo de solicitação</span><strong>{requestTypeLabel(form.requestType)}</strong></div>
            <div className="detail-card"><span>Destino</span><strong>{requestReview.destination}</strong></div>
            <div className="detail-card"><span>Prioridade</span><strong>{priorityLabel(form.priority)}</strong></div>
            <div className="detail-card"><span>Necessário até</span><strong>{dateOnlyLabel(form.neededBy)}</strong></div>
            <div className="detail-card"><span>Quantidade total</span><strong>{formatQuantity(requestReview.totalQuantity)}</strong></div>
            <div className="detail-card"><span>Valor estimado</span><strong>{brl(requestReview.totalValue)}</strong></div>
          </div>

          <div className="item-card">
            <small>Justificativa</small>
            <strong>{form.requesterNotes || '-'}</strong>
          </div>

          <div>
            <div className="subtoolbar"><h4>Itens solicitados</h4><span>{requestReview.items.length} item(ns)</span></div>
            <div className="table-wrap request-review-table">
              <table>
                <thead><tr><th>Material</th><th>Categoria</th><th>Quantidade</th><th>Valor unitário</th><th>Subtotal</th><th>Seriais</th></tr></thead>
                <tbody>
                  {requestReview.items.map((item, index) => <tr key={`${item.key}-${index}`}>
                    <td><strong>{item.name}</strong><small className="block">Unidade: {item.unit}</small></td>
                    <td>{item.category}</td>
                    <td><strong>{formatQuantity(item.quantity)}</strong></td>
                    <td>{brl(item.unitCost)}</td>
                    <td><strong>{brl(item.totalCost)}</strong></td>
                    <td>{item.requiresSerial ? `${formatQuantity(item.serialCount)} informado(s)` : 'Não se aplica'}</td>
                  </tr>)}
                </tbody>
              </table>
            </div>
          </div>

          <div className="viz-callout">Ao confirmar, o pedido será enviado para o fluxo de aprovação e entrega configurado no sistema.</div>
        </div>
      </Modal>

      <Modal open={decision.open} title={decision.type === 'approve' ? 'Aprovar solicitação' : decision.type === 'reject' ? 'Reprovar solicitação' : decision.item?.requestType === 'recarga_estoque' ? 'Receber recarga no estoque' : 'Entregar carga e gerar guia'} onClose={() => setDecision({ open: false, type: '', item: null, notes: '', items: [] })} footer={<><button className="ghost" onClick={() => setDecision({ open: false, type: '', item: null, notes: '', items: [] })}>Cancelar</button><button onClick={runDecision}>{decision.type === 'deliver' ? decision.item?.requestType === 'recarga_estoque' ? 'Receber no estoque' : 'Entregar e gerar guia' : 'Confirmar'}</button></>}>
        <p><strong>{decision.item?.requestNumber}</strong> • {decision.item?.requestType === 'recarga_estoque' ? decision.item?.Warehouse?.name : decision.item?.Technician?.name}</p>
        {['approve', 'reject'].includes(decision.type) && <div className="detail-grid compact"><div className="detail-card"><span>Valor solicitado</span><strong>{brl(decision.item?.totalValue)}</strong></div><div className="detail-card"><span>Limite do técnico sem aprovação</span><strong>{brl(decision.item?.metadata?.technicianApprovalLimit)}</strong></div><div className="detail-card"><span>Seu limite de aprovação</span><strong>{isAdmin ? 'Sem limite' : brl(user?.approvalLimit)}</strong></div></div>}
        <label>Observação interna<textarea rows="4" value={decision.notes} onChange={(e) => setDecision({ ...decision, notes: e.target.value })} /></label>
        {decision.type === 'deliver' && decision.item?.requestType === 'recarga_estoque' && <div className="form-stack"><div className="viz-callout">A recarga aprovada será adicionada ao estoque regional selecionado. Para equipamentos serializados, informe os seriais antes de receber.</div>{decision.items.map((item, index) => <div className="item-card" key={item.requestItemId}><div className="form-grid"><div><small>Material</small><strong>{item.materialName}</strong></div><label>Quantidade recebida<input type="number" step="1" min="0" value={item.approvedQuantity} onChange={(e) => updateDecisionItem(index, { approvedQuantity: e.target.value })} /></label></div>{item.requiresSerial && <label>Seriais recebidos<textarea rows="4" value={item.serialNumbersText || ''} onChange={(e) => updateDecisionItem(index, { serialNumbersText: e.target.value })} placeholder="Um serial por linha" /></label>}</div>)}</div>}
      </Modal>
    </div>
  );
}
