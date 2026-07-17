/* eslint-disable react-hooks/exhaustive-deps */
import { useEffect, useMemo, useState } from 'react';
import api from '../services/api';
import { useAuth } from '../contexts/AuthContext';
import Modal from '../components/Modal';
import DetailsModal, { DetailGrid } from '../components/DetailsModal';
import KpiCard from '../components/KpiCard';

const osEmpty = { osNumber: '', customerName: '', customerCpf: '', customerAddress: '', city: '', serviceType: 'instalacao', materials: [] };
const reqEmpty = { priority: 'media', requesterNotes: '', items: [] };
function brl(value) { return Number(value || 0).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' }); }
function categoryGroup(category) { const c = String(category || '').toLowerCase(); if (c.includes('onu') || c.includes('roteador')) return 'ONU e equipamentos'; if (c.includes('cabo') || c.includes('drop')) return 'Cabo/drop'; if (c.includes('conector') || c.includes('esticador')) return 'Conectores e fixação'; return 'Outros materiais'; }

export default function TechnicianInbox() {
  const { user, isSupervisor } = useAuth();
  const [technicians, setTechnicians] = useState([]);
  const [selectedTech, setSelectedTech] = useState(user?.technicianId || '');
  const [stock, setStock] = useState(null);
  const [materialsCatalog, setMaterialsCatalog] = useState([]);
  const [requests, setRequests] = useState([]);
  const [osForm, setOsForm] = useState(osEmpty);
  const [requestModal, setRequestModal] = useState(false);
  const [requestForm, setRequestForm] = useState(reqEmpty);
  const [message, setMessage] = useState('');
  const [details, setDetails] = useState(null);

  async function loadTechs() { if (isSupervisor) setTechnicians((await api.get('/technicians')).data.data); }
  async function loadStock(id = selectedTech) {
    if (!id) return;
    setStock((await api.get(`/technicians/${id}/stock`)).data.data);
    setRequests((await api.get(`/material-requests?technicianId=${id}`)).data.data);
  }
  async function loadCatalog() { setMaterialsCatalog((await api.get('/materials')).data.data); }
  useEffect(() => { loadTechs(); loadCatalog(); if (selectedTech) loadStock(selectedTech); }, []);
  const serialByMaterial = (materialId) => (stock?.assets || []).filter((a) => Number(a.materialId) === Number(materialId));
  const stockMaterials = useMemo(() => [...(stock?.balances || []).map((b) => b.Material), ...(stock?.assets || []).map((a) => a.Material)].filter(Boolean).filter((m, i, arr) => arr.findIndex((x) => x.id === m.id) === i), [stock]);
  const boxGroups = useMemo(() => {
    const map = {};
    for (const row of stock?.groupedMaterials || []) {
      const group = categoryGroup(row.category);
      map[group] = map[group] || [];
      map[group].push(row);
    }
    return map;
  }, [stock]);
  const custodyValue = (stock?.assets || []).reduce((sum, item) => sum + Number(item.acquisitionCost || item.Material?.unitCost || 0), 0) + (stock?.balances || []).reduce((sum, row) => sum + Number(row.quantity || 0) * Number(row.Material?.unitCost || 0), 0);
  function addOsMaterial() { setOsForm({ ...osForm, materials: [...osForm.materials, { materialId: stockMaterials[0]?.id || '', quantity: 1, serialNumbersText: '' }] }); }
  function addStandardKit() {
    const desired = ['onu', 'roteador', 'drop', 'cabo', 'conector', 'esticador'];
    const kit = [];
    for (const key of desired) {
      const mat = stockMaterials.find((m) => String(m.category || m.name || '').toLowerCase().includes(key));
      if (mat && !kit.find((item) => Number(item.materialId) === Number(mat.id))) kit.push({ materialId: mat.id, quantity: key === 'drop' || key === 'cabo' ? 50 : 1, serialNumbersText: '' });
    }
    setOsForm({ ...osForm, materials: kit.length ? kit : osForm.materials });
  }
  function updateOsMaterial(i, patch) { const materials = [...osForm.materials]; materials[i] = { ...materials[i], ...patch }; setOsForm({ ...osForm, materials }); }
  function addRequestItem() { setRequestForm({ ...requestForm, items: [...requestForm.items, { materialId: materialsCatalog[0]?.id || '', quantity: 1 }] }); }
  function updateRequestItem(i, patch) { const items = [...requestForm.items]; items[i] = { ...items[i], ...patch }; setRequestForm({ ...requestForm, items }); }
  async function saveOs() {
    try {
      const payload = { ...osForm, technicianId: selectedTech, materials: osForm.materials.map((m) => ({ ...m, serialNumbers: String(m.serialNumbersText || '').split(/\n|,|;/).map((s) => s.trim()).filter(Boolean) })) };
      await api.post('/service-orders', payload);
      setMessage('OS baixada com sucesso. Sua caixa foi atualizada e o histórico foi gravado.');
      setOsForm(osEmpty);
      loadStock(selectedTech);
    } catch (error) {
      setMessage(error.response?.data?.message || error.message || 'Erro ao baixar OS.');
    }
  }
  async function sendRequest() {
    try {
      await api.post('/material-requests', { ...requestForm, technicianId: selectedTech });
      setMessage('Solicitação enviada para aprovação do supervisor.');
      setRequestModal(false);
      setRequestForm(reqEmpty);
      loadStock(selectedTech);
    } catch (error) {
      setMessage(error.response?.data?.message || error.message || 'Erro ao solicitar material.');
    }
  }
  return (
    <div className="page-grid mobile-first erp-page">
      <section className="command-center"><div><span className="eyebrow">Caixa do técnico</span><h2>Minha caixa de materiais</h2><p>Tela otimizada para celular: consultar o que está em seu nome e dar baixa somente no que precisa operar.</p></div>{isSupervisor && <button onClick={() => setRequestModal(true)}>Solicitar material</button>}</section>
      {message && <div className="alert danger">{message}</div>}
      {isSupervisor && <section className="panel"><label>Operar como técnico<select value={selectedTech} onChange={(e) => { setSelectedTech(e.target.value); loadStock(e.target.value); }}><option value="">Selecione</option>{technicians.map((t) => <option key={t.id} value={t.id}>{t.name}</option>)}</select></label></section>}
      <div className="kpi-grid small"><KpiCard label="Equipamentos na caixa" value={stock?.assets?.length || 0} /><KpiCard label="Linhas consumíveis" value={stock?.balances?.length || 0} /><KpiCard label="Valor sob minha guarda" value={brl(custodyValue)} /></div>
      <section className="two-col">
        <article className="panel"><div className="panel-title"><div><h3>Baixar material por OS</h3><p>O material sai da sua caixa e entra no histórico do cliente.</p></div></div><div className="form-grid"><label>Nº da OS<input value={osForm.osNumber} onChange={(e) => setOsForm({ ...osForm, osNumber: e.target.value })} /></label><label>CPF do cliente<input value={osForm.customerCpf} onChange={(e) => setOsForm({ ...osForm, customerCpf: e.target.value })} /></label><label>Nome do cliente<input value={osForm.customerName} onChange={(e) => setOsForm({ ...osForm, customerName: e.target.value })} /></label><label>Endereço<input value={osForm.customerAddress} onChange={(e) => setOsForm({ ...osForm, customerAddress: e.target.value })} /></label><label>Cidade<input value={osForm.city} onChange={(e) => setOsForm({ ...osForm, city: e.target.value })} /></label><label>Tipo<select value={osForm.serviceType} onChange={(e) => setOsForm({ ...osForm, serviceType: e.target.value })}><option value="instalacao">Instalação</option><option value="manutencao">Manutenção</option><option value="troca_onu">Troca de ONU</option><option value="retirada">Retirada</option><option value="outro">Outro</option></select></label></div><div className="subtoolbar"><h4>Material usado</h4><div className="row-actions"><button className="ghost" onClick={addStandardKit}>Usar kit padrão</button><button className="ghost" onClick={addOsMaterial}>Adicionar</button></div></div>{osForm.materials.map((m, i) => { const material = stockMaterials.find((x) => Number(x.id) === Number(m.materialId)); return <div className="item-card" key={i}><label>Material<select value={m.materialId} onChange={(e) => updateOsMaterial(i, { materialId: e.target.value, serialNumbersText: '' })}>{stockMaterials.map((x) => <option key={x.id} value={x.id}>{x.name}</option>)}</select></label>{material?.requiresSerial ? <label>Serial usado<textarea rows="3" value={m.serialNumbersText} onChange={(e) => updateOsMaterial(i, { serialNumbersText: e.target.value })} placeholder={serialByMaterial(m.materialId).map((a) => a.serialNumber).join('\n')} /></label> : <label>Quantidade<input type="number" value={m.quantity} onChange={(e) => updateOsMaterial(i, { quantity: e.target.value })} /></label>}</div>; })}<button onClick={saveOs} className="wide">Baixar OS e atualizar minha caixa</button></article>
        <article className="panel"><div className="panel-title"><div><h3>Minha caixa atual</h3><p>Lista agrupada por tipo. Clique em detalhes para ver seriais e valores.</p></div></div>
          <div className="category-box-list">
            {Object.entries(boxGroups).map(([group, rows]) => <div className="panel-soft" key={group}><h4>{group}</h4><div className="table-wrap compact"><table><thead><tr><th>Material</th><th>Qtd.</th><th>Valor</th><th>Opções</th></tr></thead><tbody>{rows.map((row) => <tr key={`${group}-${row.materialId}`}><td><strong>{row.material}</strong><br /><small>{row.requiresSerial ? 'Serializado' : 'Consumível'}</small></td><td>{row.quantity} {row.unit || ''}</td><td>{brl(row.value)}</td><td><button className="info" onClick={() => setDetails({ type: 'group', item: row })}>Detalhes</button></td></tr>)}</tbody></table></div></div>)}
            {!Object.keys(boxGroups).length && <div className="empty-state">Nenhum material em sua caixa.</div>}
          </div>
        </article>
      </section>
      <section className="panel"><div className="panel-title"><div><h3>Minhas solicitações recentes</h3><p>Fila de aprovação e expedição do material pedido.</p></div></div><div className="table-wrap"><table><thead><tr><th>Número</th><th>Status</th><th>Itens</th><th>Valor</th><th>Atualização</th><th>Opções</th></tr></thead><tbody>{requests.slice(0, 10).map((r) => <tr key={r.id}><td>{r.requestNumber}</td><td><span className={`badge ${r.status}`}>{r.status}</span></td><td>{r.totalQuantity}</td><td>{brl(r.totalValue)}</td><td>{new Date(r.updatedAt).toLocaleString('pt-BR')}</td><td><button className="info" onClick={() => setDetails({ type: 'request', item: r })}>Detalhes</button></td></tr>)}</tbody></table></div></section>

      <DetailsModal open={!!details} title="Detalhes da caixa do técnico" onClose={() => setDetails(null)}>
        {details?.type === 'asset' && <DetailGrid fields={[["Serial", details.item.serialNumber], ["Material", details.item.Material?.name], ["Categoria", details.item.Material?.category], ["Status", details.item.status], ["Valor", brl(details.item.acquisitionCost || details.item.Material?.unitCost)], ["Custódia desde", details.item.custodyStartedAt], ["Último movimento", details.item.lastMovementAt]]} />}
        {details?.type === 'group' && <><DetailGrid fields={[["Material", details.item.material], ["Categoria", details.item.category], ["Quantidade", `${details.item.quantity} ${details.item.unit || ''}`], ["Valor", brl(details.item.value)], ["Serializado", details.item.requiresSerial ? 'Sim' : 'Não']]} />{details.item.requiresSerial && <div className="table-wrap compact"><table><thead><tr><th>Serial</th></tr></thead><tbody>{(details.item.serials || []).map((serial) => <tr key={serial}><td>{serial}</td></tr>)}</tbody></table></div>}</>}
        {details?.type === 'balance' && <DetailGrid fields={[["Material", details.item.Material?.name], ["Categoria", details.item.Material?.category], ["Quantidade", `${details.item.quantity} ${details.item.Material?.unit || ''}`], ["Valor unitário", brl(details.item.Material?.unitCost)], ["Valor estimado", brl(Number(details.item.quantity || 0) * Number(details.item.Material?.unitCost || 0))]]} />}
        {details?.type === 'request' && <DetailGrid fields={[["Solicitação", details.item.requestNumber], ["Status", details.item.status], ["Prioridade", details.item.priority], ["Itens", details.item.totalQuantity], ["Valor", brl(details.item.totalValue)], ["Atualização", details.item.updatedAt], ["Observação", details.item.requesterNotes]]} />}
      </DetailsModal>
      <Modal open={requestModal} title="Solicitar reposição de carga" onClose={() => setRequestModal(false)} footer={<><button className="ghost" onClick={() => setRequestModal(false)}>Cancelar</button><button onClick={sendRequest}>Enviar para aprovação</button></>}>
        <div className="form-stack"><label>Prioridade<select value={requestForm.priority} onChange={(e) => setRequestForm({ ...requestForm, priority: e.target.value })}><option value="baixa">Baixa</option><option value="media">Média</option><option value="alta">Alta</option><option value="critica">Crítica</option></select></label><label>Justificativa<textarea rows="3" value={requestForm.requesterNotes} onChange={(e) => setRequestForm({ ...requestForm, requesterNotes: e.target.value })} /></label><div className="subtoolbar"><h4>Itens</h4><button className="ghost" onClick={addRequestItem}>Adicionar</button></div>{requestForm.items.map((item, i) => <div className="item-card" key={i}><div className="form-grid"><label>Material<select value={item.materialId} onChange={(e) => updateRequestItem(i, { materialId: e.target.value })}>{materialsCatalog.map((m) => <option key={m.id} value={m.id}>{m.name}</option>)}</select></label><label>Quantidade<input type="number" value={item.quantity} onChange={(e) => updateRequestItem(i, { quantity: e.target.value })} /></label></div></div>)}</div>
      </Modal>
    </div>
  );
}
