/* eslint-disable react-hooks/exhaustive-deps */
import { useEffect, useMemo, useState } from 'react';
import api from '../services/api';
import { sortRecentFirst } from '../utils/recentFirst';
import Modal from '../components/Modal';
import DetailsModal, { DetailGrid, DetailList } from '../components/DetailsModal';
import KpiCard from '../components/KpiCard';
import Pagination from '../components/Pagination';
import AttachmentPreview from '../components/AttachmentPreview';
import FloatingAlert from '../components/FloatingAlert';
import OperationReviewModal from '../components/OperationReviewModal';
import { duplicateItemIds, optionsWithoutSelected } from '../utils/operationSelections';
import { formatQuantity } from '../utils/formatQuantity';
import { useAuth } from '../contexts/AuthContext';

function brl(value) { return Number(value || 0).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' }); }
function splitSerials(value) { return String(value || '').split(/[\r\n\t,;]+/).map((s) => s.trim()).filter(Boolean); }
function today() { return new Date().toISOString().slice(0, 10); }
function emptyListFilters() {
  return {
    search: '',
    warehouseId: '',
    materialId: '',
    dateFrom: '',
    dateTo: '',
    sourceCompany: '',
    conferenceStatus: '',
    fiscalDocumentType: '',
    hasProof: '',
  };
}

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

function editFormFromBatch(batch) {
  return {
    id: batch.id,
    receiptNumber: batch.receiptNumber || '',
    sourceCompany: batch.sourceCompany || '',
    receivedAt: batch.receivedAt || '',
    cycle: batch.cycle || 'quinzenal',
    fiscalDocumentType: batch.fiscalDocumentType || 'nota_fiscal',
    fiscalDocumentNumber: batch.fiscalDocumentNumber || '',
    fiscalDocumentDate: batch.fiscalDocumentDate || '',
    fiscalIssuer: batch.fiscalIssuer || '',
    invoiceAccessKey: batch.invoiceAccessKey || '',
    receivedByName: batch.receivedByName || '',
    conferenceStatus: batch.conferenceStatus || 'conferido',
    warehouseLocation: batch.warehouseLocation || '',
    proofAttachmentName: batch.proofAttachmentName || '',
    proofAttachmentData: batch.proofAttachmentData || '',
    notes: batch.notes || '',
    items: (batch.StockBatchItems || []).map((item) => ({
      id: item.id,
      materialId: item.materialId,
      materialName: item.Material?.name || `Item ${item.id}`,
      materialUnit: item.Material?.unit || 'un',
      requiresSerial: isSerialRequired(item.Material),
      serialCount: Array.isArray(item.serialNumbers) ? item.serialNumbers.length : 0,
      originalQuantity: Number(item.quantity || 0),
      quantity: Number(item.quantity || 0),
      unitCost: Number(item.unitCost || 0),
    })),
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

function entryItemLabel(item) {
  const material = item?.Material;
  const category = isToolMaterial(material) ? 'Ferramenta' : (material?.category || 'Material');
  return `${material?.name || 'Item'} — ${formatQuantity(item?.quantity || 0)} ${material?.unit || 'un'} — ${category}`;
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
  const { canAccessModule } = useAuth();
  const canEditEntryDocuments = canAccessModule('stockBatchEdit');
  const canEditEntryQuantities = canAccessModule('stockBatchQuantityEdit');
  const canEditEntries = canEditEntryDocuments || canEditEntryQuantities;
  const [materials, setMaterials] = useState([]);
  const [warehouses, setWarehouses] = useState([]);
  const [batches, setBatches] = useState([]);
  const [form, setForm] = useState(emptyForm());
  const [modal, setModal] = useState(false);
  const [details, setDetails] = useState(null);
  const [detailsLoading, setDetailsLoading] = useState(false);
  const [editModal, setEditModal] = useState(false);
  const [editForm, setEditForm] = useState(null);
  const [editSaving, setEditSaving] = useState(false);
  const [message, setMessage] = useState('');
  const [reviewOpen, setReviewOpen] = useState(false);
  const [saving, setSaving] = useState(false);
  const [page, setPage] = useState(1);
  const [pagination, setPagination] = useState({ page: 1, pageSize: 15, total: 0, totalPages: 1 });
  const [loadingList, setLoadingList] = useState(false);
  const [listFilters, setListFilters] = useState(emptyListFilters());
  const [appliedListFilters, setAppliedListFilters] = useState(emptyListFilters());

  async function load(targetPage = page, refreshReferences = false, activeFilters = appliedListFilters) {
    setLoadingList(true);
    try {
      const params = { page: targetPage, pageSize: 15 };
      Object.entries(activeFilters || {}).forEach(([key, value]) => {
        if (String(value ?? '').trim()) params[key] = value;
      });
      const requests = [api.get('/batches', { params })];
      if (refreshReferences || !materials.length || !warehouses.length) {
        requests.push(api.get('/materials'), api.get('/warehouses').catch(() => ({ data: { data: [] } })));
      }
      const [b, m, w] = await Promise.all(requests);
      setBatches(sortRecentFirst(b.data.data || [], ['receivedAt', 'createdAt']));
      setPagination(b.data.pagination || { page: targetPage, pageSize: 15, total: b.data.data?.length || 0, totalPages: 1 });
      setPage(targetPage);
      if (m) setMaterials(m.data.data || []);
      if (w) setWarehouses(w.data.data || []);
    } finally {
      setLoadingList(false);
    }
  }
  useEffect(() => { load(1, true, emptyListFilters()); }, []);

  const operationalBatches = useMemo(() => batches.filter((batch) => !batch.Warehouse?.isReverseLogistics), [batches]);
  const totals = useMemo(() => ({
    totalValue: operationalBatches.reduce((sum, batch) => sum + Number(batch.totalValue || 0), 0),
    totalItems: operationalBatches.reduce((sum, batch) => sum + Number(batch.totalItems || 0), 0),
    withProof: operationalBatches.filter((batch) => batch.proofAttachmentName).length,
  }), [operationalBatches]);

  const editProjectedTotals = useMemo(() => {
    const items = editForm?.items || [];
    return {
      quantity: items.reduce((sum, item) => sum + Number(item.quantity || 0), 0),
      value: items.reduce((sum, item) => sum + (Number(item.quantity || 0) * Number(item.unitCost || 0)), 0),
      changed: items.filter((item) => Number(item.quantity || 0) !== Number(item.originalQuantity || 0)).length,
    };
  }, [editForm]);

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

  function openEditBatch() {
    if (!details || !canEditEntries) return;
    setEditForm(editFormFromBatch(details));
    setEditModal(true);
    setMessage('');
  }

  function updateEditItemQuantity(itemId, value) {
    setEditForm((current) => ({
      ...current,
      items: (current?.items || []).map((item) => (
        Number(item.id) === Number(itemId)
          ? { ...item, quantity: value }
          : item
      )),
    }));
  }

  function onEditFile(event) {
    const file = event.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => setEditForm((current) => ({
      ...current,
      proofAttachmentName: file.name,
      proofAttachmentData: reader.result,
    }));
    reader.readAsDataURL(file);
  }

  function editValidationMessage() {
    if (canEditEntryDocuments) {
      if (!editForm?.receiptNumber?.trim()) return 'Informe o número da entrada.';
      if (!editForm?.sourceCompany?.trim()) return 'Informe a origem/fornecedor.';
      if (!editForm?.receivedAt) return 'Informe a data de recebimento.';
      if (!editForm?.fiscalDocumentNumber?.trim() && !editForm?.invoiceAccessKey?.trim()) return 'Informe o número do documento ou a chave da NF-e.';
      if (!editForm?.proofAttachmentName || !editForm?.proofAttachmentData) return 'A entrada deve permanecer vinculada a um comprovante.';
    }

    if (canEditEntryQuantities) {
      for (const item of editForm?.items || []) {
        const quantity = Number(item.quantity);
        if (!Number.isFinite(quantity) || quantity <= 0 || !Number.isInteger(quantity)) {
          return `Informe uma quantidade inteira maior que zero para ${item.materialName}.`;
        }
        if (item.requiresSerial && quantity !== Number(item.originalQuantity)) {
          return `A quantidade de ${item.materialName} está vinculada a seriais e não pode ser alterada nesta tela.`;
        }
      }
    }

    return '';
  }

  async function saveBatchEdit() {
    if (!editForm || editSaving) return;
    const validation = editValidationMessage();
    if (validation) {
      setMessage(validation);
      return;
    }

    setEditSaving(true);
    setMessage('');
    try {
      const payload = {};

      if (canEditEntryDocuments) {
        Object.assign(payload, {
          receiptNumber: editForm.receiptNumber,
          sourceCompany: editForm.sourceCompany,
          receivedAt: editForm.receivedAt,
          cycle: editForm.cycle,
          fiscalDocumentType: editForm.fiscalDocumentType,
          fiscalDocumentNumber: editForm.fiscalDocumentNumber,
          fiscalDocumentDate: editForm.fiscalDocumentDate || null,
          fiscalIssuer: editForm.fiscalIssuer,
          invoiceAccessKey: editForm.invoiceAccessKey,
          receivedByName: editForm.receivedByName,
          conferenceStatus: editForm.conferenceStatus,
          warehouseLocation: editForm.warehouseLocation,
          proofAttachmentName: editForm.proofAttachmentName,
          proofAttachmentData: editForm.proofAttachmentData,
          notes: editForm.notes,
        });
      }

      if (canEditEntryQuantities) {
        payload.items = (editForm.items || []).map((item) => ({
          id: item.id,
          materialId: item.materialId,
          quantity: Number(item.quantity),
        }));
      }

      const response = await api.put(`/batches/${editForm.id}`, payload);
      const updated = response.data.data;
      setDetails(updated);
      setEditForm(null);
      setEditModal(false);
      setMessage(response.data.message || 'Entrada atualizada com auditoria.');
      await load(page, false, appliedListFilters);
    } catch (error) {
      setMessage(error.response?.data?.message || error.message || 'Não foi possível atualizar a entrada.');
    } finally {
      setEditSaving(false);
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
      load(1, true, appliedListFilters);
    } catch (error) {
      setMessage(error.response?.data?.message || error.message || 'Erro ao registrar entrada.');
    } finally {
      setSaving(false);
    }
  }

  function applyListFilters(event) {
    event?.preventDefault?.();
    setMessage('');
    if (listFilters.dateFrom && listFilters.dateTo && listFilters.dateFrom > listFilters.dateTo) {
      setMessage('A data inicial do filtro não pode ser posterior à data final.');
      return;
    }
    const nextFilters = { ...listFilters };
    setAppliedListFilters(nextFilters);
    load(1, false, nextFilters);
  }

  function clearListFilters() {
    const cleared = emptyListFilters();
    setListFilters(cleared);
    setAppliedListFilters(cleared);
    setMessage('');
    load(1, false, cleared);
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
        serialCount: serials.length,
        serialPreview: serials.slice(0, 5).join(', ') + (serials.length > 5 ? ` +${serials.length - 5}` : ''),
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
      serialCount: serials.length,
      serialPreview: serials.slice(0, 5).join(', ') + (serials.length > 5 ? ` +${serials.length - 5}` : ''),
      serials,
    };
  });

  const reviewQuantity = reviewItems.reduce((sum, item) => sum + Number(item.quantity || 0), 0);
  const reviewValue = reviewItems.reduce((sum, item) => sum + Number(item.totalValue || 0), 0);

  return <div className="page-grid erp-page">
    <section className="toolbar"><div><span className="eyebrow">Entrada fiscal e logística</span><h2>Entrada completa de material</h2><p>Registre materiais diretamente no estoque regional de destino, com documento fiscal, valor obrigatório e seriais conferidos.</p></div><button onClick={() => { setForm({ ...emptyForm(), warehouseId: warehouses[0]?.id || '' }); setModal(true); }}>Nova entrada</button></section>
    <FloatingAlert message={message} type={message.startsWith('Entrada registrada') || message.startsWith('Entrada atualizada') || message.includes('atualizada com auditoria') || message.includes('serial(is) colado(s)') ? 'success' : 'danger'} onClose={() => setMessage('')} />
    <div className="kpi-grid small"><KpiCard label="Entradas nesta página" value={operationalBatches.length} /><KpiCard label="Itens nesta página" value={formatQuantity(totals.totalItems)} /><KpiCard label="Valor desta página" value={brl(totals.totalValue)} /><KpiCard label="Total conforme filtros" value={pagination.total || 0} /></div>

    <form className="panel filters stock-filter-panel" onSubmit={applyListFilters}>
      <div className="subtoolbar"><div><h3>Filtros das entradas</h3><small>Pesquise por documento, fornecedor, operador, material, período e estoque autorizado.</small></div><div className="action-toolbar"><button type="button" className="ghost" disabled={loadingList} onClick={clearListFilters}>Limpar filtros</button><button type="submit" disabled={loadingList}>{loadingList ? 'Filtrando...' : 'Aplicar filtros'}</button></div></div>
      <div className="form-grid stock-filter-grid">
        <label>Pesquisar<input value={listFilters.search} onChange={(e) => setListFilters({ ...listFilters, search: e.target.value })} placeholder="Entrada, NF, fornecedor, operador ou material" /></label>
        <label>Estoque<select value={listFilters.warehouseId} onChange={(e) => setListFilters({ ...listFilters, warehouseId: e.target.value })}><option value="">Todos os autorizados</option>{warehouses.filter((warehouse) => !warehouse.isReverseLogistics).map((warehouse) => <option key={warehouse.id} value={warehouse.id}>{warehouse.name} • {warehouse.city || warehouse.code}</option>)}</select></label>
        <label>Material<select value={listFilters.materialId} onChange={(e) => setListFilters({ ...listFilters, materialId: e.target.value })}><option value="">Todos os materiais</option>{[...materials].sort((left, right) => String(left.name || '').localeCompare(String(right.name || ''), 'pt-BR')).map((material) => <option key={material.id} value={material.id}>{material.name} • {material.sku}</option>)}</select></label>
        <label>Origem/fornecedor<input value={listFilters.sourceCompany} onChange={(e) => setListFilters({ ...listFilters, sourceCompany: e.target.value })} placeholder="Ex.: Companhia Telecom" /></label>
        <label>Data inicial<input type="date" value={listFilters.dateFrom} onChange={(e) => setListFilters({ ...listFilters, dateFrom: e.target.value })} /></label>
        <label>Data final<input type="date" value={listFilters.dateTo} onChange={(e) => setListFilters({ ...listFilters, dateTo: e.target.value })} /></label>
        <label>Conferência<select value={listFilters.conferenceStatus} onChange={(e) => setListFilters({ ...listFilters, conferenceStatus: e.target.value })}><option value="">Todas</option><option value="conferido">Conferido</option><option value="pendente_conferencia">Pendente</option><option value="divergente">Divergente</option></select></label>
        <label>Tipo de documento<select value={listFilters.fiscalDocumentType} onChange={(e) => setListFilters({ ...listFilters, fiscalDocumentType: e.target.value })}><option value="">Todos</option><option value="nota_fiscal">Nota fiscal</option><option value="termo_entrega">Termo de entrega</option><option value="romaneio">Romaneio</option><option value="recibo">Recibo</option><option value="outro">Outro</option></select></label>
        <label>Comprovante<select value={listFilters.hasProof} onChange={(e) => setListFilters({ ...listFilters, hasProof: e.target.value })}><option value="">Todos</option><option value="yes">Com anexo</option><option value="no">Sem anexo</option></select></label>
      </div>
      <div className="stock-filter-summary"><strong>{pagination.total || 0}</strong> entrada(s) encontrada(s) • página <strong>{page}</strong> de <strong>{pagination.totalPages || 1}</strong></div>
    </form>

    <section className="panel"><div className="table-wrap"><table><thead><tr><th>Documento</th><th>Data</th><th>Estoque/região</th><th>Origem</th><th>Itens recebidos</th><th>Valor</th><th>Comprovante</th><th>Opções</th></tr></thead><tbody>{batches.map((b) => <tr key={b.id} className={b.Warehouse?.isReverseLogistics ? 'reverse-logistics-row' : ''}><td><strong>{b.receiptNumber}</strong><br /><small>{b.fiscalDocumentNumber || b.invoiceAccessKey || '-'}</small></td><td>{b.receivedAt}</td><td>{b.Warehouse?.name || b.warehouseLocation || '-'}{b.Warehouse?.isReverseLogistics && <><br /><span className="reverse-logistics-badge">Logística reversa</span></>}</td><td>{b.sourceCompany}</td><td><strong>Total: {formatQuantity(b.totalItems)}</strong><div className="receiving-items-summary">{(b.StockBatchItems || []).map((item) => <small key={item.id} style={{ display: 'block', marginTop: '0.2rem' }}>{entryItemLabel(item)}</small>)}</div></td><td>{brl(b.totalValue)}</td><td>{b.proofAttachmentName ? <span className="badge info">Anexo disponível</span> : '-'}</td><td><button className="info" disabled={detailsLoading} onClick={() => openBatchDetails(b)}>Detalhes</button></td></tr>)}{!loadingList && batches.length === 0 && <tr><td colSpan="8"><div className="empty-state">Nenhuma entrada corresponde aos filtros aplicados.</div></td></tr>}</tbody></table></div><Pagination {...pagination} page={page} loading={loadingList} onPageChange={(targetPage) => load(targetPage, false, appliedListFilters)} /></section>

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
    <DetailsModal
      open={!!details}
      title={`Entrada ${details?.receiptNumber || ''}`}
      onClose={() => setDetails(null)}
      footer={<>
        <button className="ghost" onClick={() => setDetails(null)}>Fechar</button>
        {canEditEntries && <button onClick={openEditBatch}>Editar entrada</button>}
      </>}
    >
      {details && <>
        <DetailGrid fields={[
          ['Entrada', details.receiptNumber],
          ['Estoque/região', details.Warehouse?.name || details.warehouseLocation],
          ['Origem', details.sourceCompany],
          ['Documento', details.fiscalDocumentNumber || details.invoiceAccessKey],
          ['Comprovante', details.proofAttachmentName || 'Sem anexo'],
          ['Itens', formatQuantity(details.totalItems)],
          ['Valor', brl(details.totalValue)],
          ['Conferência', details.conferenceStatus],
        ]} />
        <AttachmentPreview name={details.proofAttachmentName} data={details.proofAttachmentData} label="Comprovante da entrada" />
        <DetailList title="Todos os itens da entrada" items={details.StockBatchItems || []} render={(item) => <>
          <b>{item.Material?.name} {isToolMaterial(item.Material) && <span className="badge info">Ferramenta</span>}</b>
          <span>{formatQuantity(item.quantity)} {item.Material?.unit || 'un'} • {brl(item.totalCost)} • {item.condition}</span>
          <small>{(item.serialNumbers || []).slice(0, 12).join(', ') || 'Controle por quantidade'}</small>
        </>} />
      </>}
    </DetailsModal>

    <Modal
      open={editModal}
      title={`Editar entrada ${editForm?.receiptNumber || ''}`}
      onClose={() => !editSaving && setEditModal(false)}
      footer={<>
        <button className="ghost" disabled={editSaving} onClick={() => setEditModal(false)}>Cancelar</button>
        <button disabled={editSaving} onClick={saveBatchEdit}>{editSaving ? 'Salvando...' : 'Salvar correções'}</button>
      </>}
    >
      {editForm && <div className="form-stack receiving-form">
        <div className="alert info">
          {canEditEntryQuantities
            ? 'Quantidades de materiais sem serial podem ser corrigidas. O sistema movimentará somente a diferença no estoque, recalculará os totais e registrará a alteração na auditoria.'
            : 'Sua conta pode corrigir os dados documentais, mas não possui permissão para alterar quantidades.'}
          {' '}O estoque de destino e os materiais da entrada permanecem bloqueados.
        </div>

        {canEditEntryQuantities && <div className="alert warning">
          Ao reduzir uma quantidade, o estoque precisa possuir saldo suficiente naquele material. Itens vinculados a números de série permanecem bloqueados para evitar inconsistências de patrimônio.
        </div>}

        <DetailGrid fields={[
          ['Estoque/região bloqueado', details?.Warehouse?.name || details?.warehouseLocation],
          ['Quantidade atual', formatQuantity(details?.totalItems)],
          ['Quantidade após correção', formatQuantity(editProjectedTotals.quantity)],
          ['Itens com quantidade alterada', editProjectedTotals.changed],
          ['Valor atual', brl(details?.totalValue)],
          ['Valor após correção', brl(editProjectedTotals.value)],
        ]} />

        <div className="subtoolbar">
          <div>
            <h4>Quantidades dos itens</h4>
            <small>A inclusão, exclusão ou troca do material não é permitida nesta correção.</small>
          </div>
        </div>

        {(editForm.items || []).map((item) => {
          const quantity = Number(item.quantity || 0);
          const difference = quantity - Number(item.originalQuantity || 0);
          return <div className="item-card" key={item.id}>
            <div className="item-head">
              <div>
                <strong>{item.materialName}</strong>
                <small style={{ display: 'block', marginTop: '0.2rem' }}>
                  Custo unitário: {brl(item.unitCost)} • Quantidade original: {formatQuantity(item.originalQuantity)} {item.materialUnit}
                </small>
              </div>
              {item.requiresSerial
                ? <span className="badge warning">Quantidade vinculada a {item.serialCount} serial(is)</span>
                : difference === 0
                  ? <span className="badge info">Sem alteração</span>
                  : <span className={`badge ${difference > 0 ? 'success' : 'warning'}`}>
                    {difference > 0 ? '+' : ''}{formatQuantity(difference)} {item.materialUnit}
                  </span>}
            </div>
            <div className="form-grid">
              <label>Material<input value={item.materialName} disabled /></label>
              <label>Quantidade corrigida
                <input
                  type="number"
                  min="1"
                  step="1"
                  value={item.quantity}
                  disabled={!canEditEntryQuantities || item.requiresSerial}
                  onChange={(event) => updateEditItemQuantity(item.id, event.target.value)}
                />
                <small>{item.requiresSerial ? 'Bloqueada porque o item possui serial.' : 'O saldo será ajustado apenas pela diferença.'}</small>
              </label>
              <label>Valor unitário<input value={brl(item.unitCost)} disabled /></label>
              <label>Total após correção<input value={brl(quantity * Number(item.unitCost || 0))} disabled /></label>
            </div>
          </div>;
        })}

        <div className="subtoolbar">
          <div>
            <h4>Dados documentais</h4>
            {!canEditEntryDocuments && <small>Bloqueados para esta conta. Libere “Editar dados documentais das entradas” na Administração.</small>}
          </div>
        </div>

        <div className="form-grid">
          <label>Número da entrada<input value={editForm.receiptNumber} maxLength="80" disabled={!canEditEntryDocuments} onChange={(e) => setEditForm({ ...editForm, receiptNumber: e.target.value })} /></label>
          <label>Estoque/região<input value={details?.Warehouse?.name || details?.warehouseLocation || ''} disabled /></label>
          <label>Data de recebimento<input type="date" value={editForm.receivedAt} disabled={!canEditEntryDocuments} onChange={(e) => setEditForm({ ...editForm, receivedAt: e.target.value })} /></label>
          <label>Ciclo<select value={editForm.cycle} disabled={!canEditEntryDocuments} onChange={(e) => setEditForm({ ...editForm, cycle: e.target.value })}><option value="quinzenal">Quinzenal</option><option value="mensal">Mensal</option><option value="extra">Extra</option></select></label>
          <label>Origem/fornecedor<input value={editForm.sourceCompany} disabled={!canEditEntryDocuments} onChange={(e) => setEditForm({ ...editForm, sourceCompany: e.target.value })} /></label>
          <label>Status da conferência<select value={editForm.conferenceStatus} disabled={!canEditEntryDocuments} onChange={(e) => setEditForm({ ...editForm, conferenceStatus: e.target.value })}><option value="conferido">Conferido</option><option value="pendente_conferencia">Pendente</option><option value="divergente">Divergente</option></select></label>
          <label>Tipo de documento<select value={editForm.fiscalDocumentType} disabled={!canEditEntryDocuments} onChange={(e) => setEditForm({ ...editForm, fiscalDocumentType: e.target.value })}><option value="nota_fiscal">Nota fiscal</option><option value="termo_entrega">Termo de entrega</option><option value="romaneio">Romaneio</option><option value="recibo">Recibo</option><option value="outro">Outro</option></select></label>
          <label>Número do documento<input value={editForm.fiscalDocumentNumber} disabled={!canEditEntryDocuments} onChange={(e) => setEditForm({ ...editForm, fiscalDocumentNumber: e.target.value })} /></label>
          <label>Data do documento<input type="date" value={editForm.fiscalDocumentDate || ''} disabled={!canEditEntryDocuments} onChange={(e) => setEditForm({ ...editForm, fiscalDocumentDate: e.target.value })} /></label>
          <label>Emissor do documento<input value={editForm.fiscalIssuer} disabled={!canEditEntryDocuments} onChange={(e) => setEditForm({ ...editForm, fiscalIssuer: e.target.value })} /></label>
          <label>Chave da NF-e<input value={editForm.invoiceAccessKey} disabled={!canEditEntryDocuments} onChange={(e) => setEditForm({ ...editForm, invoiceAccessKey: e.target.value })} /></label>
          <label>Recebido/conferido por<input value={editForm.receivedByName} disabled={!canEditEntryDocuments} onChange={(e) => setEditForm({ ...editForm, receivedByName: e.target.value })} /></label>
          <label>Localização interna<input value={editForm.warehouseLocation} disabled={!canEditEntryDocuments} onChange={(e) => setEditForm({ ...editForm, warehouseLocation: e.target.value })} /></label>
          <label className="full-span">Substituir comprovante<input type="file" accept="image/*,.pdf" disabled={!canEditEntryDocuments} onChange={onEditFile} /><small>Deixe sem selecionar para manter o comprovante atual.</small></label>
        </div>
        {editForm.proofAttachmentName && <AttachmentPreview compact name={editForm.proofAttachmentName} data={editForm.proofAttachmentData} label="Comprovante vinculado" />}
        <label>Observações<textarea rows="3" value={editForm.notes} disabled={!canEditEntryDocuments} onChange={(e) => setEditForm({ ...editForm, notes: e.target.value })} /></label>
      </div>}
    </Modal>
  </div>;
}
