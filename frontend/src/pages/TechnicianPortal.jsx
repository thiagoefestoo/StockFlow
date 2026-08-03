/* eslint-disable react-hooks/exhaustive-deps */
import { useEffect, useMemo, useState } from 'react';
import api from '../services/api';
import { sortRecentFirst } from '../utils/recentFirst';
import { useAuth } from '../contexts/AuthContext';
import KpiCard from '../components/KpiCard';
import OperationReviewModal from '../components/OperationReviewModal';
import { formatQuantity } from '../utils/formatQuantity';
import { ADDRESS_CHANGE_OPTIONS, SERVICE_TYPE_OPTIONS, materialServiceOrderQuantityLimit, serviceOrderQuantityInputMax, serviceRequiresSerial, validateMaterialServiceOrderQuantity } from '../utils/serviceOrderRules';
import { duplicateItemIds, duplicateSerials, optionsWithoutSelected, selectedSerialsExcept } from '../utils/operationSelections';

const emptyForm = { customerName: '', customerCpf: '', customerAddress: '', city: '', serviceType: 'instalacao', addressChangeType: '', notes: '', materials: [] };

function statusLabel(value) { return ({ pendente_aprovacao: 'Pendente aprovação', aprovado: 'Aprovado', entregue: 'Entregue', reprovado: 'Reprovado', cancelado: 'Cancelado' }[value] || value || '-'); }

