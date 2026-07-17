import { useEffect, useMemo, useState } from 'react';
import api from '../services/api';
import Modal from '../components/Modal';
import DetailsModal, { DetailGrid, DetailList } from '../components/DetailsModal';
import KpiCard from '../components/KpiCard';

function brl(value) { return Number(value || 0).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' }); }
function splitSerials(value) { return String(value || '').split(/\n|,|;/).map((s) => s.trim()).filter(Boolean); }
function today() { return new Date().toISOString().slice(0, 10); }
function emptyForm() {
  return { receiptNumber: '', sourceCompany: 'Companhia Telecom', receivedAt: today(), cycle: 'quinzenal', fiscalDocumentType: 'nota_fiscal', fiscalDocumentNumber: '', fiscalDocumentDate: today(), fiscalIssuer: 'Companhia Telecom', invoiceAccessKey: '', receivedByName: '', conferenceStatus: 'conferido', warehouseLocation: '', warehouseId: '', proofAttachmentName: '', proofAttachmentData: '', notes: '', items: [] };
}

export default function Receiving() {
  const [materials, setMaterials] = useState([]);
  const [warehouses, setWarehouses] = useState([]);
  const [batches, setBatches] = useState([]);
  const [form, setForm] = useState(emptyForm());
  const [modal, setModal] = useState(false);
  const [details, setDetails] = useState(null);
  const [message, setMessage] = useState('');

  async function load() {
    const [m, b, w] = await Promise.all([api.get('/materials'), api.get('/batches'), api.get('/warehouses').catch(() => ({ data: { data: [] } }))]);
    setMaterials(m.data.data || []);
    setBatches(b.data.data || []);
    setWarehouses(w.data.data || []);
  }
  useEffect(() => { load(); }, []);
  const totals = useMemo(() => ({ totalValue: batches.reduce((s, b) => s + Number(b.totalValue || 0), 0), totalItems: batches.reduce((s, b) => s + Number(b.totalItems || 0), 0), withProof: batches.filter((b) => b.proofAttachmentName).length }), [batches]);

  function addItem() { setForm({ ...form, items: [...form.items, { materialId: materials[0]?.id || '', quantity: 1, unitCost: materials[0]?.unitCost || 0, serialsText: '', manufacturerLot: '', purchaseOrder: '', condition: 'novo', warehouseLocation: '', itemNotes: '', serialPrefix: '', serialStart: 1, serialDigits: 4, serialCount: 1 }] }); }
  function updateItem(index, patch) { const items = [...form.items]; items[index] = { ...items[index], ...patch }; setForm({ ...form, items }); }
  function removeItem(index) { setForm({ ...form, items: form.items.filter((_, i) => i !== index) }); }
  function generateSerials(index) {
    const item = form.items[index];
    const prefix = item.serialPrefix || 'SER-';
    const start = Number(item.serialStart || 1);
    const count = Number(item.serialCount || item.quantity || 1);
    const digits = Number(item.serialDigits || 4);
    const serials = Array.from({ length: count }, (_, i) => `${prefix}${String(start + i).padStart(digits, '0')}`);
    updateItem(index, { serialsText: serials.join('\n'), quantity: count });
  }
  function onFile(e) {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => setForm((current) => ({ ...current, proofAttachmentName: file.name, proofAttachmentData: reader.result }));
    reader.readAsDataURL(file);
  }
  async function save() {
    try {
      if (!form.proofAttachmentName || !form.proofAttachmentData) {
        setMessage('Anexe o documento de recebimento antes de registrar a entrada.');
        return;
      }
      const payload = { ...form, items: form.items.map((item) => ({ ...item, serialNumbers: splitSerials(item.serialsText), unitCost: Number(item.unitCost || materials.find((m) => Number(m.id) === Number(item.materialId))?.unitCost || 0) })) };
      await api.post('/batches', payload);
      setMessage('Entrada registrada com comprovante, estoque/região e seriais em lote.');
      setModal(false); setForm(emptyForm()); load();
    } catch (error) { setMessage(error.response?.data?.message || error.message || 'Erro ao registrar entrada.'); }
  }

  return <div className="page-grid erp-page">
    <section className="toolbar"><div><span className="eyebrow">Entrada fiscal e logística</span><h2>Entrada completa de material</h2><p>Registre materiais por ordem de entrada, estoque/região, documento fiscal e seriais em lote.</p></div><button onClick={() => { setForm({ ...emptyForm(), warehouseId: warehouses[0]?.id || '' }); setModal(true); }}>Nova entrada</button></section>
    {message && <div className="alert danger">{message}</div>}
    <div className="kpi-grid small"><KpiCard label="Entradas" value={batches.length} /><KpiCard label="Itens recebidos" value={totals.totalItems} /><KpiCard label="Valor recebido" value={brl(totals.totalValue)} /><KpiCard label="Com comprovante" value={totals.withProof} /></div>
    <section className="panel"><div className="table-wrap"><table><thead><tr><th>Documento</th><th>Data</th><th>Estoque/região</th><th>Origem</th><th>Itens</th><th>Valor</th><th>Comprovante</th><th>Opções</th></tr></thead><tbody>{batches.map((b) => <tr key={b.id}><td><strong>{b.receiptNumber}</strong><br /><small>{b.fiscalDocumentNumber || b.invoiceAccessKey || '-'}</small></td><td>{b.receivedAt}</td><td>{b.Warehouse?.name || b.warehouseLocation || '-'}</td><td>{b.sourceCompany}</td><td>{b.totalItems}</td><td>{brl(b.totalValue)}</td><td>{b.proofAttachmentName || '-'}</td><td><button className="info" onClick={() => setDetails(b)}>Detalhes</button></td></tr>)}</tbody></table></div></section>

    <Modal open={modal} title="Nova entrada com comprovante" onClose={() => setModal(false)} footer={<><button className="ghost" onClick={() => setModal(false)}>Cancelar</button><button onClick={save}>Registrar entrada</button></>}>
      <div className="form-stack receiving-form">
        <div className="form-grid"><label>Número da entrada<input value={form.receiptNumber} onChange={(e) => setForm({ ...form, receiptNumber: e.target.value })} placeholder="ENT-20260716-001" /></label><label>Estoque/região<select value={form.warehouseId} onChange={(e) => setForm({ ...form, warehouseId: e.target.value })}><option value="">Estoque principal</option>{warehouses.map((w) => <option key={w.id} value={w.id}>{w.name} • {w.city || w.region || w.code}</option>)}</select></label><label>Data de recebimento<input type="date" value={form.receivedAt} onChange={(e) => setForm({ ...form, receivedAt: e.target.value })} /></label><label>Ciclo<select value={form.cycle} onChange={(e) => setForm({ ...form, cycle: e.target.value })}><option value="quinzenal">Quinzenal</option><option value="mensal">Mensal</option><option value="extra">Extra</option></select></label><label>Origem/fornecedor<input value={form.sourceCompany} onChange={(e) => setForm({ ...form, sourceCompany: e.target.value })} /></label><label>Status conferência<select value={form.conferenceStatus} onChange={(e) => setForm({ ...form, conferenceStatus: e.target.value })}><option value="conferido">Conferido</option><option value="pendente_conferencia">Pendente</option><option value="divergente">Divergente</option></select></label></div>
        <div className="form-grid"><label>Tipo documento<select value={form.fiscalDocumentType} onChange={(e) => setForm({ ...form, fiscalDocumentType: e.target.value })}><option value="nota_fiscal">Nota fiscal</option><option value="termo_entrega">Termo de entrega</option><option value="romaneio">Romaneio</option><option value="recibo">Recibo</option><option value="outro">Outro</option></select></label><label>Nº documento<input value={form.fiscalDocumentNumber} onChange={(e) => setForm({ ...form, fiscalDocumentNumber: e.target.value })} /></label><label>Chave NF-e<input value={form.invoiceAccessKey} onChange={(e) => setForm({ ...form, invoiceAccessKey: e.target.value })} /></label><label>Data documento<input type="date" value={form.fiscalDocumentDate} onChange={(e) => setForm({ ...form, fiscalDocumentDate: e.target.value })} /></label><label>Emitente<input value={form.fiscalIssuer} onChange={(e) => setForm({ ...form, fiscalIssuer: e.target.value })} /></label><label>Recebido por<input value={form.receivedByName} onChange={(e) => setForm({ ...form, receivedByName: e.target.value })} /></label></div>
        <label>Documento de recebimento obrigatório<input type="file" required accept="image/*,.pdf" onChange={onFile} /><small>Anexe nota fiscal, romaneio, termo de entrega ou recibo. Sem anexo a entrada não será registrada.</small></label>{form.proofAttachmentName && <div className="viz-callout">Comprovante anexado: {form.proofAttachmentName}</div>}
        <div className="subtoolbar"><h4>Itens da entrada</h4><button type="button" className="ghost" onClick={addItem}>Adicionar item</button></div>
        {form.items.map((item, i) => { const material = materials.find((m) => Number(m.id) === Number(item.materialId)); return <div className="item-card" key={i}><div className="item-head"><strong>Item {i + 1}</strong><button className="ghost danger-outline" onClick={() => removeItem(i)}>Remover</button></div><div className="form-grid"><label>Material<select value={item.materialId} onChange={(e) => { const mat = materials.find((m) => Number(m.id) === Number(e.target.value)); updateItem(i, { materialId: e.target.value, unitCost: mat?.unitCost || 0, serialsText: '' }); }}>{materials.map((m) => <option key={m.id} value={m.id}>{m.name} • {m.category}</option>)}</select></label><label>Quantidade<input type="number" value={item.quantity} onChange={(e) => updateItem(i, { quantity: e.target.value })} /></label><label>Valor unitário<input type="number" step="0.01" value={item.unitCost} onChange={(e) => updateItem(i, { unitCost: e.target.value })} /></label><label>Lote fabricante<input value={item.manufacturerLot || ''} onChange={(e) => updateItem(i, { manufacturerLot: e.target.value })} /></label><label>Pedido/OC<input value={item.purchaseOrder || ''} onChange={(e) => updateItem(i, { purchaseOrder: e.target.value })} /></label><label>Condição<select value={item.condition} onChange={(e) => updateItem(i, { condition: e.target.value })}><option value="novo">Novo</option><option value="usado">Usado</option><option value="recondicionado">Recondicionado</option><option value="defeito">Defeito</option><option value="outro">Outro</option></select></label></div>{material?.requiresSerial && <div className="serial-bulk panel-soft"><h4>Seriais em lote</h4><div className="form-grid"><label>Prefixo<input value={item.serialPrefix || ''} onChange={(e) => updateItem(i, { serialPrefix: e.target.value })} placeholder="ONU-2026-" /></label><label>Início<input type="number" value={item.serialStart || 1} onChange={(e) => updateItem(i, { serialStart: e.target.value })} /></label><label>Dígitos<input type="number" value={item.serialDigits || 4} onChange={(e) => updateItem(i, { serialDigits: e.target.value })} /></label><label>Qtd. gerar<input type="number" value={item.serialCount || item.quantity || 1} onChange={(e) => updateItem(i, { serialCount: e.target.value })} /></label></div><button type="button" className="ghost" onClick={() => generateSerials(i)}>Gerar seriais em lote</button><label>Lista de seriais<textarea rows="6" value={item.serialsText || ''} onChange={(e) => updateItem(i, { serialsText: e.target.value, quantity: splitSerials(e.target.value).length || item.quantity })} placeholder="Um serial por linha" /></label><small>{splitSerials(item.serialsText).length} serial(is) informado(s)</small></div>}<label>Observação do item<textarea rows="2" value={item.itemNotes || ''} onChange={(e) => updateItem(i, { itemNotes: e.target.value })} /></label></div>; })}
      </div>
    </Modal>
    <DetailsModal open={!!details} title={`Entrada ${details?.receiptNumber || ''}`} onClose={() => setDetails(null)}>{details && <><DetailGrid fields={[["Entrada", details.receiptNumber], ["Estoque/região", details.Warehouse?.name || details.warehouseLocation], ["Origem", details.sourceCompany], ["Documento", details.fiscalDocumentNumber || details.invoiceAccessKey], ["Comprovante", details.proofAttachmentName], ["Itens", details.totalItems], ["Valor", brl(details.totalValue)], ["Conferência", details.conferenceStatus]]} /><DetailList title="Itens da entrada" items={details.StockBatchItems || []} render={(item) => <><b>{item.Material?.name}</b><span>{item.quantity} • {brl(item.totalCost)} • {item.condition}</span><small>{(item.serialNumbers || []).slice(0, 12).join(', ')}</small></>} /></>}</DetailsModal>
  </div>;
}
