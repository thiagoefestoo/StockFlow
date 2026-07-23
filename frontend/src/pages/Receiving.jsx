import { useEffect, useMemo, useState } from 'react';
import api from '../services/api';
import Modal from '../components/Modal';
import DetailsModal, { DetailGrid, DetailList } from '../components/DetailsModal';
import KpiCard from '../components/KpiCard';
import AttachmentPreview from '../components/AttachmentPreview';
import FloatingAlert from '../components/FloatingAlert';
import { formatQuantity, formatQuantityWithUnit } from '../utils/formatQuantity';

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
    warehouseLocation: '',
    warehouseId: '',
    proofAttachmentName: '',
    proofAttachmentData: '',
    notes: '',
    items: [],
  };
}

function isSerialRequired(material) {
  if (!material) return false;
  if (material.requiresSerial === true || material.requiresSerial === 1 || material.requiresSerial === '1') return true;
  const raw = String(material.requiresSerial ?? '').trim().toLowerCase();
  return ['true', 'sim', 's', 'yes', 'on'].includes(raw);
}

function duplicateValues(values) {
  const seen = new Set();
  const repeated = new Set();
  values.forEach((value) => {
    const normalized = String(value || '').trim().toUpperCase();
    if (!normalized) return;
    if (seen.has(normalized)) repeated.add(value);
    seen.add(normalized);
  });
  return Array.from(repeated);
}
function serialStatus(item) {
  const quantity = Number(item.quantity || 0);
  const serials = splitSerials(item.serialsText);
  if (!quantity) return `${serials.length} serial(is) informado(s). Informe a quantidade.`;
  if (serials.length === quantity) return `${serials.length}/${formatQuantity(quantity)} serial(is) informado(s). Quantidade correta.`;
  if (serials.length < quantity) return `${serials.length}/${formatQuantity(quantity)} serial(is) informado(s). Faltam ${formatQuantity(quantity - serials.length)}.`;
  return `${serials.length}/${formatQuantity(quantity)} serial(is) informado(s). Remova ${formatQuantity(serials.length - quantity)} excedente(s).`;
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
    const [m, b, w] = await Promise.all([
      api.get('/materials'),
      api.get('/batches'),
      api.get('/warehouses').catch(() => ({ data: { data: [] } })),
    ]);
    setMaterials(m.data.data || []);
    setBatches(b.data.data || []);
    setWarehouses(w.data.data || []);
  }
  useEffect(() => { load(); }, []);

  const totals = useMemo(() => ({
    totalValue: batches.reduce((s, b) => s + Number(b.totalValue || 0), 0),
    totalItems: batches.reduce((s, b) => s + Number(b.totalItems || 0), 0),
    withProof: batches.filter((b) => b.proofAttachmentName).length,
  }), [batches]);

  function addItem() {
    const first = materials[0];
    setForm({
      ...form,
      items: [
        ...form.items,
        {
          materialId: first?.id || '',
          quantity: 1,
          unitCost: first?.unitCost && Number(first.unitCost) > 0 ? first.unitCost : '',
          serialsText: '',
          manufacturerLot: '',
          purchaseOrder: '',
          condition: 'novo',
          warehouseLocation: '',
          itemNotes: '',
        },
      ],
    });
  }
  function updateItem(index, patch) {
    const items = [...form.items];
    items[index] = { ...items[index], ...patch };
    setForm({ ...form, items });
  }
  function removeItem(index) { setForm({ ...form, items: form.items.filter((_, i) => i !== index) }); }

  function onFile(e) {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => setForm((current) => ({ ...current, proofAttachmentName: file.name, proofAttachmentData: reader.result }));
    reader.readAsDataURL(file);
  }

  function validateItems() {
    if (!form.items.length) return 'Adicione pelo menos um item na entrada.';
    const allSerials = [];

    for (const [index, item] of form.items.entries()) {
      const material = materials.find((m) => Number(m.id) === Number(item.materialId));
      const itemLabel = `Item ${index + 1}${material?.name ? ` - ${material.name}` : ''}`;
      const quantity = Number(item.quantity || 0);
      const unitCost = Number(item.unitCost || 0);
      const serials = splitSerials(item.serialsText);

      if (!material) return `${itemLabel}: selecione um material.`;
      if (!quantity || quantity <= 0) return `${itemLabel}: informe uma quantidade válida.`;
      if (!unitCost || unitCost <= 0) return `${itemLabel}: informe o valor unitário da entrada.`;

      if (isSerialRequired(material)) {
        const repeatedInItem = duplicateValues(serials);
        if (repeatedInItem.length) return `Serial digitado repetido no ${itemLabel}: ${repeatedInItem.join(', ')}.`;
        if (serials.length !== quantity) return `${itemLabel}: informe exatamente ${formatQuantity(quantity)} serial(is). Você informou ${serials.length}.`;
        allSerials.push(...serials);
      }
    }

    const repeatedInEntry = duplicateValues(allSerials);
    if (repeatedInEntry.length) return `Serial digitado repetido na entrada: ${repeatedInEntry.join(', ')}.`;
    return '';
  }

  async function save() {
    try {
      setMessage('');
      if (!form.warehouseId) {
        setMessage('Selecione o estoque regional que receberá os materiais.');
        return;
      }
      if (!form.proofAttachmentName || !form.proofAttachmentData) {
        setMessage('Anexe o documento de recebimento antes de registrar a entrada.');
        return;
      }
      const itemError = validateItems();
      if (itemError) {
        setMessage(itemError);
        return;
      }

      const payload = {
        ...form,
        items: form.items.map((item) => {
          const material = materials.find((m) => Number(m.id) === Number(item.materialId));
          return {
            ...item,
            quantity: Number(item.quantity || 0),
            serialNumbers: isSerialRequired(material) ? splitSerials(item.serialsText) : [],
            unitCost: Number(item.unitCost || 0),
          };
        }),
      };
      await api.post('/batches', payload);
      setMessage('Entrada registrada com comprovante, estoque/região, valores e seriais conferidos.');
      setModal(false);
      setForm(emptyForm());
      load();
    } catch (error) {
      setMessage(error.response?.data?.message || error.message || 'Erro ao registrar entrada.');
    }
  }

  return <div className="page-grid erp-page">
    <section className="toolbar"><div><span className="eyebrow">Entrada fiscal e logística</span><h2>Entrada completa de material</h2><p>Registre materiais diretamente no estoque regional de destino, com documento fiscal, valor obrigatório e seriais conferidos.</p></div><button onClick={() => { setForm({ ...emptyForm(), warehouseId: warehouses[0]?.id || '' }); setModal(true); }}>Nova entrada</button></section>
    <FloatingAlert message={message} type={message.startsWith('Entrada registrada') ? 'success' : 'danger'} onClose={() => setMessage('')} />
    <div className="kpi-grid small"><KpiCard label="Entradas" value={batches.length} /><KpiCard label="Itens recebidos" value={formatQuantity(totals.totalItems)} /><KpiCard label="Valor recebido" value={brl(totals.totalValue)} /><KpiCard label="Com comprovante" value={totals.withProof} /></div>
    <section className="panel"><div className="table-wrap"><table><thead><tr><th>Documento</th><th>Data</th><th>Estoque/região</th><th>Origem</th><th>Itens</th><th>Valor</th><th>Comprovante</th><th>Opções</th></tr></thead><tbody>{batches.map((b) => <tr key={b.id}><td><strong>{b.receiptNumber}</strong><br /><small>{b.fiscalDocumentNumber || b.invoiceAccessKey || '-'}</small></td><td>{b.receivedAt}</td><td>{b.Warehouse?.name || b.warehouseLocation || '-'}</td><td>{b.sourceCompany}</td><td>{formatQuantity(b.totalItems)}</td><td>{brl(b.totalValue)}</td><td>{b.proofAttachmentName ? <AttachmentPreview compact name={b.proofAttachmentName} data={b.proofAttachmentData} /> : '-'}</td><td><button className="info" onClick={() => setDetails(b)}>Detalhes</button></td></tr>)}</tbody></table></div></section>

    <Modal open={modal} title="Nova entrada com comprovante" onClose={() => setModal(false)} footer={<><button className="ghost" onClick={() => setModal(false)}>Cancelar</button><button onClick={save}>Registrar entrada</button></>}>
      <div className="form-stack receiving-form">
        <div className="form-grid"><label>Número da entrada<input value={form.receiptNumber} onChange={(e) => setForm({ ...form, receiptNumber: e.target.value })} placeholder="ENT-20260716-001" /></label><label>Estoque/região<select value={form.warehouseId} onChange={(e) => setForm({ ...form, warehouseId: e.target.value })}><option value="">Selecione o estoque regional</option>{warehouses.map((w) => <option key={w.id} value={w.id}>{w.name} • {w.city || w.region || w.code}</option>)}</select></label><label>Data de recebimento<input type="date" value={form.receivedAt} onChange={(e) => setForm({ ...form, receivedAt: e.target.value })} /></label><label>Ciclo<select value={form.cycle} onChange={(e) => setForm({ ...form, cycle: e.target.value })}><option value="quinzenal">Quinzenal</option><option value="mensal">Mensal</option><option value="extra">Extra</option></select></label><label>Origem/fornecedor<input value={form.sourceCompany} onChange={(e) => setForm({ ...form, sourceCompany: e.target.value })} /></label><label>Status conferência<select value={form.conferenceStatus} onChange={(e) => setForm({ ...form, conferenceStatus: e.target.value })}><option value="conferido">Conferido</option><option value="pendente_conferencia">Pendente</option><option value="divergente">Divergente</option></select></label></div>
        <div className="form-grid"><label>Tipo documento<select value={form.fiscalDocumentType} onChange={(e) => setForm({ ...form, fiscalDocumentType: e.target.value })}><option value="nota_fiscal">Nota fiscal</option><option value="termo_entrega">Termo de entrega</option><option value="romaneio">Romaneio</option><option value="recibo">Recibo</option><option value="outro">Outro</option></select></label><label>Nº documento<input value={form.fiscalDocumentNumber} onChange={(e) => setForm({ ...form, fiscalDocumentNumber: e.target.value })} /></label><label>Chave NF-e<input value={form.invoiceAccessKey} onChange={(e) => setForm({ ...form, invoiceAccessKey: e.target.value })} /></label><label>Data documento<input type="date" value={form.fiscalDocumentDate} onChange={(e) => setForm({ ...form, fiscalDocumentDate: e.target.value })} /></label><label>Emitente<input value={form.fiscalIssuer} onChange={(e) => setForm({ ...form, fiscalIssuer: e.target.value })} /></label><label>Recebido por<input value={form.receivedByName} onChange={(e) => setForm({ ...form, receivedByName: e.target.value })} /></label></div>
        <label>Documento de recebimento obrigatório<input type="file" required accept="image/*,.pdf" onChange={onFile} /><small>Anexe nota fiscal, romaneio, termo de entrega ou recibo. Sem anexo a entrada não será registrada.</small></label>{form.proofAttachmentName && <AttachmentPreview compact name={form.proofAttachmentName} data={form.proofAttachmentData} label="Comprovante selecionado" />}
        <div className="subtoolbar"><h4>Itens da entrada</h4><button type="button" className="ghost" onClick={addItem}>Adicionar item</button></div>
        {form.items.map((item, i) => {
          const material = materials.find((m) => Number(m.id) === Number(item.materialId));
          const requiresSerial = isSerialRequired(material);
          const serials = requiresSerial ? splitSerials(item.serialsText) : [];
          const repeated = duplicateValues(serials);
          return <div className="item-card" key={i}>
            <div className="item-head"><strong>Item {i + 1}</strong><button className="ghost danger-outline" onClick={() => removeItem(i)}>Remover</button></div>
            <div className="form-grid">
              <label>Material<select value={item.materialId} onChange={(e) => { const mat = materials.find((m) => Number(m.id) === Number(e.target.value)); updateItem(i, { materialId: e.target.value, unitCost: mat?.unitCost && Number(mat.unitCost) > 0 ? mat.unitCost : '', serialsText: '' }); }}>{materials.map((m) => <option key={m.id} value={m.id}>{m.name} • {m.category} • {isSerialRequired(m) ? 'com serial' : 'sem serial'}</option>)}</select></label>
              <label>Quantidade<input type="number" min="1" step="1" value={item.quantity} onChange={(e) => updateItem(i, { quantity: e.target.value })} /></label>
              <label>Valor unitário obrigatório<input type="number" min="0.01" step="0.01" value={item.unitCost} onChange={(e) => updateItem(i, { unitCost: e.target.value })} placeholder="Informe o valor unitário" /></label>
              <label>Pedido/OC<input value={item.purchaseOrder || ''} onChange={(e) => updateItem(i, { purchaseOrder: e.target.value })} /></label>
              <label>Condição<select value={item.condition} onChange={(e) => updateItem(i, { condition: e.target.value })}><option value="novo">Novo</option><option value="usado">Usado</option><option value="recondicionado">Recondicionado</option><option value="defeito">Defeito</option><option value="outro">Outro</option></select></label>
            </div>
            {requiresSerial ? <div className="serial-bulk panel-soft">
              <h4>Seriais obrigatórios</h4>
              <label>Lista de seriais<textarea rows={Math.min(Math.max(Number(item.quantity || 5), 5), 12)} value={item.serialsText || ''} onChange={(e) => updateItem(i, { serialsText: e.target.value })} placeholder={`Digite exatamente ${Number(item.quantity || 0) || 'a quantidade de'} serial(is), um por linha`} /></label>
              <small>{serialStatus(item)}</small>
              {repeated.length > 0 && <div className="alert danger compact-alert">Serial digitado repetido: {repeated.join(', ')}</div>}
            </div> : material ? <div className="alert info compact-alert">Este material está cadastrado como <strong>sem número de série</strong>. Informe apenas quantidade e valor; serial não será exigido nesta entrada.</div> : null}
            <label>Observação do item<textarea rows="2" value={item.itemNotes || ''} onChange={(e) => updateItem(i, { itemNotes: e.target.value })} /></label>
          </div>;
        })}
      </div>
    </Modal>
    <DetailsModal open={!!details} title={`Entrada ${details?.receiptNumber || ''}`} onClose={() => setDetails(null)}>{details && <><DetailGrid fields={[["Entrada", details.receiptNumber], ["Estoque/região", details.Warehouse?.name || details.warehouseLocation], ["Origem", details.sourceCompany], ["Documento", details.fiscalDocumentNumber || details.invoiceAccessKey], ["Comprovante", details.proofAttachmentName || 'Sem anexo'], ["Itens", formatQuantity(details.totalItems)], ["Valor", brl(details.totalValue)], ["Conferência", details.conferenceStatus]]} /><AttachmentPreview name={details.proofAttachmentName} data={details.proofAttachmentData} label="Comprovante da entrada" /><DetailList title="Itens da entrada" items={details.StockBatchItems || []} render={(item) => <><b>{item.Material?.name}</b><span>{formatQuantity(item.quantity)} • {brl(item.totalCost)} • {item.condition}</span><small>{(item.serialNumbers || []).slice(0, 12).join(', ')}</small></>} /></>}</DetailsModal>
  </div>;
}
