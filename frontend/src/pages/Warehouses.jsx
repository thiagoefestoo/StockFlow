import { useEffect, useState } from 'react';
import api from '../services/api';
import Modal from '../components/Modal';
import DetailsModal, { DetailGrid, DetailList } from '../components/DetailsModal';
import KpiCard from '../components/KpiCard';
import { useAuth } from '../contexts/AuthContext';

const empty = { name: '', code: '', region: '', city: '', state: '', address: '', responsibleName: '', approvalLimit: 0, status: 'ativo', notes: '' };
function brl(v) { return Number(v || 0).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' }); }

export default function Warehouses() {
  const { isAdmin } = useAuth();
  const [rows, setRows] = useState([]);
  const [form, setForm] = useState(empty);
  const [modal, setModal] = useState(false);
  const [details, setDetails] = useState(null);
  const [message, setMessage] = useState('');
  async function load() { setRows((await api.get('/warehouses')).data.data || []); }
  useEffect(() => { load(); }, []);
  async function save() {
    try {
      if (form.id) await api.put(`/warehouses/${form.id}`, form); else await api.post('/warehouses', form);
      setModal(false); setForm(empty); load(); setMessage('Estoque salvo com sucesso.');
    } catch (e) { setMessage(e.response?.data?.message || 'Erro ao salvar estoque.'); }
  }
  async function openDetails(row) { setDetails((await api.get(`/warehouses/${row.id}`)).data.data); }
  const totalValue = rows.reduce((s, r) => s + Number(r.totalValue || 0), 0);
  return <div className="page-grid erp-page">
    <section className="toolbar"><div><span className="eyebrow">Rede logística</span><h2>Estoques por região</h2><p>Cadastre unidades de estoque por cidade/região e limite a atuação dos estoquistas e técnicos por área.</p></div>{isAdmin && <button onClick={() => { setForm(empty); setModal(true); }}>Novo estoque</button>}</section>
    {message && <div className="alert danger">{message}</div>}
    <div className="kpi-grid small"><KpiCard label="Estoques" value={rows.length} /><KpiCard label="Ativos" value={rows.filter((r) => r.status === 'ativo').length} /><KpiCard label="Patrimônio em estoque" value={brl(totalValue)} /><KpiCard label="Equipamentos" value={rows.reduce((s, r) => s + Number(r.assetCount || 0), 0)} /></div>
    <section className="panel"><div className="table-wrap"><table><thead><tr><th>Código</th><th>Estoque</th><th>Região/cidade</th><th>Responsável</th><th>Limite local</th><th>Valor</th><th>Status</th><th>Opções</th></tr></thead><tbody>{rows.map((r) => <tr key={r.id}><td><strong>{r.code}</strong></td><td>{r.name}</td><td>{r.region || '-'}<br /><small>{r.city || '-'} {r.state || ''}</small></td><td>{r.responsibleName || '-'}</td><td>{brl(r.approvalLimit)}</td><td>{brl(r.totalValue)}</td><td><span className={`badge ${r.status}`}>{r.status}</span></td><td><div className="row-actions"><button className="info" onClick={() => openDetails(r)}>Detalhes</button>{isAdmin && <button className="ghost" onClick={() => { setForm(r); setModal(true); }}>Editar</button>}</div></td></tr>)}</tbody></table></div></section>
    <Modal open={modal} title={form.id ? 'Editar estoque' : 'Novo estoque'} onClose={() => setModal(false)} footer={<><button className="ghost" onClick={() => setModal(false)}>Cancelar</button><button onClick={save}>Salvar</button></>}>
      <div className="form-stack"><div className="form-grid"><label>Nome<input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} /></label><label>Código<input value={form.code} onChange={(e) => setForm({ ...form, code: e.target.value })} /></label><label>Região<input value={form.region || ''} onChange={(e) => setForm({ ...form, region: e.target.value })} /></label><label>Cidade<input value={form.city || ''} onChange={(e) => setForm({ ...form, city: e.target.value })} /></label><label>UF<input value={form.state || ''} maxLength="2" onChange={(e) => setForm({ ...form, state: e.target.value.toUpperCase() })} /></label><label>Responsável<input value={form.responsibleName || ''} onChange={(e) => setForm({ ...form, responsibleName: e.target.value })} /></label><label>Limite de aprovação local<input type="number" value={form.approvalLimit || 0} onChange={(e) => setForm({ ...form, approvalLimit: e.target.value })} /></label><label>Status<select value={form.status} onChange={(e) => setForm({ ...form, status: e.target.value })}><option value="ativo">Ativo</option><option value="inativo">Inativo</option><option value="bloqueado">Bloqueado</option></select></label></div><label>Endereço<input value={form.address || ''} onChange={(e) => setForm({ ...form, address: e.target.value })} /></label><label>Observações<textarea rows="3" value={form.notes || ''} onChange={(e) => setForm({ ...form, notes: e.target.value })} /></label></div>
    </Modal>
    <DetailsModal open={!!details} title={`Estoque ${details?.warehouse?.name || ''}`} onClose={() => setDetails(null)}><DetailGrid fields={details ? [["Código", details.warehouse.code], ["Nome", details.warehouse.name], ["Região", details.warehouse.region], ["Cidade", details.warehouse.city], ["Responsável", details.warehouse.responsibleName], ["Limite de aprovação", brl(details.warehouse.approvalLimit)], ["Status", details.warehouse.status], ["Observações", details.warehouse.notes]] : []} />{details && <><DetailList title="Equipamentos serializados" items={details.assets || []} render={(a) => <><b>{a.serialNumber}</b><span>{a.Material?.name} • {a.status} • {brl(a.acquisitionCost || a.Material?.unitCost)}</span></>} /><DetailList title="Materiais consumíveis" items={details.balances || []} render={(b) => <><b>{b.Material?.name}</b><span>{b.quantity} {b.Material?.unit} • {brl(Number(b.quantity || 0) * Number(b.Material?.unitCost || 0))}</span></>} /></>}</DetailsModal>
  </div>;
}
