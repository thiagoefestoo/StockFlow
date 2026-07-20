/* eslint-disable react-hooks/exhaustive-deps */
import { useEffect, useState } from 'react';
import api from '../services/api';
import Modal from '../components/Modal';
import DetailsModal, { DetailGrid, DetailList } from '../components/DetailsModal';
import { useAuth } from '../contexts/AuthContext';
import { formatQuantity, formatQuantityInput, formatQuantityLabel } from '../utils/formatQuantity';

function brl(value) { return Number(value || 0).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' }); }
function dt(value) { return value ? new Date(value).toLocaleString('pt-BR') : '-'; }

export default function ServiceOrders() {
  const { isAdmin } = useAuth();
  const [orders, setOrders] = useState([]);
  const [search, setSearch] = useState('');
  const [details, setDetails] = useState(null);
  const [edit, setEdit] = useState({ open: false, item: null, form: {} });
  async function load() { setOrders((await api.get('/service-orders', { params: { search } })).data.data); }
  useEffect(() => { load(); }, []);
  async function saveEdit() { await api.put(`/service-orders/${edit.item.id}`, edit.form); setEdit({ open: false, item: null, form: {} }); load(); }
  function openEdit(order) {
    setEdit({ open: true, item: order, form: { osNumber: order.osNumber || '', customerName: order.customerName || '', customerCpf: order.customerCpf || '', customerAddress: order.customerAddress || '', city: order.city || '', serviceType: order.serviceType || '', status: order.status || 'concluida', completedAt: order.completedAt ? String(order.completedAt).slice(0, 16) : '', notes: order.notes || '' } });
  }
  return (
    <div className="page-grid">
      <div className="toolbar"><div><h2>Ordens de serviço</h2><p>Consulta de baixas feitas pelos técnicos com CPF e cliente.</p></div><div className="inline"><input placeholder="Buscar OS/cliente/CPF" value={search} onChange={(e) => setSearch(e.target.value)} /><button onClick={load}>Buscar</button></div></div>
      <section className="panel"><div className="table-wrap"><table><thead><tr><th>OS</th><th>Cliente</th><th>CPF</th><th>Técnico</th><th>Tipo</th><th>Status</th><th>Materiais</th><th className="action-cell">Opções</th></tr></thead><tbody>{orders.map((o) => <tr key={o.id}><td>{o.osNumber}</td><td>{o.customerName}</td><td>{o.customerCpf}</td><td>{o.Technician?.name}</td><td>{o.serviceType}</td><td>{o.status}</td><td>{o.ServiceOrderMaterials?.map((m) => m.serialNumber || `${m.Material?.name} (${formatQuantity(m.quantity)})`).join(', ')}</td><td><div className="action-toolbar"><button className="info" onClick={() => setDetails(o)}>Detalhes</button>{isAdmin && <button className="ghost" onClick={() => openEdit(o)}>Editar</button>}</div></td></tr>)}</tbody></table></div></section>
      <Modal open={edit.open} title={`Editar OS ${edit.item?.osNumber || ''}`} onClose={() => setEdit({ open: false, item: null, form: {} })} footer={<><button className="ghost" onClick={() => setEdit({ open: false, item: null, form: {} })}>Cancelar</button><button onClick={saveEdit}>Salvar alteração</button></>}>
        <div className="form-grid"><label>Número OS<input value={edit.form.osNumber || ''} onChange={(e) => setEdit({ ...edit, form: { ...edit.form, osNumber: e.target.value } })} /></label><label>Cliente<input value={edit.form.customerName || ''} onChange={(e) => setEdit({ ...edit, form: { ...edit.form, customerName: e.target.value } })} /></label><label>CPF<input value={edit.form.customerCpf || ''} onChange={(e) => setEdit({ ...edit, form: { ...edit.form, customerCpf: e.target.value } })} /></label><label>Endereço<input value={edit.form.customerAddress || ''} onChange={(e) => setEdit({ ...edit, form: { ...edit.form, customerAddress: e.target.value } })} /></label><label>Cidade<input value={edit.form.city || ''} onChange={(e) => setEdit({ ...edit, form: { ...edit.form, city: e.target.value } })} /></label><label>Tipo<input value={edit.form.serviceType || ''} onChange={(e) => setEdit({ ...edit, form: { ...edit.form, serviceType: e.target.value } })} /></label><label>Status<select value={edit.form.status || ''} onChange={(e) => setEdit({ ...edit, form: { ...edit.form, status: e.target.value } })}><option value="aberta">Aberta</option><option value="pendente">Pendente</option><option value="concluida">Concluída</option><option value="cancelada">Cancelada</option></select></label><label>Concluída em<input type="datetime-local" value={edit.form.completedAt || ''} onChange={(e) => setEdit({ ...edit, form: { ...edit.form, completedAt: e.target.value } })} /></label></div><label>Observações<textarea rows="4" value={edit.form.notes || ''} onChange={(e) => setEdit({ ...edit, form: { ...edit.form, notes: e.target.value } })} /></label>
      </Modal>
      <DetailsModal open={!!details} title={`Detalhes da OS ${details?.osNumber || ''}`} onClose={() => setDetails(null)} footer={<><button className="ghost" onClick={() => setDetails(null)}>Fechar</button>{isAdmin && details && <button onClick={() => { openEdit(details); setDetails(null); }}>Editar OS</button>}</>}>
        {details && <><DetailGrid fields={[["OS", details.osNumber], ["Cliente", details.customerName], ["CPF", details.customerCpf], ["Endereço", details.customerAddress], ["Cidade", details.city], ["Técnico", details.Technician?.name], ["Tipo", details.serviceType], ["Status", details.status], ["Concluída em", details.completedAt], ["Criada em", details.createdAt], ["Observações", details.notes]]} /><DetailList title="Materiais baixados" items={details.ServiceOrderMaterials || []} render={(item) => <><b>{item.Material?.name || 'Material'}</b><span>Qtd. {formatQuantity(item.quantity)} • {item.serialNumber || 'sem serial'} • {brl(item.totalCost)}</span></>} /><div className="viz-callout">Baixas por OS alimentam automaticamente caixa do técnico, estoque, patrimônio, histórico e BI.</div></>}
      </DetailsModal>
    </div>
  );
}