export default function TechnicianPortal() {
  const { user, isSupervisor } = useAuth();
  const [technicians, setTechnicians] = useState([]);
  const [selectedTech, setSelectedTech] = useState(user?.technicianId || '');
  const [stock, setStock] = useState(null);
  const [requests, setRequests] = useState([]);
  const [form, setForm] = useState(emptyForm);
  const [osFieldsOpen, setOsFieldsOpen] = useState(false);
  const [message, setMessage] = useState('');
  const [reviewOpen, setReviewOpen] = useState(false);
  const [saving, setSaving] = useState(false);
  const [serialSearches, setSerialSearches] = useState({});

  async function loadTechs() { if (isSupervisor) setTechnicians((await api.get('/technicians')).data.data); }
  async function loadStock(id = selectedTech) {
    if (!id) return;
    setStock((await api.get(`/technicians/${id}/stock`)).data.data);
    setRequests(sortRecentFirst((await api.get(`/material-requests?technicianId=${id}`)).data.data || [], ['createdAt']));
  }
  useEffect(() => { loadTechs(); if (selectedTech) loadStock(selectedTech); }, []);

  const serialByMaterial = (materialId) => (stock?.assets || []).filter((a) => Number(a.materialId) === Number(materialId));
  function technicianMaterialBalance(materialId) {
    if (!materialId) return 0;
    const material = materials.find((item) => Number(item.id) === Number(materialId));
    if (!material) return 0;
    if (material.requiresSerial) return serialByMaterial(materialId).length;
    const balance = (stock?.balances || []).find((row) => Number(row.materialId) === Number(materialId));
    return Number(balance?.quantity || 0);
  }
  const materials = useMemo(() => {
    const available = [
      ...(stock?.balances || []).filter((balance) => Number(balance.quantity || 0) > 0).map((balance) => balance.Material),
      ...(stock?.assets || []).map((asset) => asset.Material),
    ];
    return available.filter(Boolean).filter((material, index, list) => list.findIndex((item) => item.id === material.id) === index);
  }, [stock]);
  const serialRequiredForService = serviceRequiresSerial(form.serviceType, form.addressChangeType);
  const linkedCity = String(stock?.technician?.defaultWarehouse?.city || '').trim();
  const linkedWarehouseName = stock?.technician?.defaultWarehouse?.name || '';
  const pendingRequests = requests.filter((r) => r.status !== 'entregue' && r.status !== 'reprovado' && r.status !== 'cancelado');

  useEffect(() => {
    setForm((current) => (current.city === linkedCity ? current : { ...current, city: linkedCity }));
  }, [linkedCity, selectedTech]);

  function addMaterial() { setForm({ ...form, materials: [...form.materials, { materialId: '', quantity: 1, serialNumbers: [] }] }); }
  function removeMaterial(i) { setForm({ ...form, materials: form.materials.filter((_, index) => index !== i) }); }
  function updateMat(i, patch) { const next = [...form.materials]; next[i] = { ...next[i], ...patch }; setForm({ ...form, materials: next }); if (Object.prototype.hasOwnProperty.call(patch, 'materialId')) setSerialSearches((current) => ({ ...current, [i]: '' })); }
  function toggleSingleSerial(i, serialNumber) {
    const next = form.materials.map((item, index) => {
      if (index !== i) return { ...item, serialNumbers: [] };
      const already = (item.serialNumbers || []).includes(serialNumber);
      return { ...item, serialNumbers: already ? [] : [serialNumber], quantity: 1 };
    });
    setForm({ ...form, materials: next });
  }

  function validate() {
    if (!String(form.customerName || '').trim()) return 'Informe o nome do cliente.';
    if (!String(form.customerCpf || '').trim()) return 'Informe o número do contrato.';
    if (!linkedCity) return 'O técnico não possui cidade vinculada. Defina o estoque regional padrão no cadastro do técnico.';
    if (!String(form.city || '').trim()) return 'Informe a cidade onde o técnico está realizando a OS.';
    if (form.serviceType === 'outro' && !form.addressChangeType) return 'Informe se a mudança de endereço terá troca de equipamento.';
    if (!form.materials.length) return 'Adicione ao menos um material usado na OS.';
    if (duplicateItemIds(form.materials).length) return 'O mesmo material não pode aparecer mais de uma vez na OS.';
    if (duplicateSerials(form.materials).length) return 'O mesmo serial não pode aparecer mais de uma vez na OS.';
    let serialCount = 0;
    for (const item of form.materials) {
      const material = materials.find((m) => Number(m.id) === Number(item.materialId));
      if (!item.materialId || !material) return 'Selecione o material em todos os itens adicionados.';
      if (material.requiresSerial) {
        const serials = Array.isArray(item.serialNumbers) ? item.serialNumbers.filter(Boolean) : [];
        if (serials.length > 1) return 'Selecione apenas 1 serial por OS.';
        if (serials.length === 0) return `Para baixar ${material.name}, selecione o serial do equipamento ou remova o item.`;
        serialCount += serials.length;
      } else {
        const quantityError = validateMaterialServiceOrderQuantity(material, item.quantity);
        if (quantityError) return quantityError;
      }
    }
    if (serialRequiredForService && serialCount !== 1) return 'Este tipo de serviço exige exatamente 1 serial de equipamento.';
    if (!serialRequiredForService && serialCount > 1) return 'Selecione no máximo 1 serial por OS.';
    return null;
  }

  function review() {
    const error = validate();
    if (error) {
      setMessage(error);
      setOsFieldsOpen(true);
      return;
    }
    setMessage('');
    setReviewOpen(true);
  }

  async function save() {
    if (saving) return;
    const error = validate();
    if (error) {
      setReviewOpen(false);
      setMessage(error);
      setOsFieldsOpen(true);
      return;
    }
    const payload = { ...form, city: String(form.city || '').trim(), notes: form.notes, technicianId: selectedTech, materials: form.materials.map((m) => ({ ...m, serialNumbers: Array.isArray(m.serialNumbers) ? m.serialNumbers.filter(Boolean) : [] })) };
    setSaving(true);
    try {
      await api.post('/service-orders', payload);
      setReviewOpen(false);
      setForm({ ...emptyForm, city: linkedCity });
      setOsFieldsOpen(false);
      setMessage('Serviço baixado com sucesso. O estoque do técnico foi atualizado.');
      loadStock(selectedTech);
    } catch (error) {
      setMessage(error.response?.data?.message || error.message || 'Erro ao baixar OS.');
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="page-grid mobile-first">
      <section className="hero-panel"><div><span className="pill">Modo técnico</span><h2>Baixa rápida de serviço</h2><p>Ativação, upgrade e mudança com troca exigem serial. Reparo e mudança sem troca não exigem.</p></div></section>
      {message && <div className="alert danger">{message}</div>}
      {isSupervisor && <section className="panel"><label>Selecionar técnico para simulação<select value={selectedTech} onChange={(e) => { setSelectedTech(e.target.value); loadStock(e.target.value); }}><option value="">Selecione</option>{technicians.map((t) => <option key={t.id} value={t.id}>{t.name}</option>)}</select></label></section>}
      <div className="kpi-grid small"><KpiCard label="ONUs/equipamentos comigo" value={stock?.assets?.length || 0} /><KpiCard label="Materiais consumíveis" value={stock?.balances?.length || 0} /><KpiCard label="Responsável" value={stock?.technician?.name || user?.name || '-'} /></div>
      <section className="panel technician-notifications"><div className="panel-title"><div><h3>Notificações</h3><p>Acompanhe suas solicitações e cargas em andamento.</p></div><button className="ghost" onClick={() => loadStock(selectedTech)}>Atualizar</button></div><div className="notification-strip"><article><strong>{pendingRequests.length}</strong><span>em andamento</span></article><article><strong>{requests.filter((r) => r.status === 'aprovado').length}</strong><span>aprovada(s)</span></article><article><strong>{requests.filter((r) => r.status === 'entregue').length}</strong><span>entregue(s)</span></article></div>{requests.slice(0, 3).map((r) => <div className="request-notice" key={r.id}><b>{r.requestNumber}</b><span>{statusLabel(r.status)} • {formatQuantity(r.totalQuantity)} item(ns)</span></div>)}</section>
      <section className="panel">
        <h3>Preencher dados do serviço</h3>
        <button type="button" className="ghost os-mobile-toggle" onClick={() => setOsFieldsOpen((open) => !open)}>{osFieldsOpen ? 'Ocultar dados do serviço' : 'Preencher dados do serviço'}</button>
        <div className={`form-grid os-mobile-fields ${osFieldsOpen ? 'open' : ''}`}>
          <label>CPF do cliente *<input value={form.customerCpf} onChange={(e) => setForm({ ...form, customerCpf: e.target.value })} required /></label>
          <label>Nome do cliente *<input value={form.customerName} onChange={(e) => setForm({ ...form, customerName: e.target.value })} required /></label>
          <label>Endereço<input value={form.customerAddress} onChange={(e) => setForm({ ...form, customerAddress: e.target.value })} /></label>
          <label>Cidade da OS<input value={form.city} maxLength={120} onChange={(e) => setForm({ ...form, city: e.target.value })} placeholder="Digite a cidade do atendimento" required /><small>{linkedWarehouseName ? `Preenchida inicialmente pela cidade do estoque ${linkedWarehouseName}. A baixa continua vinculada a esse estoque, mas a cidade pode ser alterada.` : 'Defina o estoque padrão no cadastro do técnico.'}</small></label>
          <label>Tipo de serviço executado<select value={form.serviceType} onChange={(e) => setForm({ ...form, serviceType: e.target.value, addressChangeType: e.target.value === 'outro' ? form.addressChangeType : '' })}>{SERVICE_TYPE_OPTIONS.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}</select></label>{form.serviceType === 'outro' && <label>Troca de equipamento?<select value={form.addressChangeType} onChange={(e) => setForm({ ...form, addressChangeType: e.target.value })}><option value="">Selecione</option>{ADDRESS_CHANGE_OPTIONS.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}</select></label>}
        </div>
        <div className="subtoolbar"><h4>Material usado</h4><button className="ghost" onClick={addMaterial}>Adicionar</button></div>
        {form.materials.map((item, i) => {
          const material = materials.find((x) => Number(x.id) === Number(item.materialId));
          const usedSerials = selectedSerialsExcept(form.materials, i);
          const serials = serialByMaterial(item.materialId).filter((asset) => !usedSerials.has(String(asset.serialNumber || '').trim().toUpperCase()));
          const serialSearch = String(serialSearches[i] || '').trim().toLowerCase();
          const filteredSerials = serials.filter((asset) => !serialSearch || [asset.serialNumber, asset.mac, asset.id, asset.Material?.name].some((value) => String(value || '').toLowerCase().includes(serialSearch)));
          return <div className="item-card" key={i}><div className="item-head"><strong>Item {i + 1}</strong><button type="button" className="ghost danger-outline" onClick={() => removeMaterial(i)}>Remover</button></div><label>Material<select value={item.materialId} onChange={(e) => updateMat(i, { materialId: e.target.value, serialNumbers: [], quantity: 1 })}><option value="">Selecione o material</option>{optionsWithoutSelected(materials, form.materials, i).map((x) => <option key={x.id} value={x.id}>{x.name}</option>)}</select></label>{material?.requiresSerial ? <div className="serial-picker"><div className="serial-picker-head"><strong>Serial do equipamento</strong><small>{serialRequiredForService ? 'Obrigatório para este tipo de serviço. Selecione apenas 1 serial por OS.' : 'Opcional para o serviço, mas obrigatório se este equipamento for baixado.'}</small></div><input className="serial-search-input" value={serialSearches[i] || ''} onChange={(e) => setSerialSearches((current) => ({ ...current, [i]: e.target.value }))} placeholder="Buscar por serial, patrimônio ou MAC" /><div className="serial-list">{filteredSerials.map((asset) => { const checked = (item.serialNumbers || []).includes(asset.serialNumber); return <button type="button" className={`serial-chip ${checked ? 'selected' : ''}`} key={asset.id || asset.serialNumber} onClick={() => toggleSingleSerial(i, asset.serialNumber)}><span><b>{asset.serialNumber}</b><small>Patrimônio #{asset.id} • {asset.Material?.name || material.name}{asset.mac ? ` • MAC ${asset.mac}` : ''}</small></span><em>{checked ? 'Selecionado' : 'Selecionar'}</em></button>; })}</div>{!filteredSerials.length && <div className="empty-state small">{serialSearch ? 'Nenhum serial corresponde à busca.' : 'Nenhum serial deste material está na sua caixa.'}</div>}</div> : <label>Quantidade<input type="number" min="1" max={serviceOrderQuantityInputMax(material, technicianMaterialBalance(item.materialId))} value={item.quantity} onChange={(e) => updateMat(i, { quantity: e.target.value })} />{materialServiceOrderQuantityLimit(material) !== null && <small>Limite por OS: {materialServiceOrderQuantityLimit(material)} unidade(s).</small>}</label>}</div>;
        })}
        <button onClick={review} className="wide">Revisar baixa do serviço</button>
      </section>
      <OperationReviewModal
        open={reviewOpen}
        title="Revisar baixa do serviço"
        description="Confira os dados e os materiais antes de consumir a carga do técnico."
        onCancel={() => { if (!saving) setReviewOpen(false); }}
        onConfirm={save}
        confirmLabel={saving ? 'Confirmando...' : 'Confirmar baixa do serviço'}
        loading={saving}
        metadata={[
          { label: 'Cliente', value: form.customerName || '-' },
          { label: 'Contrato', value: form.customerCpf || '-' },
          { label: 'Serviço', value: SERVICE_TYPE_OPTIONS.find((option) => option.value === form.serviceType)?.label || form.serviceType },
          { label: 'Cidade', value: form.city || '-' },
          { label: 'Técnico', value: technicians.find((t) => String(t.id) === String(selectedTech))?.name || user?.name || '-' },
        ]}
        items={form.materials.map((item) => {
          const material = materials.find((entry) => Number(entry.id) === Number(item.materialId));
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
        warning="Após confirmar, os itens serão retirados da carga do técnico e vinculados ao registro do serviço."
      />

      <section className="panel"><h3>Minha carga atual</h3><div className="asset-grid">{stock?.assets?.map((a) => <div className="asset-card" key={a.id}><b>{a.serialNumber}</b><span>{a.Material?.name}</span><small>{a.Material?.category}</small></div>)}</div></section>
    </div>
  );
}
