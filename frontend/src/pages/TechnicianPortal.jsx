/* eslint-disable react-hooks/exhaustive-deps */
import { useEffect, useMemo, useState } from 'react';
import api from '../services/api';
import { useAuth } from '../contexts/AuthContext';
import KpiCard from '../components/KpiCard';

const emptyForm = { osNumber: '', customerName: '', customerCpf: '', customerAddress: '', city: '', serviceType: 'instalacao', materials: [] };

function brl(value) { return Number(value || 0).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' }); }
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

  async function loadTechs() { if (isSupervisor) setTechnicians((await api.get('/technicians')).data.data); }
  async function loadStock(id = selectedTech) {
    if (!id) return;
    setStock((await api.get(`/technicians/${id}/stock`)).data.data);
    setRequests((await api.get(`/material-requests?technicianId=${id}`)).data.data || []);
  }
  useEffect(() => { loadTechs(); if (selectedTech) loadStock(selectedTech); }, []);

  const serialByMaterial = (materialId) => (stock?.assets || []).filter((a) => Number(a.materialId) === Number(materialId));
  const materials = useMemo(() => [...(stock?.balances || []).map((b) => b.Material), ...(stock?.assets || []).map((a) => a.Material)].filter(Boolean).filter((m, i, arr) => arr.findIndex((x) => x.id === m.id) === i), [stock]);
  const pendingRequests = requests.filter((r) => r.status !== 'entregue' && r.status !== 'reprovado' && r.status !== 'cancelado');

  function addMaterial() { setForm({ ...form, materials: [...form.materials, { materialId: '', quantity: 1, serialNumbers: [] }] }); }
  function removeMaterial(i) { setForm({ ...form, materials: form.materials.filter((_, index) => index !== i) }); }
  function updateMat(i, patch) { const next = [...form.materials]; next[i] = { ...next[i], ...patch }; setForm({ ...form, materials: next }); }
  function toggleSingleSerial(i, serialNumber) {
    const next = form.materials.map((item, index) => {
      if (index !== i) return { ...item, serialNumbers: [] };
      const already = (item.serialNumbers || []).includes(serialNumber);
      return { ...item, serialNumbers: already ? [] : [serialNumber], quantity: 1 };
    });
    setForm({ ...form, materials: next });
  }

  function validate() {
    if (!String(form.osNumber || '').trim()) return 'Informe o número da OS.';
    if (!String(form.customerName || '').trim()) return 'Informe o nome do cliente.';
    if (!String(form.customerCpf || '').trim()) return 'Informe o CPF do cliente.';
    if (!form.materials.length) return 'Adicione ao menos um material usado na OS.';
    let serialCount = 0;
    for (const item of form.materials) {
      const material = materials.find((m) => Number(m.id) === Number(item.materialId));
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

  async function save() {
    const error = validate();
    if (error) {
      setMessage(error);
      setOsFieldsOpen(true);
      return;
    }
    const payload = { ...form, technicianId: selectedTech, materials: form.materials.map((m) => ({ ...m, serialNumbers: Array.isArray(m.serialNumbers) ? m.serialNumbers.filter(Boolean) : [] })) };
    try {
      await api.post('/service-orders', payload);
      setForm(emptyForm);
      setOsFieldsOpen(false);
      setMessage('OS baixada com sucesso. O estoque do técnico foi atualizado.');
      loadStock(selectedTech);
    } catch (error) {
      setMessage(error.response?.data?.message || error.message || 'Erro ao baixar OS.');
    }
  }

  return (
    <div className="page-grid mobile-first">
      <section className="hero-panel"><div><span className="pill">Modo técnico</span><h2>Baixa rápida por OS</h2><p>Informe nome, CPF, OS e selecione exatamente 1 serial para transferir ao cliente.</p></div></section>
      {message && <div className="alert danger">{message}</div>}
      {isSupervisor && <section className="panel"><label>Selecionar técnico para simulação<select value={selectedTech} onChange={(e) => { setSelectedTech(e.target.value); loadStock(e.target.value); }}><option value="">Selecione</option>{technicians.map((t) => <option key={t.id} value={t.id}>{t.name}</option>)}</select></label></section>}
      <div className="kpi-grid small"><KpiCard label="ONUs/equipamentos comigo" value={stock?.assets?.length || 0} /><KpiCard label="Materiais consumíveis" value={stock?.balances?.length || 0} /><KpiCard label="Responsável" value={stock?.technician?.name || user?.name || '-'} /></div>
      <section className="panel technician-notifications"><div className="panel-title"><div><h3>Notificações</h3><p>Acompanhe suas solicitações e cargas em andamento.</p></div><button className="ghost" onClick={() => loadStock(selectedTech)}>Atualizar</button></div><div className="notification-strip"><article><strong>{pendingRequests.length}</strong><span>em andamento</span></article><article><strong>{requests.filter((r) => r.status === 'aprovado').length}</strong><span>aprovada(s)</span></article><article><strong>{requests.filter((r) => r.status === 'entregue').length}</strong><span>entregue(s)</span></article></div>{requests.slice(0, 3).map((r) => <div className="request-notice" key={r.id}><b>{r.requestNumber}</b><span>{statusLabel(r.status)} • {Number(r.totalQuantity || 0)} item(ns)</span></div>)}</section>
      <section className="panel">
        <h3>Preencher OS</h3>
        <button type="button" className="ghost os-mobile-toggle" onClick={() => setOsFieldsOpen((open) => !open)}>{osFieldsOpen ? 'Ocultar dados da OS' : 'Preencher dados da OS'}</button>
        <div className={`form-grid os-mobile-fields ${osFieldsOpen ? 'open' : ''}`}>
          <label>Nº da OS<input value={form.osNumber} onChange={(e) => setForm({ ...form, osNumber: e.target.value })} required /></label>
          <label>CPF do cliente *<input value={form.customerCpf} onChange={(e) => setForm({ ...form, customerCpf: e.target.value })} required /></label>
          <label>Nome do cliente *<input value={form.customerName} onChange={(e) => setForm({ ...form, customerName: e.target.value })} required /></label>
          <label>Endereço<input value={form.customerAddress} onChange={(e) => setForm({ ...form, customerAddress: e.target.value })} /></label>
          <label>Cidade<input value={form.city} onChange={(e) => setForm({ ...form, city: e.target.value })} /></label>
          <label>Tipo<select value={form.serviceType} onChange={(e) => setForm({ ...form, serviceType: e.target.value })}><option value="instalacao">Instalação</option><option value="manutencao">Manutenção</option><option value="troca_onu">Troca de ONU</option><option value="retirada">Retirada</option></select></label>
        </div>
        <div className="subtoolbar"><h4>Material usado</h4><button className="ghost" onClick={addMaterial}>Adicionar</button></div>
        {form.materials.map((item, i) => {
          const material = materials.find((x) => Number(x.id) === Number(item.materialId));
          const serials = serialByMaterial(item.materialId);
          return <div className="item-card" key={i}><div className="item-head"><strong>Item {i + 1}</strong><button type="button" className="ghost danger-outline" onClick={() => removeMaterial(i)}>Remover</button></div><label>Material<select value={item.materialId} onChange={(e) => updateMat(i, { materialId: e.target.value, serialNumbers: [], quantity: 1 })}><option value="">Selecione o material</option>{materials.map((x) => <option key={x.id} value={x.id}>{x.name}</option>)}</select></label>{material?.requiresSerial ? <div className="serial-picker"><div className="serial-picker-head"><strong>Serial obrigatório</strong><small>Selecione apenas 1 serial por OS.</small></div><div className="serial-list">{serials.map((asset) => { const checked = (item.serialNumbers || []).includes(asset.serialNumber); return <button type="button" className={`serial-chip ${checked ? 'selected' : ''}`} key={asset.id || asset.serialNumber} onClick={() => toggleSingleSerial(i, asset.serialNumber)}><span><b>{asset.serialNumber}</b><small>{asset.Material?.name || material.name} • {asset.status || 'com_tecnico'}</small></span><em>{checked ? 'Selecionado' : 'Selecionar'}</em></button>; })}</div>{!serials.length && <div className="empty-state small">Nenhum serial deste material está na sua caixa.</div>}</div> : <label>Quantidade<input type="number" value={item.quantity} onChange={(e) => updateMat(i, { quantity: e.target.value })} /></label>}</div>;
        })}
        <button onClick={save} className="wide">Baixar OS e consumir material</button>
      </section>
      <section className="panel"><h3>Minha carga atual</h3><div className="asset-grid">{stock?.assets?.map((a) => <div className="asset-card" key={a.id}><b>{a.serialNumber}</b><span>{a.Material?.name}</span><small>{a.Material?.category}</small></div>)}</div></section>
    </div>
  );
}
