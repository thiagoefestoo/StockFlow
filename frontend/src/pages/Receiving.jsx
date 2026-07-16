import { useEffect, useMemo, useState } from 'react';
import api from '../services/api';
import Modal from '../components/Modal';
import DetailsModal, { DetailGrid, DetailList } from '../components/DetailsModal';
import KpiCard from '../components/KpiCard';

function brl(value) { return Number(value || 0).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' }); }
function splitSerials(value) { return String(value || '').split(/\n|,|;/).map((s) => s.trim()).filter(Boolean); }
function today() { return new Date().toISOString().slice(0, 10); }
function emptyForm() {
  return {
    receiptNumber: '',
    sourceCompany: 'Companhia Telecom',
    receivedAt: today(),
    cycle: 'quinzenal',
    fiscalDocumentType: 'nota_fiscal',
    fiscalDocumentNumber: '',
    fiscalDocumentDate: today(),
    fiscalIssuer: 'Companhia Telecom',
    invoiceAccessKey: '',
    receivedByName: '',
    conferenceStatus: 'conferido',
    warehouseLocation: 'Estoque principal',
    proofAttachmentName: '',
    proofAttachmentData: '',
    notes: '',
    items: [],
  };
}

export default function Receiving() {
  const [materials, setMaterials] = useState([]);
  const [batches, setBatches] = useState([]);
  const [form, setForm] = useState(emptyForm());
  const [modal, setModal] = useState(false);
  const [details, setDetails] = useState(null);
  const [message, setMessage] = useState('');

  async function load() {
    const [m, b] = await Promise.all([api.get('/materials'), api.get('/batches')]);
    setMaterials(m.data.data || []);
    setBatches(b.data.data || []);
  }
  useEffect(() => { load(); }, []);

  const totals = useMemo(() => {
    const totalValue = batches.reduce((sum, b) => sum + Number(b.totalValue || 0), 0);
    const totalItems = batches.reduce((sum, b) => sum + Number(b.totalItems || 0), 0);
    const withProof = batches.filter((b) => b.proofAttachmentName).length;
    return { totalValue, totalItems, withProof };
  }, [batches]);

  function addItem() {
    const mat = materials[0];
    setForm({ ...form, items: [...form.items, { materialId: mat?.id || '', quantity: 1, unitCost: mat?.unitCost || 0, serialNumbersText: '', brand: '', model: '', manufacturerLot: '', purchaseOrder: '', condition: 'novo', warehouseLocation: form.warehouseLocation, itemNotes: '' }] });
  }
  function removeItem(i) { setForm({ ...form, items: form.items.filter((_, idx) => idx !== i) }); }
  function updateItem(i, patch) {
    const items = [...form.items];
    items[i] = { ...items[i], ...patch };
    setForm({ ...form, items });
  }
  function handleProof(file) {
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => setForm((current) => ({ ...current, proofAttachmentName: file.name, proofAttachmentData: reader.result }));
    reader.readAsDataURL(file);
  }
  async function save() {
    try {
      const payload = {
        ...form,
        items: form.items.map((it) => ({
          ...it,
          quantity: Number(it.quantity || 0),
          unitCost: Number(it.unitCost || 0),
          serialNumbers: splitSerials(it.serialNumbersText),
        })),
      };
      await api.post('/batches', payload);
      setModal(false);
      setForm(emptyForm());
      setMessage('✅ Entrada registrada com documento comprobatório, histórico e auditoria.');
      load();
    } catch (error) {
      setMessage(`❌ ${error.response?.data?.message || error.message || 'Erro ao registrar entrada.'}`);
    }
  }
  function openNew() {
    setForm(emptyForm());
    setModal(true);
    setMessage('');
  }

  return (
    <div className="page-grid receiving-page">
      <div className="command-center"><div><span className="eyebrow">📥 Estoque fiscalizado</span><h2>Entrada completa de material</h2><p>Registre lote, nota fiscal/romaneio, comprovante anexado, itens, quantidades, valores, seriais e local de armazenagem.</p></div><button onClick={openNew}>➕ Nova entrada com comprovante</button></div>
      {message && <div className={`alert ${message.startsWith('❌') ? 'danger' : 'success'}`}>{message}</div>}
      <div className="kpi-grid small"><KpiCard label="Entradas" value={batches.length} hint="lotes registrados" /><KpiCard label="Itens recebidos" value={totals.totalItems} hint="quantidade total" tone="success" /><KpiCard label="Valor recebido" value={brl(totals.totalValue)} hint={`${totals.withProof} com comprovante`} tone="warning" /></div>
      <section className="panel"><div className="table-wrap"><table><thead><tr><th>Guia/Nota</th><th>Documento</th><th>Origem</th><th>Data</th><th>Conferência</th><th>Qtd</th><th>Valor</th><th>Anexo</th><th className="action-cell">Opções</th></tr></thead><tbody>{batches.map((b) => <tr key={b.id}><td><b>{b.receiptNumber}</b><br /><small>{b.cycle}</small></td><td>{b.fiscalDocumentNumber || b.invoiceAccessKey || '-'}<br /><small>{b.fiscalDocumentType}</small></td><td>{b.sourceCompany}</td><td>{b.receivedAt}</td><td><span className={`badge ${b.conferenceStatus}`}>{b.conferenceStatus}</span></td><td>{b.totalItems}</td><td>{brl(b.totalValue)}</td><td>{b.proofAttachmentName ? <span className="badge aprovado">📎 anexado</span> : <span className="badge reprovado">sem anexo</span>}</td><td><div className="action-toolbar"><button className="info" onClick={() => setDetails(b)}>🔎 Detalhes</button>{b.proofAttachmentData && <a className="ghost" href={b.proofAttachmentData} download={b.proofAttachmentName || 'comprovante'}>⬇️ Baixar</a>}</div></td></tr>)}</tbody></table></div></section>

      <Modal open={modal} title="📥 Nova entrada de material com documento" onClose={() => setModal(false)} footer={<><button className="ghost" onClick={() => setModal(false)}>Cancelar</button><button onClick={save}>✅ Confirmar entrada</button></>}>
        <div className="receiving-wizard">
          <section className="transfer-summary-card">
            <div><small>Documento</small><strong>{form.fiscalDocumentNumber || 'Obrigatório'}</strong><span>{form.fiscalDocumentType}</span></div>
            <div><small>Comprovante</small><strong>{form.proofAttachmentName ? 'Anexado' : 'Pendente'}</strong><span>{form.proofAttachmentName || 'NF, romaneio, termo ou recibo'}</span></div>
            <div><small>Itens</small><strong>{form.items.length}</strong><span>{form.items.reduce((s, it) => s + Number(it.quantity || 0), 0)} unidade(s)</span></div>
          </section>

          <div className="form-grid">
            <label>Nº da guia/entrada<input value={form.receiptNumber} onChange={(e) => setForm({ ...form, receiptNumber: e.target.value })} placeholder="Ex.: NF-12345, ROM-001" /></label>
            <label>Empresa origem<input value={form.sourceCompany} onChange={(e) => setForm({ ...form, sourceCompany: e.target.value })} /></label>
            <label>Data de recebimento<input type="date" value={form.receivedAt} onChange={(e) => setForm({ ...form, receivedAt: e.target.value })} /></label>
            <label>Ciclo<select value={form.cycle} onChange={(e) => setForm({ ...form, cycle: e.target.value })}><option value="quinzenal">Quinzenal</option><option value="mensal">Mensal</option><option value="extra">Extra</option></select></label>
            <label>Tipo de documento<select value={form.fiscalDocumentType} onChange={(e) => setForm({ ...form, fiscalDocumentType: e.target.value })}><option value="nota_fiscal">Nota fiscal</option><option value="termo_entrega">Termo de entrega</option><option value="romaneio">Romaneio</option><option value="recibo">Recibo</option><option value="outro">Outro</option></select></label>
            <label>Nº documento / termo<input value={form.fiscalDocumentNumber} onChange={(e) => setForm({ ...form, fiscalDocumentNumber: e.target.value })} placeholder="Obrigatório se não houver chave" /></label>
            <label>Data do documento<input type="date" value={form.fiscalDocumentDate} onChange={(e) => setForm({ ...form, fiscalDocumentDate: e.target.value })} /></label>
            <label>Emitente<input value={form.fiscalIssuer} onChange={(e) => setForm({ ...form, fiscalIssuer: e.target.value })} /></label>
            <label>Chave de acesso NF-e<input value={form.invoiceAccessKey} onChange={(e) => setForm({ ...form, invoiceAccessKey: e.target.value })} placeholder="opcional" /></label>
            <label>Recebido/conferido por<input value={form.receivedByName} onChange={(e) => setForm({ ...form, receivedByName: e.target.value })} placeholder="nome do responsável" /></label>
            <label>Status de conferência<select value={form.conferenceStatus} onChange={(e) => setForm({ ...form, conferenceStatus: e.target.value })}><option value="conferido">Conferido</option><option value="pendente_conferencia">Pendente conferência</option><option value="divergente">Divergente</option></select></label>
            <label>Local padrão no estoque<input value={form.warehouseLocation} onChange={(e) => setForm({ ...form, warehouseLocation: e.target.value })} /></label>
          </div>
          <label>📎 Comprovante obrigatório<input type="file" accept="image/*,.pdf" onChange={(e) => handleProof(e.target.files?.[0])} /></label>
          {form.proofAttachmentName && <div className="viz-callout">📎 Comprovante anexado: <b>{form.proofAttachmentName}</b></div>}
          <label>Observações gerais<textarea rows="3" value={form.notes} onChange={(e) => setForm({ ...form, notes: e.target.value })} placeholder="Divergências, lacres, conferência, responsável, horário..." /></label>

          <div className="subtoolbar"><h4>📦 Itens recebidos</h4><button className="ghost" onClick={addItem}>➕ Adicionar item</button></div>
          {form.items.map((item, i) => {
            const material = materials.find((m) => Number(m.id) === Number(item.materialId));
            const serials = splitSerials(item.serialNumbersText);
            return <div className="item-card receiving-item-card" key={i}>
              <div className="item-head"><strong>📦 Item {i + 1}</strong><button className="ghost danger-outline" onClick={() => removeItem(i)}>Remover</button></div>
              <div className="form-grid">
                <label>Material<select value={item.materialId} onChange={(e) => { const mat = materials.find((m) => Number(m.id) === Number(e.target.value)); updateItem(i, { materialId: e.target.value, unitCost: mat?.unitCost || 0, serialNumbersText: '', quantity: 1 }); }}>{materials.map((m) => <option key={m.id} value={m.id}>{m.name} — {m.category}</option>)}</select></label>
                <label>Quantidade<input type="number" min="0" step="0.001" value={item.quantity} onChange={(e) => updateItem(i, { quantity: e.target.value })} /></label>
                <label>Valor unitário<input type="number" step="0.01" value={item.unitCost} onChange={(e) => updateItem(i, { unitCost: e.target.value })} /></label>
                <label>Valor total estimado<input readOnly value={brl(Number(item.quantity || 0) * Number(item.unitCost || 0))} /></label>
                <label>Lote fabricante<input value={item.manufacturerLot || ''} onChange={(e) => updateItem(i, { manufacturerLot: e.target.value })} /></label>
                <label>Pedido/OC<input value={item.purchaseOrder || ''} onChange={(e) => updateItem(i, { purchaseOrder: e.target.value })} /></label>
                <label>Condição<select value={item.condition || 'novo'} onChange={(e) => updateItem(i, { condition: e.target.value })}><option value="novo">Novo</option><option value="usado">Usado</option><option value="recondicionado">Recondicionado</option><option value="defeito">Com defeito</option><option value="outro">Outro</option></select></label>
                <label>Local do item<input value={item.warehouseLocation || ''} onChange={(e) => updateItem(i, { warehouseLocation: e.target.value })} placeholder={form.warehouseLocation} /></label>
                {material?.requiresSerial && <label>Marca<input value={item.brand || ''} onChange={(e) => updateItem(i, { brand: e.target.value })} /></label>}
                {material?.requiresSerial && <label>Modelo<input value={item.model || ''} onChange={(e) => updateItem(i, { model: e.target.value })} /></label>}
              </div>
              {material?.requiresSerial && <label>Seriais/MACs, um por linha<textarea rows="6" value={item.serialNumbersText} onChange={(e) => updateItem(i, { serialNumbersText: e.target.value, quantity: splitSerials(e.target.value).length })} placeholder="SN001\nSN002\nSN003" /></label>}
              {material?.requiresSerial && <small className="muted">{serials.length} serial(is) informado(s). A quantidade precisa bater com os seriais.</small>}
              <label>Observações do item<textarea rows="2" value={item.itemNotes || ''} onChange={(e) => updateItem(i, { itemNotes: e.target.value })} /></label>
            </div>;
          })}
        </div>
      </Modal>

      <DetailsModal open={!!details} title={`Detalhes da entrada ${details?.receiptNumber || ''}`} onClose={() => setDetails(null)}>
        {details && <><DetailGrid fields={[["Guia/Nota", details.receiptNumber], ["Documento", details.fiscalDocumentNumber || details.invoiceAccessKey], ["Tipo", details.fiscalDocumentType], ["Origem", details.sourceCompany], ["Emitente", details.fiscalIssuer], ["Recebido por", details.receivedByName], ["Data", details.receivedAt], ["Conferência", details.conferenceStatus], ["Local", details.warehouseLocation], ["Qtd. total", details.totalItems], ["Valor total", brl(details.totalValue)], ["Anexo", details.proofAttachmentName], ["Observações", details.notes], ["Criada em", details.createdAt]]} /><DetailList title="Itens recebidos" items={details.StockBatchItems || []} render={(item) => <><b>{item.Material?.name || 'Material'}</b><span>Qtd. {item.quantity} • unitário {brl(item.unitCost)} • total {brl(item.totalCost)}</span><small>Lote: {item.manufacturerLot || '-'} • OC: {item.purchaseOrder || '-'} • Condição: {item.condition || '-'}</small>{Array.isArray(item.serialNumbers) && item.serialNumbers.length > 0 && <small>Seriais: {item.serialNumbers.join(', ')}</small>}</>} /></>}
      </DetailsModal>
    </div>
  );
}
