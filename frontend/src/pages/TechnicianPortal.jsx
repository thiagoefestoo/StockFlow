/* eslint-disable react-hooks/exhaustive-deps */
import { useEffect, useState } from 'react';
import api from '../services/api';
import { useAuth } from '../contexts/AuthContext';
import KpiCard from '../components/KpiCard';

export default function TechnicianPortal() {
  const { user, isSupervisor } = useAuth();
  const [technicians, setTechnicians] = useState([]);
  const [selectedTech, setSelectedTech] = useState(user?.technicianId || '');
  const [stock, setStock] = useState(null);
  const [form, setForm] = useState({ osNumber: '', customerName: '', customerCpf: '', customerAddress: '', serviceType: 'instalacao', materials: [] });
  const [message, setMessage] = useState('');
  async function loadTechs() { if (isSupervisor) setTechnicians((await api.get('/technicians')).data.data); }
  async function loadStock(id = selectedTech) { if (!id) return; setStock((await api.get(`/technicians/${id}/stock`)).data.data); }
  useEffect(() => { loadTechs(); if (selectedTech) loadStock(selectedTech); }, []);
  function addMaterial() { setForm({ ...form, materials: [...form.materials, { materialId: stock?.balances?.[0]?.materialId || stock?.assets?.[0]?.materialId || '', quantity: 1, serialNumbersText: '' }] }); }
  function updateMat(i, patch) { const materials = [...form.materials]; materials[i] = { ...materials[i], ...patch }; setForm({ ...form, materials }); }
  function toggleMatSerial(i, serialNumber) { const materials = [...form.materials]; const current = Array.isArray(materials[i].serialNumbers) ? materials[i].serialNumbers : []; const next = current.includes(serialNumber) ? current.filter((serial) => serial !== serialNumber) : [...current, serialNumber]; materials[i] = { ...materials[i], serialNumbers: next, serialNumbersText: next.join('\n'), quantity: next.length || 1 }; setForm({ ...form, materials }); }
  async function save() {
    const payload = { ...form, technicianId: selectedTech, materials: form.materials.map((m) => { const selectedSerials = Array.isArray(m.serialNumbers) && m.serialNumbers.length ? m.serialNumbers : String(m.serialNumbersText || '').split(/\n|,|;/).map((s) => s.trim()).filter(Boolean); return { ...m, serialNumbers: selectedSerials, serialNumbersText: selectedSerials.join('\n'), quantity: selectedSerials.length || m.quantity }; }) };
    try {
      await api.post('/service-orders', payload);
      setForm({ osNumber: '', customerName: '', customerCpf: '', customerAddress: '', serviceType: 'instalacao', materials: [] });
      setMessage('OS baixada com sucesso. O estoque do técnico foi atualizado.');
      loadStock(selectedTech);
    } catch (error) {
      setMessage(error.response?.data?.message || error.message || 'Erro ao baixar OS.');
    }
  }
  const serialByMaterial = (materialId) => (stock?.assets || []).filter((a) => Number(a.materialId) === Number(materialId));
  const materials = [...(stock?.balances || []).map((b) => b.Material), ...(stock?.assets || []).map((a) => a.Material)].filter(Boolean).filter((m, i, arr) => arr.findIndex((x) => x.id === m.id) === i);
  return (
    <div className="page-grid mobile-first">
      <section className="hero-panel"><div><span className="pill">Modo técnico</span><h2>Baixa rápida por OS</h2><p>Informe OS, CPF, cliente e material utilizado. O sistema atualiza sua carga automaticamente.</p></div></section>
      {message && <div className="alert danger">{message}</div>}
      {isSupervisor && <section className="panel"><label>Selecionar técnico para simulação<select value={selectedTech} onChange={(e) => { setSelectedTech(e.target.value); loadStock(e.target.value); }}><option value="">Selecione</option>{technicians.map((t) => <option key={t.id} value={t.id}>{t.name}</option>)}</select></label></section>}
      <div className="kpi-grid small"><KpiCard label="ONUs/equipamentos comigo" value={stock?.assets?.length || 0} /><KpiCard label="Materiais consumíveis" value={stock?.balances?.length || 0} /><KpiCard label="Responsável" value={stock?.technician?.name || user?.name || '-'} /></div>
      <section className="panel"><h3>Preencher OS</h3><div className="form-grid"><label>Nº da OS<input value={form.osNumber} onChange={(e) => setForm({ ...form, osNumber: e.target.value })} /></label><label>CPF do cliente<input value={form.customerCpf} onChange={(e) => setForm({ ...form, customerCpf: e.target.value })} /></label><label>Nome do cliente<input value={form.customerName} onChange={(e) => setForm({ ...form, customerName: e.target.value })} /></label><label>Endereço<input value={form.customerAddress} onChange={(e) => setForm({ ...form, customerAddress: e.target.value })} /></label><label>Tipo<select value={form.serviceType} onChange={(e) => setForm({ ...form, serviceType: e.target.value })}><option value="instalacao">Instalação</option><option value="manutencao">Manutenção</option><option value="troca_onu">Troca de ONU</option><option value="retirada">Retirada</option></select></label></div><div className="subtoolbar"><h4>Material usado</h4><button className="ghost" onClick={addMaterial}>Adicionar</button></div>{form.materials.map((m, i) => { const material = materials.find((x) => Number(x.id) === Number(m.materialId)); return <div className="item-card" key={i}><label>Material<select value={m.materialId} onChange={(e) => updateMat(i, { materialId: e.target.value, serialNumbersText: '' })}>{materials.map((x) => <option key={x.id} value={x.id}>{x.name}</option>)}</select></label>{material?.requiresSerial ? <div className="serial-picker"><div className="serial-picker-head"><strong>Seriais sob sua custódia</strong><small>Selecione o serial instalado nesta OS.</small></div>{serialByMaterial(m.materialId).length ? <div className="serial-list">{serialByMaterial(m.materialId).map((a) => <label className="serial-option" key={a.id || a.serialNumber}><input type="checkbox" checked={(m.serialNumbers || []).includes(a.serialNumber)} onChange={() => toggleMatSerial(i, a.serialNumber)} /><span><b>{a.serialNumber}</b><small>{a.Material?.name || material?.name} • {a.status || 'com_tecnico'}</small></span></label>)}</div> : <div className="empty-state small">Nenhum serial disponível para este material na sua custódia.</div>}</div> : <label>Quantidade<input type="number" value={m.quantity} onChange={(e) => updateMat(i, { quantity: e.target.value })} /></label>}</div>; })}<button onClick={save} className="wide">Baixar OS e consumir material</button></section>
      <section className="panel"><h3>Minha carga atual</h3><div className="asset-grid">{stock?.assets?.map((a) => <div className="asset-card" key={a.id}><b>{a.serialNumber}</b><span>{a.Material?.name}</span><small>{a.Material?.category}</small></div>)}</div></section>
    </div>
  );
}
