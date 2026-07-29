/* eslint-disable react-hooks/exhaustive-deps */
import { useEffect, useMemo, useState } from 'react';
import api from '../services/api';
import Modal from '../components/Modal';
import DetailsModal, { DetailGrid, DetailList } from '../components/DetailsModal';
import KpiCard from '../components/KpiCard';
import Pagination from '../components/Pagination';
import AttachmentPreview from '../components/AttachmentPreview';
import FloatingAlert from '../components/FloatingAlert';
import OperationReviewModal from '../components/OperationReviewModal';
import { duplicateItemIds, optionsWithoutSelected } from '../utils/operationSelections';
import { formatQuantity } from '../utils/formatQuantity';

function brl(value) { return Number(value || 0).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' }); }
function splitSerials(value) { return String(value || '').split(/[\r\n\t,;]+/).map((s) => s.trim()).filter(Boolean); }
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

function isToolMaterial(material) {
  return String(material?.category || '').trim().toLowerCase() === 'ferramenta';
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
  const [detailsLoading, setDetailsLoading] = useState(false);
  const [message, setMessage] = useState('');
  const [reviewOpen, setReviewOpen] = useState(false);
  const [saving, setSaving] = useState(false);
  const [page, setPage] = useState(1);
  const [pagination, setPagination] = useState({ page: 1, pageSize: 15, total: 0, totalPages: 1 });
  const [loadingList, setLoadingList] = useState(false);

  async function load(targetPage = page, refreshReferences = false) {
    setLoadingList(true);
    try {
      const requests = [api.get('/batches', { params: { page: targetPage, pageSize: 15 } })];
      if (refreshReferences || !materials.length || !warehouses.length) {
        requests.push(api.get('/materials'), api.get('/warehouses').catch(() => ({ data: { data: [] } })));
      }
      const [b, m, w] = await Promise.all(requests);
      setBatches(b.data.data || []);
      setPagination(b.data.pagination || { page: targetPage, pageSize: 15, total: b.data.data?.length || 0, totalPages: 1 });
      setPage(targetPage);
      if (m) setMaterials(m.data.data || []);
      if (w) setWarehouses(w.data.data || []);
    } finally {
      setLoadingList(false);
    }
  }
  useEffect(() => { load(1, true); }, []);

  const operationalBatches = useMemo(() => batches.filter((batch) => !batch.Warehouse?.isReverseLogistics), [batches]);
  const totals = useMemo(() => ({
    totalValue: operationalBatches.reduce((sum, batch) => sum + Number(batch.totalValue || 0), 0),
    totalItems: operationalBatches.reduce((sum, batch) => sum + Number(batch.totalItems || 0), 0),
    withProof: operationalBatches.filter((batch) => batch.proofAttachmentName).length,
  }), [operationalBatches]);

  async function openBatchDetails(batch) {
    setDetailsLoading(true);
    setMessage('');
    try {
      const response = await api.get(`/batches/${batch.id}`);
      setDetails(response.data.data);
    } catch (error) {
      setMessage(error.response?.data?.message || 'Não foi possível carregar os detalhes da entrada.');
    } finally {
      setDetailsLoading(false);
    }
  }

  function addItem() {
    setForm({
      ...form,
      items: [
        ...form.items,
        {
          materialId: '',
          entryKind: 'material',
          code: '',
          description: '',
          unit: 'un',
          quantity: 1,
          unitCost: '',
          serialsText: '',
          manufacturerLot: '',
          purchaseOrder: '',
          condition: selectedWarehouse?.isReverseLogistics ? 'usado' : 'novo',
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

  function pasteSerialColumn(event, itemIndex) {
    const text = event.clipboardData?.getData('text') || '';
    const pastedSerials = splitSerials(text);
    if (!pastedSerials.length) return;
    event.preventDefault();
    updateItem(itemIndex, {
      serialsText: pastedSerials.join('\n'),
      quantity: pastedSerials.length,
    });
    setMessage(`${pastedSerials.length} serial(is) colado(s) em coluna. A quantidade foi ajustada automaticamente.`);
  }

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

    if (selectedWarehouse?.isReverseLogistics) {
      const seenCodes = new Set();
      for (const [index, item] of form.items.entries()) {
        const itemLabel = `Item ${index + 1}${item.description ? ` - ${item.description}` : ''}`;
        const code = String(item.code || '').trim().toUpperCase();
        const description = String(item.description || '').trim();
        const serials = splitSerials(item.serialsText);
        const quantity = Number(item.quantity || 0);
        const unitCost = Number(item.unitCost || 0);

        if (!code) return `${itemLabel}: informe o código do material/equipamento.`;
        if (!description) return `${itemLabel}: informe a descrição.`;
        if (seenCodes.has(code)) return `O código ${code} aparece mais de uma vez. Una as quantidades ou os seriais em uma única linha.`;
        seenCodes.add(code);
        if (unitCost < 0) return `${itemLabel}: o valor unitário não pode ser negativo.`;

        if (serials.length) {
          const repeatedInItem = duplicateValues(serials);
          if (repeatedInItem.length) return `Serial digitado repetido no ${itemLabel}: ${repeatedInItem.join(', ')}.`;
          allSerials.push(...serials);
        } else if (!quantity || quantity <= 0) {
          return `${itemLabel}: informe uma quantidade válida ou ao menos um serial.`;
        }
      }

      const repeatedInEntry = duplicateValues(allSerials);
      if (repeatedInEntry.length) return `Serial digitado repetido na entrada: ${repeatedInEntry.join(', ')}.`;
      return '';
    }

    const repeatedMaterials = duplicateItemIds(form.items);
    if (repeatedMaterials.length) return 'O mesmo material não pode aparecer mais de uma vez na entrada. Remova a linha repetida antes de continuar.';

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

  function validationMessage() {
    if (!form.warehouseId) return 'Selecione o estoque regional que receberá os materiais.';
    if (!form.receiptNumber) return 'Informe o número da entrada.';
    if (!form.fiscalDocumentNumber && !form.invoiceAccessKey) return 'Informe o número do documento fiscal/termo ou a chave da NF-e.';
    if (!form.proofAttachmentName || !form.proofAttachmentData) return 'Anexe o documento de recebimento antes de registrar a entrada.';
    return validateItems();
  }

  function openReview() {
    setMessage('');
    const error = validationMessage();
    if (error) {
      setMessage(error);
      return;
    }
    setReviewOpen(true);
  }

  async function save() {
    if (saving) return;
    try {
      setMessage('');
      const error = validationMessage();
      if (error) {
        setMessage(error);
        return;
      }
      setSaving(true);

      if (selectedWarehouse?.isReverseLogistics) {
        const payload = {
          ...form,
          items: form.items.map((item) => {
            const serialNumbers = splitSerials(item.serialsText);
            return {
              code: String(item.code || '').trim().toUpperCase(),
              description: String(item.description || '').trim(),
              unit: item.unit || 'un',
              quantity: serialNumbers.length || Number(item.quantity || 0),
              serialNumbers,
              unitCost: Number(item.unitCost || 0),
              condition: item.condition || 'usado',
              itemNotes: item.itemNotes || '',
            };
          }),
        };
        await api.post(`/warehouses/${selectedWarehouse.id}/reverse-entry`, payload);
        setMessage('Entrada registrada somente no estoque de logística reversa. Consulte o resultado em Estoques Regionais > Detalhes/BI.');
      } else {
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
      }

      setReviewOpen(false);
      setModal(false);
      setForm(emptyForm());
      load(1, true);
    } catch (error) {
      setMessage(error.response?.data?.message || error.message || 'Erro ao registrar entrada.');
    } finally {
      setSaving(false);
    }
  }

  const selectedWarehouse = warehouses.find((warehouse) => String(warehouse.id) === String(form.warehouseId));
  const reviewItems = form.items.map((item, index) => {
    if (selectedWarehouse?.isReverseLogistics) {
      const serials = splitSerials(item.serialsText);
      const quantity = serials.length || Number(item.quantity || 0);
      const unitCost = Number(item.unitCost || 0);
      return {
        key: `${item.code || 'empty'}-${index}`,
        name: `${item.code || 'Sem código'} • ${item.description || `Item ${index + 1}`}`,
        detail: `${serials.length ? 'equipamento serializado' : `controle por ${item.unit || 'un'}`} • ${item.condition || 'usado'} • valor unitário ${brl(unitCost)}`,
        quantity,
        unitValue: unitCost,
        totalValue: quantity * unitCost,
        serials,
      };
    }

    const material = materials.find((row) => Number(row.id) === Number(item.materialId));
    const serials = isSerialRequired(material) ? splitSerials(item.serialsText) : [];
    const quantity = Number(item.quantity || 0);
    const unitCost = Number(item.unitCost || 0);
    return {
      key: `${item.materialId || 'empty'}-${index}`,
      name: material?.name || `Item ${index + 1}`,
      detail: `${material?.category || 'categoria não informada'} • ${item.condition || 'condição não informada'} • custo unitário ${brl(unitCost)}`,
      quantity,
      unitValue: unitCost,
      totalValue: quantity * unitCost,
      serials,
    };
  });

  const reviewQuantity = reviewItems.reduce((sum, item) => sum + Number(item.quantity || 0), 0);
  const reviewValue = reviewItems.reduce((sum, item) => sum + Number(item.totalValue || 0), 0);

  return <div className="page-grid erp-page">
    <section className="toolbar"><div><span className="eyebrow">Entrada fiscal e logística</span><h2>Entrada completa de material</h2><p>Registre materiais diretamente no estoque regional de destino, com documento fiscal, valor obrigatório e seriais conferidos.</p></div><button onClick={() => { setForm({ ...emptyForm(), warehouseId: warehouses[0]?.id || '' }); setModal(true); }}>Nova entrada</button></section>
    <FloatingAlert message={message} type={message.startsWith('Entrada registrada') || message.includes('serial(is) colado(s)') ? 'success' : 'danger'} onClose={() => setMessage('')} />
    <div className="kpi-grid small"><KpiCard label="Entradas nesta página" value={operationalBatches.length} /><KpiCard label="Itens nesta página" value={formatQuantity(totals.totalItems)} /><KpiCard label="Valor desta página" value={brl(totals.totalValue)} /><KpiCard label="Total de entradas" value={pagination.total || 0} /></div>
    <section className="panel"><div className="table-wrap"><table><thead><tr><th>Documento</th><th>Data</th><th>Estoque/região</th><th>Origem</th><th>Itens</th><th>Valor</th><th>Comprovante</th><th>Opções</th></tr></thead><tbody>{batches.map((b) => <tr key={b.id} className={b.Warehouse?.isReverseLogistics ? 'reverse-logistics-row' : ''}><td><strong>{b.receiptNumber}</strong><br /><small>{b.fiscalDocumentNumber || b.invoiceAccessKey || '-'}</small></td><td>{b.receivedAt}</td><td>{b.Warehouse?.name || b.warehouseLocation || '-'}{b.Warehouse?.isReverseLogistics && <><br /><span className="reverse-logistics-badge">Logística reversa</span></>}</td><td>{b.sourceCompany}</td><td>{formatQuantity(b.totalItems)}</td><td>{brl(b.totalValue)}</td><td>{b.proofAttachmentName ? <span className="badge info">Anexo disponível</span> : '-'}</td><td><button className="info" disabled={detailsLoading} onClick={() => openBatchDetails(b)}>Detalhes</button></td></tr>)}</tbody></table></div><Pagination {...pagination} page={page} loading={loadingList} onPageChange={load} /></section>

    <Modal open={modal} title="Nova entrada com comprovante" onClose={() => !saving && setModal(false)} footer={<><button className="ghost" disabled={saving} onClick={() => setModal(false)}>Cancelar</button><button disabled={saving} onClick={openReview}>Revisar entrada</button></>}>
      <div className="form-stack receiving-form">
        <div className="form-grid"><label>Número da entrada<input value={form.receiptNumber} onChange={(e) => setForm({ ...form, receiptNumber: e.target.value })} placeholder="ENT-20260716-001" /></label><label>Estoque/região<select value={form.warehouseId} onChange={(e) => setForm({ ...form, warehouseId: e.target.value, items: [] })}><option value="">Selecione o estoque regional</option>{warehouses.map((w) => <option key={w.id} value={w.id}>{w.isReverseLogistics ? '[LOGÍSTICA REVERSA] ' : ''}{w.name} • {w.city || w.region || w.code}</option>)}</select></label><label>Data de recebimento<input type="date" value={form.receivedAt} onChange={(e) => setForm({ ...form, receivedAt: e.target.value })} /></label><label>Ciclo<select value={form.cycle} onChange={(e) => setForm({ ...form, cycle: e.target.value })}><option value="quinzenal">Quinzenal</option><option value="mensal">Mensal</option><option value="extra">Extra</option></select></label><label>Origem/fornecedor<input value={form.sourceCompany} onChange={(e) => setForm({ ...form, sourceCompany: e.target.value })} /></label><label>Status conferência<select value={form.conferenceStatus} onChange={(e) => setForm({ ...form, conferenceStatus: e.target.value })}><option value="conferido">Conferido</option><option value="pendente_conferencia">Pendente</option><option value="divergente">Divergente</option></select></label></div>
        <div className="form-grid"><label>Tipo documento<select value={form.fiscalDocumentType} onChange={(e) => setForm({ ...form, fiscalDocumentType: e.target.value })}><option value="nota_fiscal">Nota fiscal</option><option value="termo_entrega">Termo de entrega</option><option value="romaneio">Romaneio</option><option value="recibo">Recibo</option><option value="outro">Outro</option></select></label><label>Nº documento<input value={form.fiscalDocumentNumber} onChange={(e) => setForm({ ...form, fiscalDocumentNumber: e.target.value })} /></label><label>Chave NF-e<input value={form.invoiceAccessKey} onChange={(e) => setForm({ ...form, invoiceAccessKey: e.target.value })} /></label><label>Data documento<input type="date" value={form.fiscalDocumentDate} onChange={(e) => setForm({ ...form, fiscalDocumentDate: e.target.value })} /></label><label>Emitente<input value={form.fiscalIssuer} onChange={(e) => setForm({ ...form, fiscalIssuer: e.target.value })} /></label><label>Recebido por<input value={form.receivedByName} onChange={(e) => setForm({ ...form, receivedByName: e.target.value })} /></label></div>
        <label>Documento de recebimento obrigatório<input type="file" required accept="image/*,.pdf" onChange={onFile} /><small>Anexe nota fiscal, romaneio, termo de entrega ou recibo. Sem anexo a entrada não será registrada.</small></label>{form.proofAttachmentName && <AttachmentPreview compact name={form.proofAttachmentName} data={form.proofAttachmentData} label="Comprovante selecionado" />}
        <div className="subtoolbar"><h4>Itens da entrada</h4><button type="button" className="ghost" onClick={addItem}>Adicionar item</button></div>
        {form.items.map((item, i) => {
          if (selectedWarehouse?.isReverseLogistics) {
            const serials = splitSerials(item.serialsText);
            const repeated = duplicateValues(serials);
            return <div className="item-card reverse-entry-item" key={i}>
              <div className="item-head"><strong>Item {i + 1} — logística reversa</strong><button className="ghost danger-outline" onClick={() => removeItem(i)}>Remover</button></div>
              <div className="alert info compact-alert">Este item fica somente no estoque de logística reversa. Não é necessário cadastrá-lo no catálogo geral.</div>
              <div className="form-grid">
                <label>Código<input value={item.code || ''} onChange={(e) => updateItem(i, { code: e.target.value.toUpperCase() })} placeholder="Ex.: ATFX203023" /></label>
                <label>Descrição<input value={item.description || ''} onChange={(e) => updateItem(i, { description: e.target.value })} placeholder="Nome do equipamento ou material recolhido" /></label>
                <label>Quantidade<input type="number" min="0" step="1" value={serials.length || item.quantity} disabled={serials.length > 0} onChange={(e) => updateItem(i, { quantity: e.target.value })} /></label>
                <label>Unidade<select value={item.unit || 'un'} onChange={(e) => updateItem(i, { unit: e.target.value })}><option value="un">Unidade</option><option value="m">Metro</option><option value="kg">Quilograma</option><option value="cx">Caixa</option><option value="pct">Pacote</option><option value="outro">Outro</option></select></label>
                <label>Valor unitário opcional<input type="number" min="0" step="0.01" value={item.unitCost} onChange={(e) => updateItem(i, { unitCost: e.target.value })} placeholder="Pode ser 0,00" /></label>
                <label>Condição<select value={item.condition || 'usado'} onChange={(e) => updateItem(i, { condition: e.target.value })}><option value="usado">Usado</option><option value="defeito">Defeito</option><option value="recondicionado">Recondicionado</option><option value="novo">Novo</option><option value="outro">Outro</option></select></label>
              </div>
              <div className="serial-bulk panel-soft">
                <h4>Seriais opcionais — preenchimento em coluna</h4>
                <label>Seriais/patrimônios
                  <textarea
                    rows={Math.min(Math.max(serials.length || 8, 8), 16)}
                    value={item.serialsText || ''}
                    onPaste={(event) => pasteSerialColumn(event, i)}
                    onChange={(e) => {
                      const value = e.target.value.replace(/\t/g, '\n');
                      const nextSerials = splitSerials(value);
                      updateItem(i, { serialsText: value, quantity: nextSerials.length || item.quantity });
                    }}
                    placeholder={'Para equipamentos, cole uma coluna de seriais. Para materiais sem serial, deixe vazio e informe apenas a quantidade.'}
                  />
                </label>
                <small>{serials.length ? `${serials.length} serial(is) informado(s); a quantidade será definida automaticamente.` : 'Sem serial: o controle será feito somente por quantidade.'}</small>
                {serials.length > 0 && <div className="serial-column-preview">
                  <div className="serial-column-preview-head"><span>Linha</span><strong>Serial</strong></div>
                  {serials.slice(0, 200).map((serial, serialIndex) => <div className="serial-column-preview-row" key={`${serial}-${serialIndex}`}><span>{serialIndex + 1}</span><strong>{serial}</strong></div>)}
                  {serials.length > 200 && <small>Exibindo os primeiros 200 de {serials.length} seriais. Todos serão enviados.</small>}
                </div>}
                {repeated.length > 0 && <div className="alert danger compact-alert">Serial digitado repetido: {repeated.join(', ')}</div>}
              </div>
              <label>Observação do item<textarea rows="2" value={item.itemNotes || ''} onChange={(e) => updateItem(i, { itemNotes: e.target.value })} /></label>
            </div>;
          }

          const material = materials.find((m) => Number(m.id) === Number(item.materialId));
          const entryKind = item.entryKind || (isToolMaterial(material) ? 'ferramenta' : 'material');
          const filteredMaterials = materials.filter((row) => (entryKind === 'ferramenta' ? isToolMaterial(row) : !isToolMaterial(row)));
          const availableMaterials = optionsWithoutSelected(filteredMaterials, form.items, i);
          const requiresSerial = isSerialRequired(material);
          const serials = requiresSerial ? splitSerials(item.serialsText) : [];
          const repeated = duplicateValues(serials);
          return <div className="item-card" key={i}>
            <div className="item-head"><strong>Item {i + 1}</strong><button className="ghost danger-outline" onClick={() => removeItem(i)}>Remover</button></div>
            <div className="form-grid">
              <label>Tipo do item<select value={entryKind} onChange={(e) => updateItem(i, { entryKind: e.target.value, materialId: '', unitCost: '', serialsText: '' })}><option value="material">Material/equipamento</option><option value="ferramenta">Ferramenta</option></select></label>
              <label>{entryKind === 'ferramenta' ? 'Ferramenta' : 'Material'}<select value={item.materialId} onChange={(e) => { const mat = materials.find((m) => Number(m.id) === Number(e.target.value)); updateItem(i, { materialId: e.target.value, entryKind: isToolMaterial(mat) ? 'ferramenta' : 'material', unitCost: mat?.unitCost && Number(mat.unitCost) > 0 ? mat.unitCost : '', serialsText: '' }); }}><option value="">Selecionar item</option>{availableMaterials.map((m) => <option key={m.id} value={m.id}>{m.name} • {m.category} • {isSerialRequired(m) ? 'com serial' : 'sem serial'}</option>)}</select></label>
              <label>Quantidade<input type="number" min="1" step="1" value={item.quantity} onChange={(e) => updateItem(i, { quantity: e.target.value })} /></label>
              <label>Valor unitário obrigatório<input type="number" min="0.01" step="0.01" value={item.unitCost} onChange={(e) => updateItem(i, { unitCost: e.target.value })} placeholder="Informe o valor unitário" /></label>
              <label>Pedido/OC<input value={item.purchaseOrder || ''} onChange={(e) => updateItem(i, { purchaseOrder: e.target.value })} /></label>
              <label>Condição<select value={item.condition} onChange={(e) => updateItem(i, { condition: e.target.value })}><option value="novo">Novo</option><option value="usado">Usado</option><option value="recondicionado">Recondicionado</option><option value="defeito">Defeito</option><option value="outro">Outro</option></select></label>
            </div>
            {entryKind === 'ferramenta' && availableMaterials.length === 0 && !material && <div className="alert info compact-alert">Nenhuma ferramenta está cadastrada no catálogo. Cadastre o item em Materiais/Estoque usando a categoria <strong>Ferramenta</strong>.</div>}
            {requiresSerial ? <div className="serial-bulk panel-soft">
              <h4>Seriais obrigatórios — preenchimento em coluna</h4>
              <label>Colar coluna do Excel
                <textarea
                  rows={Math.min(Math.max(Number(item.quantity || 8), 8), 16)}
                  value={item.serialsText || ''}
                  onPaste={(event) => pasteSerialColumn(event, i)}
                  onChange={(e) => updateItem(i, { serialsText: e.target.value.replace(/\t/g, '\n') })}
                  placeholder={'Cole diretamente uma coluna do Excel. Cada serial deve ficar em uma linha:\nONU000001\nONU000002\nONU000003'}
                />
              </label>
              <small>{serialStatus(item)} Ao colar uma coluna do Excel, a quantidade é ajustada automaticamente.</small>
              {serials.length > 0 && <div className="serial-column-preview">
                <div className="serial-column-preview-head"><span>Linha</span><strong>Serial</strong></div>
                {serials.slice(0, 200).map((serial, serialIndex) => <div className="serial-column-preview-row" key={`${serial}-${serialIndex}`}><span>{serialIndex + 1}</span><strong>{serial}</strong></div>)}
                {serials.length > 200 && <small>Exibindo os primeiros 200 de {serials.length} seriais. Todos serão enviados.</small>}
              </div>}
              {repeated.length > 0 && <div className="alert danger compact-alert">Serial digitado repetido: {repeated.join(', ')}</div>}
            </div> : material ? <div className="alert info compact-alert">Este material está cadastrado como <strong>sem número de série</strong>. Informe apenas quantidade e valor; serial não será exigido nesta entrada.</div> : null}
            <label>Observação do item<textarea rows="2" value={item.itemNotes || ''} onChange={(e) => updateItem(i, { itemNotes: e.target.value })} /></label>
          </div>;
        })}
      </div>
    </Modal>
    <OperationReviewModal
      open={reviewOpen}
      title="Revisar entrada de material"
      description="Confira documento, estoque, quantidades, valores e seriais. A entrada e o saldo só serão gerados depois da confirmação."
      metadata={[
        { label: 'Número da entrada', value: form.receiptNumber },
        { label: 'Estoque de destino', value: selectedWarehouse?.name, hint: selectedWarehouse?.code || selectedWarehouse?.city },
        { label: 'Origem/fornecedor', value: form.sourceCompany },
        { label: 'Documento', value: form.fiscalDocumentNumber || form.invoiceAccessKey, hint: form.fiscalDocumentType },
        { label: 'Data de recebimento', value: form.receivedAt },
        { label: 'Comprovante', value: form.proofAttachmentName },
      ]}
      items={reviewItems}
      totalQuantity={reviewQuantity}
      totalValue={reviewValue}
      warning={selectedWarehouse?.isReverseLogistics ? 'Ao confirmar, a entrada ficará isolada no estoque de logística reversa e não será contabilizada no BI operacional.' : 'Ao confirmar, o sistema criará o lote de entrada, os saldos e as movimentações correspondentes no estoque selecionado.'}
      loading={saving}
      confirmLabel="Confirmar e registrar entrada"
      onCancel={() => setReviewOpen(false)}
      onConfirm={save}
    />
    <DetailsModal open={!!details} title={`Entrada ${details?.receiptNumber || ''}`} onClose={() => setDetails(null)}>{details && <><DetailGrid fields={[["Entrada", details.receiptNumber], ["Estoque/região", details.Warehouse?.name || details.warehouseLocation], ["Origem", details.sourceCompany], ["Documento", details.fiscalDocumentNumber || details.invoiceAccessKey], ["Comprovante", details.proofAttachmentName || 'Sem anexo'], ["Itens", formatQuantity(details.totalItems)], ["Valor", brl(details.totalValue)], ["Conferência", details.conferenceStatus]]} /><AttachmentPreview name={details.proofAttachmentName} data={details.proofAttachmentData} label="Comprovante da entrada" /><DetailList title="Itens da entrada" items={details.StockBatchItems || []} render={(item) => <><b>{item.Material?.name}</b><span>{formatQuantity(item.quantity)} • {brl(item.totalCost)} • {item.condition}</span><small>{(item.serialNumbers || []).slice(0, 12).join(', ')}</small></>} /></>}</DetailsModal>
  </div>;
}
