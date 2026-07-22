/* eslint-disable react-hooks/exhaustive-deps */
import { useEffect, useMemo, useState } from 'react';
import api from '../services/api';
import { useAuth } from '../contexts/AuthContext';
import Modal from '../components/Modal';
import DetailsModal, { DetailGrid } from '../components/DetailsModal';
import KpiCard from '../components/KpiCard';
import { formatQuantity, formatQuantityInput, formatQuantityLabel } from '../utils/formatQuantity';

const osEmpty = { osNumber: '', customerName: '', customerCpf: '', customerAddress: '', city: '', serviceType: 'instalacao', materials: [] };
const reqEmpty = { priority: 'media', requesterNotes: '', items: [] };

function brl(value) { return Number(value || 0).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' }); }
function dt(value) { return value ? new Date(value).toLocaleString('pt-BR') : '-'; }
function categoryGroup(category) { const c = String(category || '').toLowerCase(); if (c.includes('onu') || c.includes('roteador')) return 'ONU e equipamentos'; if (c.includes('cabo') || c.includes('drop')) return 'Cabo/drop'; if (c.includes('conector') || c.includes('esticador')) return 'Conectores e fixação'; return 'Outros materiais'; }
function statusLabel(value) { return ({ pendente_aprovacao: 'Pendente aprovação', aprovado: 'Aprovado', entregue: 'Entregue', reprovado: 'Reprovado', cancelado: 'Cancelado' }[value] || value || '-'); }
function sectionLabel(key) { return ({ resumo: 'Resumo', baixa: 'Baixar OS', caixa: 'Minha carga', solicitacoes: 'Solicitações' }[key] || key); }

export default function TechnicianInbox() {
  const { user, isSupervisor } = useAuth();
  const [technicians, setTechnicians] = useState([]);
  const [selectedTech, setSelectedTech] = useState(user?.technicianId || '');
  const [stock, setStock] = useState(null);
  const [materialsCatalog, setMaterialsCatalog] = useState([]);
  const [requests, setRequests] = useState([]);
  const [osForm, setOsForm] = useState(osEmpty);
  const [osFieldsOpen, setOsFieldsOpen] = useState(false);
  const [activeMobileSection, setActiveMobileSection] = useState('resumo');
  const [requestModal, setRequestModal] = useState(false);
  const [requestForm, setRequestForm] = useState(reqEmpty);
  const [message, setMessage] = useState('');
  const [details, setDetails] = useState(null);

  async function loadTechs() { if (isSupervisor) setTechnicians((await api.get('/technicians')).data.data || []); }
  async function loadStock(id = selectedTech) {
    if (!id) return;
    const [stockRes, requestsRes] = await Promise.all([
      api.get(`/technicians/${id}/stock`),
      api.get(`/material-requests?technicianId=${id}`),
    ]);
    setStock(stockRes.data.data);
    setRequests(requestsRes.data.data || []);
  }
  async function loadCatalog() { setMaterialsCatalog((await api.get('/materials')).data.data || []); }

  useEffect(() => { loadTechs(); loadCatalog(); if (selectedTech) loadStock(selectedTech); }, []);

  useEffect(() => {
    if (!selectedTech) return undefined;

    const refresh = () => loadStock(selectedTech);
    const interval = setInterval(refresh, 15000);
    const onFocus = () => refresh();
    const onStorage = (event) => {
      if (event.key === 'superinfra:technician-box-refresh') refresh();
    };
    const onLocalRefresh = () => refresh();

    window.addEventListener('focus', onFocus);
    window.addEventListener('storage', onStorage);
    window.addEventListener('superinfra:technician-box-refresh', onLocalRefresh);

    return () => {
      clearInterval(interval);
      window.removeEventListener('focus', onFocus);
      window.removeEventListener('storage', onStorage);
      window.removeEventListener('superinfra:technician-box-refresh', onLocalRefresh);
    };
  }, [selectedTech]);

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
  const flatBoxRows = useMemo(() => Object.entries(boxGroups).flatMap(([group, rows]) => rows.map((row) => ({ ...row, group }))), [boxGroups]);
  const custodyValue = (stock?.assets || []).reduce((sum, item) => sum + Number(item.acquisitionCost || item.Material?.unitCost || 0), 0) + (stock?.balances || []).reduce((sum, row) => sum + Number(row.quantity || 0) * Number(row.Material?.unitCost || 0), 0);

  const pendingRequests = requests.filter((r) => r.status !== 'entregue' && r.status !== 'reprovado' && r.status !== 'cancelado');
  const approvedRequests = requests.filter((r) => r.status === 'aprovado');
  const deliveredRequests = requests.filter((r) => r.status === 'entregue');
  const recentRequests = requests.slice(0, 10);

  function mobileSectionClass(key) {
    return `technician-mobile-section mobile-section-${key} ${activeMobileSection === key ? 'mobile-open' : 'mobile-closed'}`;
  }

  function showSection(key) {
    setActiveMobileSection(key);
    if (key === 'baixa') setOsFieldsOpen(true);
  }

  function addOsMaterial() {
    setOsForm({ ...osForm, materials: [...osForm.materials, { materialId: '', quantity: 1, serialNumbers: [] }] });
    setActiveMobileSection('baixa');
  }

  function addStandardKit() {
    const desired = ['onu', 'drop', 'cabo', 'conector', 'esticador'];
    const kit = [];
    for (const key of desired) {
      const mat = stockMaterials.find((m) => String(m.category || m.name || '').toLowerCase().includes(key));
      if (mat && !kit.find((item) => Number(item.materialId) === Number(mat.id))) {
        kit.push({ materialId: mat.id, quantity: key === 'drop' || key === 'cabo' ? 50 : 1, serialNumbers: [] });
      }
    }
    setOsForm({ ...osForm, materials: kit.length ? kit : osForm.materials });
    setActiveMobileSection('baixa');
  }

  function updateOsMaterial(i, patch) {
    const materials = [...osForm.materials];
    materials[i] = { ...materials[i], ...patch };
    setOsForm({ ...osForm, materials });
  }

  function removeOsMaterial(i) {
    setOsForm({ ...osForm, materials: osForm.materials.filter((_, index) => index !== i) });
  }

  function toggleSingleSerial(i, serialNumber) {
    const materials = osForm.materials.map((item, index) => {
      if (index !== i) return { ...item, serialNumbers: [] };
      const already = (item.serialNumbers || []).includes(serialNumber);
      return { ...item, serialNumbers: already ? [] : [serialNumber], quantity: 1 };
    });
    setOsForm({ ...osForm, materials });
  }

  function addRequestItem() {
    setRequestForm({ ...requestForm, items: [...requestForm.items, { materialId: '', quantity: 1 }] });
  }
  function updateRequestItem(i, patch) { const items = [...requestForm.items]; items[i] = { ...items[i], ...patch }; setRequestForm({ ...requestForm, items }); }
  function removeRequestItem(i) { setRequestForm({ ...requestForm, items: requestForm.items.filter((_, index) => index !== i) }); }

  function validateOs() {
    if (!String(osForm.osNumber || '').trim()) return 'Informe o número da OS.';
    if (!String(osForm.customerName || '').trim()) return 'Informe o nome do cliente.';
    if (!String(osForm.customerCpf || '').trim()) return 'Informe o CPF do cliente.';
    if (!osForm.materials.length) return 'Adicione ao menos um material usado na OS.';

    let serialCount = 0;
    for (const item of osForm.materials) {
      const material = stockMaterials.find((x) => Number(x.id) === Number(item.materialId));
      if (!item.materialId || !material) return 'Selecione o material em todos os itens adicionados.';
      if (material.requiresSerial) {
        const serials = Array.isArray(item.serialNumbers) ? item.serialNumbers.filter(Boolean) : [];
        if (serials.length > 1) return 'Selecione apenas 1 serial por OS.';
        serialCount += serials.length;
      } else if (Number(item.quantity || 0) <= 0) {
        return `Informe uma quantidade válida para ${material.name}.`;
      }
    }
    if (serialCount !== 1) return 'Selecione exatamente 1 serial que será transferido para o cliente.';
    return null;
  }

  async function saveOs() {
    const validation = validateOs();
    if (validation) {
      setMessage(validation);
      setOsFieldsOpen(true);
      setActiveMobileSection('baixa');
      return;
    }
    try {
      const payload = { ...osForm, technicianId: selectedTech, materials: osForm.materials.map((m) => ({ ...m, serialNumbers: Array.isArray(m.serialNumbers) ? m.serialNumbers.filter(Boolean) : [] })) };
      await api.post('/service-orders', payload);
      setMessage('OS baixada com sucesso. Sua caixa foi atualizada e o histórico foi gravado.');
      setOsForm(osEmpty);
      setOsFieldsOpen(false);
      setActiveMobileSection('resumo');
      loadStock(selectedTech);
    } catch (error) {
      setMessage(error.response?.data?.message || error.message || 'Erro ao baixar OS.');
    }
  }

  async function sendRequest() {
    try {
      const cleanItems = requestForm.items.filter((item) => item.materialId && Number(item.quantity || 0) > 0);
      if (!cleanItems.length) throw new Error('Adicione ao menos um material na solicitação.');
      await api.post('/material-requests', { ...requestForm, items: cleanItems, technicianId: selectedTech });
      setMessage('Solicitação enviada para aprovação do supervisor.');
      setRequestModal(false);
      setRequestForm(reqEmpty);
      setActiveMobileSection('solicitacoes');
      loadStock(selectedTech);
    } catch (error) {
      setMessage(error.response?.data?.message || error.message || 'Erro ao solicitar material.');
    }
  }

  return (
    <div className="page-grid mobile-first erp-page technician-mobile-page">
      <section className="command-center technician-hero-card">
        <div>
          <span className="eyebrow">Caixa do técnico</span>
          <h2>Minha caixa de materiais</h2>
          <p>Tela otimizada para celular: veja só o essencial primeiro e abra cada operação quando precisar.</p>
        </div>
        <div className="row-actions technician-hero-actions">
          <button type="button" onClick={() => setRequestModal(true)} disabled={!selectedTech}>Solicitar material</button>
          <button type="button" className="ghost" onClick={() => loadStock(selectedTech)} disabled={!selectedTech}>Atualizar</button>
        </div>
      </section>

      {message && <div className="alert danger">{message}</div>}
      {isSupervisor && <section className="panel"><label>Operar como técnico<select value={selectedTech} onChange={(e) => { setSelectedTech(e.target.value); loadStock(e.target.value); }}><option value="">Selecione</option>{technicians.map((t) => <option key={t.id} value={t.id}>{t.name}</option>)}</select></label></section>}

      <nav className="technician-mobile-tabs" aria-label="Atalhos da caixa do técnico">
        {['resumo', 'baixa', 'caixa', 'solicitacoes'].map((key) => (
          <button key={key} type="button" className={activeMobileSection === key ? 'active' : ''} onClick={() => showSection(key)}>
            {sectionLabel(key)}
            {key === 'resumo' && pendingRequests.length > 0 && <b>{pendingRequests.length}</b>}
            {key === 'solicitacoes' && approvedRequests.length > 0 && <b>{approvedRequests.length}</b>}
          </button>
        ))}
      </nav>

      <div className="kpi-grid small technician-kpis">
        <KpiCard label="Equipamentos" value={stock?.assets?.length || 0} />
        <KpiCard label="Consumíveis" value={stock?.balances?.length || 0} />
        <KpiCard label="Valor sob guarda" value={brl(custodyValue)} />
      </div>

      <section className={`panel technician-notifications ${mobileSectionClass('resumo')}`}>
        <div className="panel-title compact-title">
          <div><h3>Resumo e notificações</h3><p>Acompanhe rapidamente o andamento das suas solicitações e entregas.</p></div>
          <button className="ghost" onClick={() => loadStock(selectedTech)}>Atualizar</button>
        </div>
        <div className="notification-strip technician-status-strip">
          <article><strong>{pendingRequests.length}</strong><span>em andamento</span></article>
          <article><strong>{approvedRequests.length}</strong><span>aguardando entrega</span></article>
          <article><strong>{deliveredRequests.length}</strong><span>entregue(s)</span></article>
        </div>
        <div className="mobile-quick-actions">
          <button type="button" onClick={() => showSection('baixa')}>Baixar OS</button>
          <button type="button" className="ghost" onClick={() => showSection('caixa')}>Ver minha carga</button>
          <button type="button" className="ghost" onClick={() => setRequestModal(true)}>Solicitar material</button>
        </div>
        {requests.slice(0, 4).map((r) => <button type="button" className="request-notice" key={r.id} onClick={() => setDetails({ type: 'request', item: r })}><b>{r.requestNumber}</b><span>{statusLabel(r.status)} • {formatQuantity(r.totalQuantity)} item(ns) • {dt(r.updatedAt)}</span></button>)}
        {!requests.length && <div className="empty-state small">Nenhuma solicitação registrada para sua caixa.</div>}
      </section>

      <section className="two-col technician-work-area">
        <article className={`panel os-work-card ${mobileSectionClass('baixa')}`}>
          <div className="panel-title compact-title"><div><h3>Baixar material por OS</h3><p>Informe nome, CPF e selecione exatamente 1 serial que será transferido para o cliente.</p></div></div>
          <button type="button" className="ghost os-mobile-toggle" onClick={() => setOsFieldsOpen((open) => !open)}>{osFieldsOpen ? 'Ocultar dados da OS' : 'Preencher dados da OS'}</button>
          <div className={`form-grid os-mobile-fields ${osFieldsOpen ? 'open' : ''}`}>
            <label>Nº da OS<input value={osForm.osNumber} onChange={(e) => setOsForm({ ...osForm, osNumber: e.target.value })} required /></label>
            <label>CPF do cliente *<input value={osForm.customerCpf} onChange={(e) => setOsForm({ ...osForm, customerCpf: e.target.value })} required /></label>
            <label>Nome do cliente *<input value={osForm.customerName} onChange={(e) => setOsForm({ ...osForm, customerName: e.target.value })} required /></label>
            <label>Endereço<input value={osForm.customerAddress} onChange={(e) => setOsForm({ ...osForm, customerAddress: e.target.value })} /></label>
            <label>Cidade<input value={osForm.city} onChange={(e) => setOsForm({ ...osForm, city: e.target.value })} /></label>
            <label>Tipo<select value={osForm.serviceType} onChange={(e) => setOsForm({ ...osForm, serviceType: e.target.value })}><option value="instalacao">Instalação</option><option value="manutencao">Manutenção</option><option value="troca_onu">Troca de ONU</option><option value="retirada">Retirada</option><option value="outro">Outro</option></select></label>
          </div>
          <div className="subtoolbar"><h4>Material usado</h4><div className="row-actions"><button className="ghost desktop-action" onClick={addStandardKit}>Usar kit padrão</button><button className="ghost" onClick={addOsMaterial}>Adicionar item</button></div></div>
          {osForm.materials.map((m, i) => {
            const material = stockMaterials.find((x) => Number(x.id) === Number(m.materialId));
            const serials = serialByMaterial(m.materialId);
            return <div className="item-card technician-os-item" key={i}>
              <div className="item-head"><strong>Item {i + 1}</strong><button type="button" className="ghost danger-outline" onClick={() => removeOsMaterial(i)}>Remover</button></div>
              <label>Material<select value={m.materialId} onChange={(e) => updateOsMaterial(i, { materialId: e.target.value, serialNumbers: [], quantity: 1 })}><option value="">Selecione o material</option>{stockMaterials.map((x) => <option key={x.id} value={x.id}>{x.name}</option>)}</select></label>
              {material?.requiresSerial ? <div className="serial-picker"><div className="serial-picker-head"><strong>Serial obrigatório</strong><small>Selecione apenas 1 serial por OS.</small></div><div className="serial-list compact-serial-list">{serials.map((asset) => { const checked = (m.serialNumbers || []).includes(asset.serialNumber); return <button type="button" className={`serial-chip ${checked ? 'selected' : ''}`} key={asset.id || asset.serialNumber} onClick={() => toggleSingleSerial(i, asset.serialNumber)}><span><b>{asset.serialNumber}</b><small>{asset.Material?.name || material.name}</small></span><em>{checked ? 'Selecionado' : 'Selecionar'}</em></button>; })}</div>{!serials.length && <div className="empty-state small">Nenhum serial deste material está na sua caixa.</div>}</div> : <label>Quantidade<input type="number" min="1" value={m.quantity} onChange={(e) => updateOsMaterial(i, { quantity: e.target.value })} /></label>}
            </div>;
          })}
          {!osForm.materials.length && <div className="empty-state small">Clique em “Adicionar item” para informar o material usado na OS.</div>}
          <button onClick={saveOs} className="wide">Baixar OS e atualizar minha caixa</button>
        </article>

        <article className={`panel technician-box-card ${mobileSectionClass('caixa')}`}>
          <div className="panel-title compact-title"><div><h3>Minha carga atual</h3><p>Resumo por material. Abra detalhes apenas quando precisar ver seriais e valores.</p></div></div>
          <div className="technician-card-list">
            {flatBoxRows.map((row) => <button type="button" className="tech-stock-card" key={`${row.group}-${row.materialId}`} onClick={() => setDetails({ type: 'group', item: row })}>
              <span><b>{row.material}</b><small>{row.group} • {row.requiresSerial ? 'Serializado' : 'Consumível'}</small></span>
              <strong>{formatQuantity(row.quantity, row.unit)}</strong>
            </button>)}
            {!flatBoxRows.length && <div className="empty-state">Nenhum material em sua caixa.</div>}
          </div>
          <div className="category-box-list desktop-box-list">
            {Object.entries(boxGroups).map(([group, rows]) => <div className="panel-soft" key={group}><h4>{group}</h4><div className="table-wrap compact"><table><thead><tr><th>Material</th><th>Qtd.</th><th>Valor</th><th>Opções</th></tr></thead><tbody>{rows.map((row) => <tr key={`${group}-${row.materialId}`}><td><strong>{row.material}</strong><br /><small>{row.requiresSerial ? 'Serializado' : 'Consumível'}</small></td><td>{formatQuantity(row.quantity, row.unit)}</td><td>{brl(row.value)}</td><td><button className="info" onClick={() => setDetails({ type: 'group', item: row })}>Detalhes</button></td></tr>)}</tbody></table></div></div>)}
          </div>
        </article>
      </section>

      <section className={`panel technician-requests-section ${mobileSectionClass('solicitacoes')}`}>
        <div className="panel-title compact-title"><div><h3>Minhas solicitações recentes</h3><p>Fila de aprovação e expedição do material pedido.</p></div><button type="button" onClick={() => setRequestModal(true)}>Nova solicitação</button></div>
        <div className="mobile-request-list">
          {recentRequests.map((r) => <button key={r.id} type="button" className="mobile-request-card" onClick={() => setDetails({ type: 'request', item: r })}>
            <span><b>{r.requestNumber}</b><small>{dt(r.updatedAt)}</small></span>
            <em className={`badge ${r.status}`}>{statusLabel(r.status)}</em>
            <strong>{formatQuantity(r.totalQuantity)} item(ns)</strong>
          </button>)}
        </div>
        <div className="table-wrap desktop-request-table"><table><thead><tr><th>Número</th><th>Status</th><th>Itens</th><th>Valor</th><th>Atualização</th><th>Opções</th></tr></thead><tbody>{recentRequests.map((r) => <tr key={r.id}><td>{r.requestNumber}</td><td><span className={`badge ${r.status}`}>{statusLabel(r.status)}</span></td><td>{formatQuantity(r.totalQuantity)}</td><td>{brl(r.totalValue)}</td><td>{dt(r.updatedAt)}</td><td><button className="info" onClick={() => setDetails({ type: 'request', item: r })}>Detalhes</button></td></tr>)}</tbody></table></div>
        {!recentRequests.length && <div className="empty-state small">Nenhuma solicitação registrada.</div>}
      </section>

      <DetailsModal open={!!details} title="Detalhes da caixa do técnico" onClose={() => setDetails(null)}>
        {details?.type === 'asset' && <DetailGrid fields={[["Serial", details.item.serialNumber], ["Material", details.item.Material?.name], ["Categoria", details.item.Material?.category], ["Status", details.item.status], ["Valor", brl(details.item.acquisitionCost || details.item.Material?.unitCost)], ["Custódia desde", details.item.custodyStartedAt], ["Último movimento", details.item.lastMovementAt]]} />}
        {details?.type === 'group' && <><DetailGrid fields={[["Material", details.item.material], ["Categoria", details.item.category], ["Quantidade", formatQuantity(details.item.quantity, details.item.unit)], ["Valor", brl(details.item.value)], ["Serializado", details.item.requiresSerial ? 'Sim' : 'Não']]} />{details.item.requiresSerial && <div className="table-wrap compact"><table><thead><tr><th>Serial</th></tr></thead><tbody>{(details.item.serials || []).map((serial) => <tr key={serial}><td>{serial}</td></tr>)}</tbody></table></div>}</>}
        {details?.type === 'balance' && <DetailGrid fields={[["Material", details.item.Material?.name], ["Categoria", details.item.Material?.category], ["Quantidade", formatQuantity(details.item.quantity, details.item.Material?.unit)], ["Valor unitário", brl(details.item.Material?.unitCost)], ["Valor estimado", brl(Number(details.item.quantity || 0) * Number(details.item.Material?.unitCost || 0))]]} />}
        {details?.type === 'request' && <DetailGrid fields={[["Solicitação", details.item.requestNumber], ["Status", statusLabel(details.item.status)], ["Prioridade", details.item.priority], ["Itens", formatQuantity(details.item.totalQuantity)], ["Valor", brl(details.item.totalValue)], ["Atualização", dt(details.item.updatedAt)], ["Observação", details.item.requesterNotes]]} />}
      </DetailsModal>

      <Modal open={requestModal} title="Solicitar reposição de carga" onClose={() => setRequestModal(false)} footer={<><button className="ghost" onClick={() => setRequestModal(false)}>Cancelar</button><button onClick={sendRequest}>Enviar para aprovação</button></>}>
        <div className="form-stack">
          <label>Prioridade<select value={requestForm.priority} onChange={(e) => setRequestForm({ ...requestForm, priority: e.target.value })}><option value="baixa">Baixa</option><option value="media">Média</option><option value="alta">Alta</option><option value="critica">Crítica</option></select></label>
          <label>Justificativa<textarea rows="3" value={requestForm.requesterNotes} onChange={(e) => setRequestForm({ ...requestForm, requesterNotes: e.target.value })} /></label>
          <div className="subtoolbar"><h4>Itens</h4><button className="ghost" onClick={addRequestItem}>Adicionar</button></div>
          {requestForm.items.map((item, i) => <div className="item-card" key={i}><div className="item-head"><strong>Item {i + 1}</strong><button type="button" className="ghost danger-outline" onClick={() => removeRequestItem(i)}>Remover</button></div><div className="form-grid"><label>Material<select value={item.materialId} onChange={(e) => updateRequestItem(i, { materialId: e.target.value })}><option value="">Selecione o material</option>{materialsCatalog.map((m) => <option key={m.id} value={m.id}>{m.name}</option>)}</select></label><label>Quantidade<input type="number" min="1" value={item.quantity} onChange={(e) => updateRequestItem(i, { quantity: e.target.value })} /></label></div></div>)}
          {!requestForm.items.length && <div className="empty-state small">Adicione ao menos um item para solicitar material.</div>}
        </div>
      </Modal>
    </div>
  );
}
