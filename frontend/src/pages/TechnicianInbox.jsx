/* eslint-disable react-hooks/exhaustive-deps */
import { useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import api from '../services/api';
import { useAuth } from '../contexts/AuthContext';
import Modal from '../components/Modal';
import DetailsModal, { DetailGrid } from '../components/DetailsModal';
import KpiCard from '../components/KpiCard';
import OperationReviewModal from '../components/OperationReviewModal';
import { formatQuantity } from '../utils/formatQuantity';
import { ADDRESS_CHANGE_OPTIONS, SERVICE_TYPE_OPTIONS, serviceRequiresSerial } from '../utils/serviceOrderRules';
import { duplicateItemIds, duplicateSerials, optionsWithoutSelected, selectedSerialsExcept } from '../utils/operationSelections';

const osEmpty = { osNumber: '', customerName: '', customerCpf: '', customerAddress: '', city: '', serviceType: 'instalacao', addressChangeType: '', notes: '', materials: [] };
const reqEmpty = { priority: 'media', requesterNotes: '', items: [] };

function brl(value) { return Number(value || 0).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' }); }
function dt(value) { return value ? new Date(value).toLocaleString('pt-BR') : '-'; }
function categoryGroup(category) { const c = String(category || '').toLowerCase(); if (c.includes('onu') || c.includes('roteador')) return 'ONU e equipamentos'; if (c.includes('cabo') || c.includes('drop')) return 'Cabo/drop'; if (c.includes('conector') || c.includes('esticador')) return 'Conectores e fixação'; return 'Outros materiais'; }
function statusLabel(value) { return ({ pendente_aprovacao: 'Pendente aprovação', aprovado: 'Aprovado', entregue: 'Entregue', reprovado: 'Reprovado', cancelado: 'Cancelado' }[value] || value || '-'); }
function sectionLabel(key) { return ({ resumo: 'Resumo', baixa: 'Baixar OS', caixa: 'Minha carga', solicitacoes: 'Solicitações' }[key] || key); }

export default function TechnicianInbox() {
  const navigate = useNavigate();
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
  const [requestConfirmOpen, setRequestConfirmOpen] = useState(false);
  const [submittingRequest, setSubmittingRequest] = useState(false);
  const [osReviewOpen, setOsReviewOpen] = useState(false);
  const [submittingOs, setSubmittingOs] = useState(false);
  const [serialSearches, setSerialSearches] = useState({});

  async function loadTechs() { if (isSupervisor) setTechnicians((await api.get('/technicians')).data.data || []); }
  async function loadStock(id = selectedTech) {
    if (!id) {
      setStock(null);
      setRequests([]);
      return;
    }
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
    const refreshWhenVisible = () => {
      if (document.visibilityState === 'visible') refresh();
    };
    const interval = setInterval(refreshWhenVisible, 60000);
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
  const stockMaterials = useMemo(() => {
    const available = [
      ...(stock?.balances || []).filter((balance) => Number(balance.quantity || 0) > 0).map((balance) => balance.Material),
      ...(stock?.assets || []).map((asset) => asset.Material),
    ];
    return available.filter(Boolean).filter((material, index, list) => list.findIndex((item) => item.id === material.id) === index);
  }, [stock]);
  function technicianMaterialBalance(materialId) {
    if (!materialId) return 0;
    const material = stockMaterials.find((item) => Number(item.id) === Number(materialId));
    if (!material) return 0;
    if (material.requiresSerial) return serialByMaterial(materialId).length;
    const balance = (stock?.balances || []).find((row) => Number(row.materialId) === Number(materialId));
    return Number(balance?.quantity || 0);
  }

  const serialRequiredForService = serviceRequiresSerial(osForm.serviceType, osForm.addressChangeType);
  const linkedCity = String(stock?.technician?.defaultWarehouse?.city || '').trim();
  const linkedWarehouseName = stock?.technician?.defaultWarehouse?.name || '';

  useEffect(() => {
    setOsForm((current) => (current.city === linkedCity ? current : { ...current, city: linkedCity }));
  }, [linkedCity]);
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
    if (Object.prototype.hasOwnProperty.call(patch, 'materialId')) {
      setSerialSearches((current) => ({ ...current, [i]: '' }));
    }
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

  function openRequestModal() {
    setRequestForm({ ...reqEmpty, items: [{ materialId: '', quantity: 1 }] });
    setRequestConfirmOpen(false);
    setMessage('');
    setRequestModal(true);
  }

  function addRequestItem() {
    setRequestForm({ ...requestForm, items: [...requestForm.items, { materialId: '', quantity: 1 }] });
  }
  function updateRequestItem(i, patch) { const items = [...requestForm.items]; items[i] = { ...items[i], ...patch }; setRequestForm({ ...requestForm, items }); }
  function removeRequestItem(i) { setRequestForm({ ...requestForm, items: requestForm.items.filter((_, index) => index !== i) }); }

  function validateOs() {
    if (!String(osForm.osNumber || '').trim()) return 'Informe o número da OS.';
    if (!String(osForm.customerName || '').trim()) return 'Informe o nome do cliente.';
    if (!String(osForm.customerCpf || '').trim()) return 'Informe o número do contrato.';
    if (!linkedCity) return 'O técnico não possui cidade vinculada. Defina o estoque regional padrão no cadastro do técnico.';
    if (osForm.serviceType === 'outro' && !osForm.addressChangeType) return 'Informe se a mudança de endereço terá troca de equipamento.';
    if (!osForm.materials.length) return 'Adicione ao menos um material usado na OS.';
    if (duplicateItemIds(osForm.materials).length) return 'O mesmo material não pode aparecer mais de uma vez na OS.';
    if (duplicateSerials(osForm.materials).length) return 'O mesmo serial não pode aparecer mais de uma vez na OS.';

    let serialCount = 0;
    for (const item of osForm.materials) {
      const material = stockMaterials.find((x) => Number(x.id) === Number(item.materialId));
      if (!item.materialId || !material) return 'Selecione o material em todos os itens adicionados.';
      if (material.requiresSerial) {
        const serials = Array.isArray(item.serialNumbers) ? item.serialNumbers.filter(Boolean) : [];
        if (serials.length > 1) return 'Selecione apenas 1 serial por OS.';
        if (serials.length === 0) return `Para baixar ${material.name}, selecione o serial do equipamento ou remova o item.`;
        serialCount += serials.length;
      } else if (Number(item.quantity || 0) <= 0) {
        return `Informe uma quantidade válida para ${material.name}.`;
      }
    }
    if (serialRequiredForService && serialCount !== 1) return 'Este tipo de serviço exige exatamente 1 serial de equipamento.';
    if (!serialRequiredForService && serialCount > 1) return 'Selecione no máximo 1 serial por OS.';
    return null;
  }

  function reviewOs() {
    const validation = validateOs();
    if (validation) {
      setMessage(validation);
      setOsFieldsOpen(true);
      setActiveMobileSection('baixa');
      return;
    }
    setMessage('');
    setOsReviewOpen(true);
  }

  async function saveOs() {
    if (submittingOs) return;
    const validation = validateOs();
    if (validation) {
      setOsReviewOpen(false);
      setMessage(validation);
      setOsFieldsOpen(true);
      setActiveMobileSection('baixa');
      return;
    }
    setSubmittingOs(true);
    try {
      const payload = { ...osForm, city: linkedCity, notes: osForm.notes, technicianId: selectedTech, materials: osForm.materials.map((m) => ({ ...m, serialNumbers: Array.isArray(m.serialNumbers) ? m.serialNumbers.filter(Boolean) : [] })) };
      await api.post('/service-orders', payload);
      setMessage('OS baixada com sucesso. Sua caixa foi atualizada e o histórico foi gravado.');
      setOsReviewOpen(false);
      setOsForm({ ...osEmpty, city: linkedCity });
      setOsFieldsOpen(false);
      setActiveMobileSection('resumo');
      loadStock(selectedTech);
    } catch (error) {
      setMessage(error.response?.data?.message || error.message || 'Erro ao baixar OS.');
    } finally {
      setSubmittingOs(false);
    }
  }

  function changeSelectedTechnician(value) {
    setSelectedTech(value);
    setStock(null);
    setRequests([]);
    loadStock(value);
  }

  function requestConfirmation() {
    try {
      if (!selectedTech) throw new Error('Selecione o técnico antes de solicitar material.');
      if (!String(requestForm.requesterNotes || '').trim()) throw new Error('Informe a justificativa da solicitação.');
      const cleanItems = requestForm.items.filter((item) => item.materialId && Number(item.quantity || 0) > 0);
      if (!cleanItems.length) throw new Error('Adicione ao menos um material na solicitação.');
      if (duplicateItemIds(cleanItems).length) throw new Error('O mesmo material não pode aparecer mais de uma vez na solicitação.');
      setRequestModal(false);
      setRequestConfirmOpen(true);
    } catch (error) {
      setMessage(error.message || 'Revise a solicitação.');
    }
  }

  async function sendRequest() {
    if (submittingRequest) return;
    setSubmittingRequest(true);
    try {
      const cleanItems = requestForm.items.filter((item) => item.materialId && Number(item.quantity || 0) > 0);
      if (!cleanItems.length) throw new Error('Adicione ao menos um material na solicitação.');
      if (duplicateItemIds(cleanItems).length) throw new Error('O mesmo material não pode aparecer mais de uma vez na solicitação.');
      const response = await api.post('/material-requests', { ...requestForm, items: cleanItems, technicianId: selectedTech });
      setMessage(response.data?.message || 'Solicitação registrada.');
      setRequestConfirmOpen(false);
      setRequestModal(false);
      setRequestForm(reqEmpty);
      setActiveMobileSection('solicitacoes');
      loadStock(selectedTech);
    } catch (error) {
      setMessage(error.response?.data?.message || error.message || 'Erro ao solicitar material.');
      setRequestConfirmOpen(false);
      setRequestModal(true);
    } finally {
      setSubmittingRequest(false);
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
          <button type="button" onClick={() => navigate('/solicitacoes-material')} disabled={!selectedTech}>Solicitar material</button>
          <button type="button" className="ghost" onClick={() => loadStock(selectedTech)} disabled={!selectedTech}>Atualizar</button>
        </div>
      </section>

      {message && <div className="alert danger">{message}</div>}
      {isSupervisor && <section className={`panel technician-operator-panel ${selectedTech ? 'technician-selected' : 'technician-required'}`}><label>Operar como técnico<select value={selectedTech} onChange={(e) => changeSelectedTechnician(e.target.value)}><option value="">Selecione o técnico</option>{technicians.map((t) => <option key={t.id} value={t.id}>{t.name}</option>)}</select><small>{selectedTech ? 'Técnico selecionado. Você já pode operar a caixa.' : 'Selecione um técnico para liberar as operações desta página.'}</small></label></section>}

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
          <button type="button" className="ghost" onClick={() => navigate('/solicitacoes-material')}>Solicitar material</button>
        </div>
        {requests.slice(0, 4).map((r) => <button type="button" className="request-notice" key={r.id} onClick={() => setDetails({ type: 'request', item: r })}><b>{r.requestNumber}</b><span>{statusLabel(r.status)} • {formatQuantity(r.totalQuantity)} item(ns) • {dt(r.updatedAt)}</span></button>)}
        {!requests.length && <div className="empty-state small">Nenhuma solicitação registrada para sua caixa.</div>}
      </section>

      <section className="two-col technician-work-area">
        <article className={`panel os-work-card ${mobileSectionClass('baixa')}`}>
          <div className="panel-title compact-title"><div><h3>Baixar material por OS</h3><p>Informe o serviço executado. Ativação, upgrade e mudança com troca exigem serial; reparo e mudança sem troca não exigem.</p></div></div>
          <button type="button" className="ghost os-mobile-toggle" onClick={() => setOsFieldsOpen((open) => !open)}>{osFieldsOpen ? 'Ocultar dados da OS' : 'Preencher dados da OS'}</button>
          <div className={`form-grid os-mobile-fields ${osFieldsOpen ? 'open' : ''}`}>
            <label>Nº da OS<input value={osForm.osNumber} onChange={(e) => setOsForm({ ...osForm, osNumber: e.target.value })} required /></label>
            <label>Número do contrato *<input value={osForm.customerCpf} onChange={(e) => setOsForm({ ...osForm, customerCpf: e.target.value })} required /></label>
            <label>Nome do cliente *<input value={osForm.customerName} onChange={(e) => setOsForm({ ...osForm, customerName: e.target.value })} required /></label>
            <label>Endereço<input value={osForm.customerAddress} onChange={(e) => setOsForm({ ...osForm, customerAddress: e.target.value })} /></label>
            <label>Cidade vinculada<select value={linkedCity} disabled><option value={linkedCity}>{linkedCity || 'Técnico sem cidade vinculada'}</option></select><small>{linkedWarehouseName ? `Definida pelo estoque regional ${linkedWarehouseName}.` : 'Defina o estoque padrão no cadastro do técnico.'}</small></label>
            <label>Tipo de serviço executado<select value={osForm.serviceType} onChange={(e) => setOsForm({ ...osForm, serviceType: e.target.value, addressChangeType: e.target.value === 'outro' ? osForm.addressChangeType : '' })}>{SERVICE_TYPE_OPTIONS.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}</select></label>
            {osForm.serviceType === 'outro' && <label>Troca de equipamento?<select value={osForm.addressChangeType} onChange={(e) => setOsForm({ ...osForm, addressChangeType: e.target.value })}><option value="">Selecione</option>{ADDRESS_CHANGE_OPTIONS.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}</select></label>}
          </div>
          <div className="subtoolbar"><h4>Material usado</h4><div className="row-actions"><button className="ghost desktop-action" onClick={addStandardKit}>Usar kit padrão</button><button className="ghost" onClick={addOsMaterial}>Adicionar item</button></div></div>
          {osForm.materials.map((m, i) => {
            const material = stockMaterials.find((x) => Number(x.id) === Number(m.materialId));
            const usedSerials = selectedSerialsExcept(osForm.materials, i);
            const serials = serialByMaterial(m.materialId).filter((asset) => !usedSerials.has(String(asset.serialNumber || '').trim().toUpperCase()));
            const serialSearch = String(serialSearches[i] || '').trim().toLowerCase();
            const filteredSerials = serials.filter((asset) => !serialSearch || [asset.serialNumber, asset.mac, asset.id, asset.Material?.name].some((value) => String(value || '').toLowerCase().includes(serialSearch)));
            const availableBalance = technicianMaterialBalance(m.materialId);
            return <div className="item-card technician-os-item" key={i}>
              <div className="item-head"><strong>Item {i + 1}</strong><button type="button" className="ghost danger-outline" onClick={() => removeOsMaterial(i)}>Remover</button></div>
              <label>Material<select value={m.materialId} onChange={(e) => updateOsMaterial(i, { materialId: e.target.value, serialNumbers: [], quantity: 1 })}><option value="">Selecione o material</option>{optionsWithoutSelected(stockMaterials, osForm.materials, i).map((x) => <option key={x.id} value={x.id}>{x.name}</option>)}</select></label>
              {material && <div className={`technician-box-balance ${availableBalance <= 0 ? 'empty' : ''}`}>
                <span>Saldo na caixa do técnico</span>
                <strong>{formatQuantity(availableBalance, material.unit)}</strong>
                <small>{material.requiresSerial ? `${serials.length} serial(is) disponível(is) para baixa` : 'Quantidade máxima disponível para esta OS'}</small>
              </div>}
              {material?.requiresSerial ? <div className="serial-picker"><div className="serial-picker-head"><strong>Serial do equipamento</strong><small>{serialRequiredForService ? 'Obrigatório para este tipo de serviço. Selecione apenas 1 serial por OS.' : 'Opcional para o serviço, mas obrigatório se este equipamento for baixado.'}</small></div><input className="serial-search-input" value={serialSearches[i] || ''} onChange={(e) => setSerialSearches((current) => ({ ...current, [i]: e.target.value }))} placeholder="Buscar por serial, patrimônio ou MAC" /><div className="serial-list compact-serial-list">{filteredSerials.map((asset) => { const checked = (m.serialNumbers || []).includes(asset.serialNumber); return <button type="button" className={`serial-chip ${checked ? 'selected' : ''}`} key={asset.id || asset.serialNumber} onClick={() => toggleSingleSerial(i, asset.serialNumber)}><span><b>{asset.serialNumber}</b><small>Patrimônio #{asset.id} • {asset.Material?.name || material.name}{asset.mac ? ` • MAC ${asset.mac}` : ''}</small></span><em>{checked ? 'Selecionado' : 'Selecionar'}</em></button>; })}</div>{!filteredSerials.length && <div className="empty-state small">{serialSearch ? 'Nenhum serial corresponde à busca.' : 'Nenhum serial deste material está na sua caixa.'}</div>}</div> : <label>Quantidade<input type="number" min="1" max={availableBalance || undefined} value={m.quantity} onChange={(e) => updateOsMaterial(i, { quantity: e.target.value })} /><small>Saldo disponível: {formatQuantity(availableBalance, material?.unit)}</small></label>}
            </div>;
          })}
          {!osForm.materials.length && <div className="empty-state small">Clique em “Adicionar item” para informar o material usado na OS.</div>}
          <button onClick={reviewOs} className="wide">Revisar baixa da OS</button>
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
        <div className="panel-title compact-title"><div><h3>Minhas solicitações recentes</h3><p>Fila de aprovação e expedição do material pedido.</p></div><button type="button" onClick={openRequestModal}>Nova solicitação</button></div>
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

      <OperationReviewModal
        open={osReviewOpen}
        title="Revisar baixa da ordem de serviço"
        description="Confira os dados do cliente, o serviço e todos os materiais antes de atualizar a caixa do técnico."
        onCancel={() => { if (!submittingOs) setOsReviewOpen(false); }}
        onConfirm={saveOs}
        confirmLabel={submittingOs ? 'Confirmando...' : 'Confirmar baixa da OS'}
        loading={submittingOs}
        metadata={[
          { label: 'OS', value: osForm.osNumber || '-' },
          { label: 'Cliente', value: osForm.customerName || '-' },
          { label: 'Contrato', value: osForm.customerCpf || '-' },
          { label: 'Serviço', value: SERVICE_TYPE_OPTIONS.find((option) => option.value === osForm.serviceType)?.label || osForm.serviceType },
          { label: 'Cidade', value: osForm.city || '-' },
          { label: 'Técnico', value: technicians.find((t) => String(t.id) === String(selectedTech))?.name || user?.name || '-' },
        ]}
        items={osForm.materials.map((item) => {
          const material = stockMaterials.find((entry) => Number(entry.id) === Number(item.materialId));
          const serials = Array.isArray(item.serialNumbers) ? item.serialNumbers.filter(Boolean) : [];
          const quantity = material?.requiresSerial ? serials.length : Number(item.quantity || 0);
          return {
            name: material?.name || 'Material não identificado',
            detail: material?.requiresSerial ? 'Equipamento controlado por serial' : `Unidade: ${material?.unit || 'un'}`,
            quantity,
            serialCount: serials.length,
            serialPreview: serials.join(', '),
            totalValue: quantity * Number(material?.unitCost || 0),
          };
        })}
        warning="Após a confirmação, os materiais serão baixados da caixa do técnico e vinculados à ordem de serviço."
      />

      <DetailsModal open={!!details} title="Detalhes da caixa do técnico" onClose={() => setDetails(null)}>
        {details?.type === 'asset' && <DetailGrid fields={[["Serial", details.item.serialNumber], ["Material", details.item.Material?.name], ["Categoria", details.item.Material?.category], ["Status", details.item.status], ["Valor", brl(details.item.acquisitionCost || details.item.Material?.unitCost)], ["Custódia desde", details.item.custodyStartedAt], ["Último movimento", details.item.lastMovementAt]]} />}
        {details?.type === 'group' && <><DetailGrid fields={[["Material", details.item.material], ["Categoria", details.item.category], ["Quantidade", formatQuantity(details.item.quantity, details.item.unit)], ["Valor", brl(details.item.value)], ["Serializado", details.item.requiresSerial ? 'Sim' : 'Não']]} />{details.item.requiresSerial && <div className="table-wrap compact"><table><thead><tr><th>Serial</th></tr></thead><tbody>{(details.item.serials || []).map((serial) => <tr key={serial}><td>{serial}</td></tr>)}</tbody></table></div>}</>}
        {details?.type === 'balance' && <DetailGrid fields={[["Material", details.item.Material?.name], ["Categoria", details.item.Material?.category], ["Quantidade", formatQuantity(details.item.quantity, details.item.Material?.unit)], ["Valor unitário", brl(details.item.Material?.unitCost)], ["Valor estimado", brl(Number(details.item.quantity || 0) * Number(details.item.Material?.unitCost || 0))]]} />}
        {details?.type === 'request' && <DetailGrid fields={[["Solicitação", details.item.requestNumber], ["Status", statusLabel(details.item.status)], ["Prioridade", details.item.priority], ["Itens", formatQuantity(details.item.totalQuantity)], ["Valor", brl(details.item.totalValue)], ["Atualização", dt(details.item.updatedAt)], ["Observação", details.item.requesterNotes]]} />}
      </DetailsModal>

      <Modal open={requestModal} title="Solicitar reposição de carga" onClose={() => setRequestModal(false)} footer={<><button className="ghost" onClick={() => setRequestModal(false)}>Cancelar</button><button onClick={requestConfirmation}>Enviar solicitação</button></>}>
        <div className="form-stack">
          <label>Prioridade<select value={requestForm.priority} onChange={(e) => setRequestForm({ ...requestForm, priority: e.target.value })}><option value="baixa">Baixa</option><option value="media">Média</option><option value="alta">Alta</option><option value="critica">Crítica</option></select></label>
          <label>Justificativa<textarea rows="3" value={requestForm.requesterNotes} onChange={(e) => setRequestForm({ ...requestForm, requesterNotes: e.target.value })} /></label>
          <div className="subtoolbar"><h4>Itens</h4><button className="ghost" onClick={addRequestItem}>Adicionar</button></div>
          {requestForm.items.map((item, i) => <div className="item-card" key={i}><div className="item-head"><strong>Item {i + 1}</strong><button type="button" className="ghost danger-outline" onClick={() => removeRequestItem(i)}>Remover</button></div><div className="form-grid"><label>Material<select value={item.materialId} onChange={(e) => updateRequestItem(i, { materialId: e.target.value })}><option value="">Selecionar item</option>{optionsWithoutSelected(materialsCatalog, requestForm.items, i).map((m) => <option key={m.id} value={m.id}>{m.name}</option>)}</select></label><label>Quantidade<input type="number" min="1" value={item.quantity} onChange={(e) => updateRequestItem(i, { quantity: e.target.value })} /></label></div></div>)}
          {!requestForm.items.length && <div className="empty-state small">Adicione ao menos um item para solicitar material.</div>}
        </div>
      </Modal>

      <Modal
        open={requestConfirmOpen}
        title="Confirmar solicitação"
        onClose={() => { if (!submittingRequest) { setRequestConfirmOpen(false); setRequestModal(true); } }}
        footer={<>
          <button type="button" className="ghost" disabled={submittingRequest} onClick={() => { setRequestConfirmOpen(false); setRequestModal(true); }}>Não</button>
          <button type="button" disabled={submittingRequest} onClick={sendRequest}>{submittingRequest ? 'Enviando...' : 'Sim, solicitar'}</button>
        </>}
      >
        <p><strong>Deseja realmente solicitar esse pedido?</strong></p>
        <div className="detail-grid compact">
          <div className="detail-card"><span>Técnico</span><strong>{technicians.find((t) => String(t.id) === String(selectedTech))?.name || user?.name || '-'}</strong></div>
          <div className="detail-card"><span>Itens</span><strong>{formatQuantity(requestForm.items.reduce((sum, item) => sum + Number(item.quantity || 0), 0))}</strong></div>
        </div>
      </Modal>
    </div>
  );
}
