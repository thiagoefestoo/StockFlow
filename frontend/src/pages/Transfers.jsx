import { useEffect, useMemo, useState } from 'react';
import { Link, useLocation, useNavigate } from 'react-router-dom';
import api from '../services/api';
import Modal from '../components/Modal';
import DetailsModal, { DetailGrid, DetailList } from '../components/DetailsModal';
import AttachmentPreview from '../components/AttachmentPreview';
import { useAuth } from '../contexts/AuthContext';
import { formatQuantity, formatQuantityInput, formatQuantityWithUnit } from '../utils/formatQuantity';
import { TRANSFER_REASON_OPTIONS } from '../constants/operationOptions';
import FloatingAlert from '../components/FloatingAlert';
import OperationReviewModal from '../components/OperationReviewModal';
import { duplicateItemIds, duplicateSerials, optionsWithoutSelected, selectedSerialsExcept } from '../utils/operationSelections';
import { getTransferAttachments, transferAttachmentSummary } from '../utils/transferAttachments';

function brl(value) { return Number(value || 0).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' }); }
function dt(value) { return value ? new Date(value).toLocaleString('pt-BR') : '-'; }
function qtyLabel(value, unit = '') { return formatQuantityWithUnit(value, unit); }
function toQuantityNumber(value) {
  const parsed = Number(String(value ?? '').replace(',', '.'));
  return Number.isFinite(parsed) ? parsed : 0;
}

function availableQuantityForMaterial(material, serialAssets = []) {
  if (!material) return 0;
  return material.requiresSerial ? serialAssets.length : toQuantityNumber(material.mainStock);
}

function normalizeTransferQuantityInput(value) {
  const raw = String(value ?? '').replace(',', '.').trim();
  if (!raw) return '';
  const parsed = Number(raw);
  if (!Number.isFinite(parsed) || parsed <= 0) return '';
  return formatQuantityInput(parsed);
}

function defaultQuantityForMaterial(material, serialAssets = []) {
  const available = availableQuantityForMaterial(material, serialAssets);
  if (available <= 0) return '';
  return '1';
}

function isReturnTransfer(transfer) {
  return String(transfer?.transferNumber || '').toUpperCase().startsWith('RETORNO-');
}

function isToolTransfer(transfer) {
  return transfer?.transferType === 'ferramenta' || String(transfer?.transferNumber || '').toUpperCase().startsWith('FERRAMENTA-');
}

function transferTypeLabel(transfer) {
  if (isToolTransfer(transfer)) return 'Ferramenta técnico → técnico';
  return isReturnTransfer(transfer) ? 'Retorno técnico → estoque' : 'Entrega estoque → técnico';
}

function transferWarehouseLabel(transfer) {
  if (isToolTransfer(transfer)) return 'Técnico de origem';
  return isReturnTransfer(transfer) ? 'Estoque destino' : 'Estoque origem';
}


function normalizeSerialText(value) { return String(value || '').trim().toLowerCase(); }
function parseSerialTerms(value) {
  return String(value || '')
    .split(/[\n,;\t ]+/)
    .map((item) => item.trim())
    .filter(Boolean);
}
function assetSearchText(asset) {
  return [asset.serialNumber, asset.mac, asset.brand, asset.model, asset.Material?.name]
    .filter(Boolean)
    .join(' ')
    .toLowerCase();
}
function uniqueSerials(values = []) {
  const seen = new Set();
  const out = [];
  for (const value of values) {
    const serial = String(value || '').trim();
    if (!serial) continue;
    const key = serial.toUpperCase();
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(serial);
  }
  return out;
}

export default function Transfers() {
  const { isAdmin } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
  const [transfers, setTransfers] = useState([]);
  const [approvedRequests, setApprovedRequests] = useState([]);
  const [technicians, setTechnicians] = useState([]);
  const [warehouses, setWarehouses] = useState([]);
  const [warehouseMaterials, setWarehouseMaterials] = useState([]);
  const [availableAssets, setAvailableAssets] = useState([]);
  const [loadingStock, setLoadingStock] = useState(false);
  const [modal, setModal] = useState(false);
  const [details, setDetails] = useState(null);
  const [edit, setEdit] = useState({ open: false, item: null, form: {} });
  const [form, setForm] = useState({ warehouseId: '', technicianId: '', notes: '', materialRequestId: '', items: [] });
  const [assetSearch, setAssetSearch] = useState('');
  const [requestPrefilled, setRequestPrefilled] = useState(false);
  const [transferSearch, setTransferSearch] = useState('');
  const [transferStatusFilter, setTransferStatusFilter] = useState('');
  const [transferTypeFilter, setTransferTypeFilter] = useState('');
  const [requestSearch, setRequestSearch] = useState('');
  const [requestWarehouseFilter, setRequestWarehouseFilter] = useState('');
  const [requestTechnicianFilter, setRequestTechnicianFilter] = useState('');
  const [notice, setNotice] = useState({ text: '', type: 'danger' });
  const [saving, setSaving] = useState(false);
  const [reviewOpen, setReviewOpen] = useState(false);
  const [toolTransferModal, setToolTransferModal] = useState(false);
  const [toolTransferReview, setToolTransferReview] = useState(false);
  const [toolTransferForm, setToolTransferForm] = useState({ fromTechnicianId: '', technicianId: '', notes: '', toolIds: [] });
  const [sourceTools, setSourceTools] = useState([]);
  const [sourceToolsLoading, setSourceToolsLoading] = useState(false);
  const [toolTransferSaving, setToolTransferSaving] = useState(false);

  function showNotice(text, type = 'danger') {
    setNotice({ text, type });
  }

  async function openTransferDetails(transfer) {
    try {
      const response = await api.get(`/transfers/${transfer.id}`);
      setDetails(response.data.data);
    } catch (error) {
      showNotice(error.response?.data?.message || 'Não foi possível carregar os detalhes da guia.');
    }
  }

  async function load() {
    try {
      const [t, tec, wh, requests] = await Promise.all([
        api.get('/transfers'),
        api.get('/technicians'),
        api.get('/warehouses?operationalOnly=true').catch(() => ({ data: { data: [] } })),
        api.get('/material-requests', { params: { status: 'aprovado', requestType: 'reposicao_carga' } }).catch(() => ({ data: { data: [] } })),
      ]);
      setTransfers(t.data.data || []);
      setTechnicians(tec.data.data || []);
      setWarehouses(wh.data.data || []);
      setApprovedRequests(requests.data.data || []);
    } catch (error) {
      showNotice(error.response?.data?.message || error.message || 'Não foi possível carregar as transferências.');
    }
  }

  async function loadWarehouseStock(warehouseId) {
    if (!warehouseId) {
      setWarehouseMaterials([]);
      setAvailableAssets([]);
      return;
    }
    setLoadingStock(true);
    try {
      const [overview, assets] = await Promise.all([
        api.get('/stock/overview', { params: { warehouseId } }),
        api.get('/stock/assets', { params: { ownerType: 'estoque', status: 'em_estoque', warehouseId, limit: 2000 } }),
      ]);
      const stockMaterials = overview.data.data || [];
      const stockAssets = assets.data.data || [];
      setWarehouseMaterials(stockMaterials.filter((material) => Number(material.mainStock || 0) > 0));
      setAvailableAssets(stockAssets);
      setForm((current) => {
        if (!current.materialRequestId || String(current.warehouseId) !== String(warehouseId)) return current;
        return {
          ...current,
          items: current.items.map((item) => {
            const material = stockMaterials.find((row) => Number(row.id) === Number(item.materialId)) || item.requestMaterial;
            const available = material?.requiresSerial
              ? stockAssets.filter((asset) => Number(asset.materialId) === Number(item.materialId)).length
              : toQuantityNumber(material?.mainStock || 0);
            const requestedMaximum = toQuantityNumber(item.requestedQuantity);
            const currentQuantity = toQuantityNumber(item.quantity);
            const desired = currentQuantity > 0 ? currentQuantity : requestedMaximum;
            const nextQuantity = Math.max(0, Math.trunc(Math.min(desired, requestedMaximum || desired, available)));
            return {
              ...item,
              quantity: formatQuantityInput(nextQuantity),
              serialNumbers: nextQuantity === 0 ? [] : item.serialNumbers,
              requestMaterial: material ? { ...item.requestMaterial, ...material } : item.requestMaterial,
            };
          }),
        };
      });
    } catch (error) {
      setWarehouseMaterials([]);
      setAvailableAssets([]);
      showNotice(error.response?.data?.message || error.message || 'Não foi possível carregar o saldo do estoque selecionado.');
    } finally {
      setLoadingStock(false);
    }
  }

  useEffect(() => { load(); }, []);

  useEffect(() => {
    const requestId = new URLSearchParams(location.search).get('requestId');
    if (!requestId || requestPrefilled || !warehouses.length || !technicians.length) return;
    async function prefillFromRequest() {
      try {
        const { data } = await api.get(`/material-requests/${requestId}`);
        const request = data.data;
        if (!request || request.status !== 'aprovado' || request.requestType === 'recarga_estoque') {
          showNotice('A solicitação não está aprovada para entrega ou não corresponde a uma carga de técnico.');
          setRequestPrefilled(true);
          navigate('/transferencias', { replace: true });
          return;
        }
        const warehouseId = request.warehouseId || request.Technician?.defaultWarehouseId || warehouses[0]?.id || '';
        setForm({
          warehouseId: warehouseId ? String(warehouseId) : '',
          technicianId: request.technicianId ? String(request.technicianId) : '',
          materialRequestId: request.id,
          notes: `Entrega pela solicitação ${request.requestNumber}.`,
          items: (request.MaterialRequestItems || []).map((item) => ({
            materialId: item.materialId ? String(item.materialId) : '',
            requestedQuantity: item.approvedQuantity ?? item.quantity ?? 1,
            quantity: item.approvedQuantity ?? item.quantity ?? 1,
            serialNumbers: [],
            requestItemId: item.id,
            requestMaterial: item.Material ? {
              id: item.Material.id,
              name: item.Material.name,
              unit: item.Material.unit,
              requiresSerial: !!item.Material.requiresSerial,
              unitCost: item.unitCost ?? item.Material.unitCost,
              mainStock: 0,
            } : null,
          })),
        });
        setAssetSearch('');
        setModal(true);
        setRequestPrefilled(true);
        navigate('/transferencias', { replace: true });
      } catch (error) {
        showNotice(error.response?.data?.message || error.message || 'Não foi possível carregar a solicitação aprovada.');
        setRequestPrefilled(true);
        navigate('/transferencias', { replace: true });
      }
    }
    prefillFromRequest();
  }, [warehouses, technicians, requestPrefilled, navigate, location.search]);

  useEffect(() => {
    if (!modal) return;
    if (form.warehouseId) return;
    const firstActive = warehouses.find((warehouse) => warehouse.status === 'ativo') || warehouses[0];
    if (firstActive) setForm((current) => ({ ...current, warehouseId: String(firstActive.id), items: [] }));
  }, [modal, warehouses, form.warehouseId]);

  useEffect(() => {
    if (modal) loadWarehouseStock(form.warehouseId);
  }, [modal, form.warehouseId]);

  const stockByMaterial = useMemo(() => {
    const map = {};
    for (const asset of availableAssets) {
      map[asset.materialId] = map[asset.materialId] || [];
      map[asset.materialId].push(asset);
    }
    return map;
  }, [availableAssets]);

  const materialOptions = useMemo(() => {
    return warehouseMaterials.slice().sort((a, b) => String(a.name).localeCompare(String(b.name)));
  }, [warehouseMaterials]);

  function materialForItem(item) {
    return materialOptions.find((material) => Number(material.id) === Number(item?.materialId)) || item?.requestMaterial || null;
  }

  const requestLinked = Boolean(form.materialRequestId);

  const selectedTechnician = technicians.find((t) => String(t.id) === String(form.technicianId));
  const selectedWarehouse = warehouses.find((w) => String(w.id) === String(form.warehouseId));

  function openNewTransfer() {
    const firstActive = warehouses.find((warehouse) => warehouse.status === 'ativo') || warehouses[0];
    setForm({ warehouseId: firstActive ? String(firstActive.id) : '', technicianId: '', notes: '', materialRequestId: '', items: [] });
    setAssetSearch('');
    setModal(true);
  }


  function openApprovedRequest(requestId) {
    setRequestPrefilled(false);
    navigate(`/transferencias?requestId=${requestId}`);
  }

  function handleMaterialChange(index, materialId) {
    const material = materialOptions.find((m) => Number(m.id) === Number(materialId));
    const serialAssets = stockByMaterial[materialId] || [];
    const currentQuantity = normalizeTransferQuantityInput(form.items[index]?.quantity);
    const nextQuantity = materialId ? (currentQuantity || defaultQuantityForMaterial(material, serialAssets)) : '';

    updateItem(index, {
      materialId,
      quantity: nextQuantity,
      serialNumbers: [],
      assetSearch: '',
      assetSearchApplied: '',
    });
  }

  function addItem() {
    if (!form.warehouseId) {
      showNotice('Selecione primeiro o estoque de origem.');
      return;
    }
    if (!materialOptions.length) {
      showNotice('Este estoque não possui materiais disponíveis para transferência.');
      return;
    }
    setForm({ ...form, items: [...form.items, { materialId: '', quantity: '', serialNumbers: [] }] });
  }

  function removeItem(i) {
    setForm({ ...form, items: form.items.filter((_, idx) => idx !== i) });
  }

  function updateItem(i, patch) {
    const items = [...form.items];
    items[i] = { ...items[i], ...patch };
    setForm({ ...form, items });
  }

  function toggleSerial(i, serialNumber) {
    const item = form.items[i];
    const selected = new Set(item.serialNumbers || []);
    if (selected.has(serialNumber)) {
      selected.delete(serialNumber);
    } else {
      const desired = Math.trunc(toQuantityNumber(item.quantity));
      if (requestLinked && desired > 0 && selected.size >= desired) {
        showNotice(`Selecione exatamente ${formatQuantity(desired)} serial(is), conforme a quantidade solicitada.`);
        return;
      }
      selected.add(serialNumber);
    }
    updateItem(i, { serialNumbers: Array.from(selected) });
  }



  function replaceSerialsForItem(i, serials) {
    const item = form.items[i];
    const selected = uniqueSerials(serials);
    const desired = Math.trunc(toQuantityNumber(item?.quantity));
    const limited = requestLinked && desired > 0 ? selected.slice(0, desired) : selected;
    updateItem(i, requestLinked
      ? { serialNumbers: limited }
      : { serialNumbers: limited, quantity: limited.length || 1 });
  }

  function selectQuantityForItem(i, assets) {
    const item = form.items[i];
    const desired = Math.trunc(toQuantityNumber(item.quantity));
    if (desired <= 0) {
      showNotice('Informe uma quantidade válida para selecionar os seriais.');
      return;
    }
    if (desired > assets.length) {
      showNotice(`Quantidade maior que os seriais disponíveis. Disponível: ${assets.length}.`);
      return;
    }
    replaceSerialsForItem(i, assets.slice(0, desired).map((asset) => asset.serialNumber));
  }

  function validateBeforeSave() {
    if (!form.warehouseId) return 'Selecione o estoque de origem.';
    if (!form.technicianId) return 'Selecione o técnico de destino.';
    if (!form.items.length && !requestLinked) return 'Adicione pelo menos um item à transferência.';

    const repeatedMaterials = duplicateItemIds(form.items);
    if (repeatedMaterials.length) return 'O mesmo material não pode ser selecionado mais de uma vez. Remova o item repetido antes de continuar.';
    const repeatedSerials = duplicateSerials(form.items);
    if (repeatedSerials.length) return `O mesmo serial não pode ser usado mais de uma vez na transferência: ${repeatedSerials.join(', ')}.`;

    for (const item of form.items) {
      const material = materialForItem(item);
      if (!material) return 'Existe item selecionado que não está disponível no estoque de origem.';
      const requestedMaximum = requestLinked ? toQuantityNumber(item.requestedQuantity) : 0;
      const deliveryQuantity = toQuantityNumber(item.quantity);
      const available = availableQuantityForMaterial(material, stockByMaterial[item.materialId] || []);
      if (deliveryQuantity < 0) return `A quantidade de ${material.name} não pode ser negativa.`;
      if (requestLinked && requestedMaximum > 0 && deliveryQuantity > requestedMaximum) {
        return `A quantidade a transferir de ${material.name} não pode ultrapassar o solicitado (${qtyLabel(requestedMaximum, material.unit)}).`;
      }
      if (deliveryQuantity === 0) {
        if (requestLinked) continue;
        return `Informe uma quantidade válida para ${material.name}.`;
      }
      if (material.requiresSerial) {
        const quantity = Math.trunc(deliveryQuantity);
        const serialCount = Array.isArray(item.serialNumbers) ? item.serialNumbers.length : 0;
        if (quantity > available) return `Quantidade acima do que consta em estoque para ${material.name}. Disponível neste estoque: ${qtyLabel(available, material.unit)}.`;
        if (serialCount !== quantity) return `Para ${material.name}, selecione exatamente ${formatQuantity(quantity)} serial(is). Selecionado(s): ${formatQuantity(serialCount)}.`;
      } else {
        const quantity = toQuantityNumber(item.quantity);
        if (quantity > available) return `Quantidade acima do que consta em estoque para ${material.name}. Disponível neste estoque: ${qtyLabel(available, material.unit)}.`;
      }
    }
    return null;
  }

  function openReview() {
    const validationError = validateBeforeSave();
    if (validationError) {
      showNotice(validationError);
      return;
    }
    setReviewOpen(true);
  }

  async function save() {
    if (saving) return;
    const validationError = validateBeforeSave();
    if (validationError) {
      showNotice(validationError);
      return;
    }

    setSaving(true);
    try {
      const payload = {
        ...form,
        warehouseId: form.warehouseId,
        items: form.items.map((item) => ({
          materialId: item.materialId,
          requestItemId: item.requestItemId || null,
          quantity: toQuantityNumber(item.quantity),
          serialNumbers: Array.isArray(item.serialNumbers) ? item.serialNumbers : [],
        })),
      };
      const technicianLimit = Number(selectedTechnician?.transferApprovalLimit ?? 500);
      if (!form.materialRequestId && totalPreview > technicianLimit) {
        const requestPayload = {
          technicianId: form.technicianId,
          warehouseId: form.warehouseId,
          requestType: 'reposicao_carga',
          priority: 'media',
          requesterNotes: form.notes || `Transferência acima do limite individual de ${selectedTechnician?.name || 'técnico'}.`,
          items: payload.items,
        };
        const response = await api.post('/material-requests', requestPayload);
        showNotice(response.data?.message || 'Carga enviada para aprovação por exceder o limite individual do técnico.', 'warning');
        setReviewOpen(false);
        setModal(false);
        setForm({ warehouseId: '', technicianId: '', notes: '', materialRequestId: '', items: [] });
        setAssetSearch('');
        setWarehouseMaterials([]);
        setAvailableAssets([]);
        return;
      }

      const response = await api.post('/transfers', payload);
      try {
        localStorage.setItem('superinfra:technician-box-refresh', String(Date.now()));
        window.dispatchEvent(new Event('superinfra:technician-box-refresh'));
      } catch (_) {}
      if (form.warehouseId) await loadWarehouseStock(form.warehouseId);
      setReviewOpen(false);
      setModal(false);
      setForm({ warehouseId: '', technicianId: '', notes: '', materialRequestId: '', items: [] });
      setAssetSearch('');
      setWarehouseMaterials([]);
      setAvailableAssets([]);
      showNotice(response.data?.message || 'Material transferido e guia gerada com sucesso.', 'success');
      await load();
    } catch (error) {
      showNotice(error.response?.data?.message || error.message || 'Não foi possível transferir o material.');
    } finally {
      setSaving(false);
    }
  }

  function openToolTransfer() {
    setToolTransferForm({ fromTechnicianId: '', technicianId: '', notes: '', toolIds: [] });
    setSourceTools([]);
    setToolTransferReview(false);
    setToolTransferModal(true);
  }

  async function selectToolSource(fromTechnicianId) {
    setToolTransferForm((current) => ({ ...current, fromTechnicianId, technicianId: String(current.technicianId) === String(fromTechnicianId) ? '' : current.technicianId, toolIds: [] }));
    setSourceTools([]);
    if (!fromTechnicianId) return;
    setSourceToolsLoading(true);
    try {
      const response = await api.get(`/technicians/${fromTechnicianId}/tools`);
      setSourceTools((response.data.data?.tools || []).filter((tool) => tool.status === 'com_tecnico'));
    } catch (error) {
      showNotice(error.response?.data?.message || 'Não foi possível carregar as ferramentas do técnico de origem.');
    } finally {
      setSourceToolsLoading(false);
    }
  }

  function addToolToTransfer(toolId) {
    const id = Number(toolId);
    if (!id || toolTransferForm.toolIds.some((selectedId) => Number(selectedId) === id)) return;
    setToolTransferForm((current) => ({ ...current, toolIds: [...current.toolIds, id] }));
  }

  function removeToolFromTransfer(toolId) {
    setToolTransferForm((current) => ({ ...current, toolIds: current.toolIds.filter((id) => Number(id) !== Number(toolId)) }));
  }

  function validateToolTransfer() {
    if (!toolTransferForm.fromTechnicianId) return 'Selecione o técnico de origem das ferramentas.';
    if (!toolTransferForm.technicianId) return 'Selecione o técnico de destino das ferramentas.';
    if (String(toolTransferForm.fromTechnicianId) === String(toolTransferForm.technicianId)) return 'O técnico de origem e o técnico de destino precisam ser diferentes.';
    if (!toolTransferForm.toolIds.length) return 'Selecione ao menos uma ferramenta para transferir.';
    const activeIds = new Set(sourceTools.filter((tool) => tool.status === 'com_tecnico').map((tool) => Number(tool.id)));
    if (toolTransferForm.toolIds.some((id) => !activeIds.has(Number(id)))) return 'Uma ferramenta selecionada não está mais disponível na ficha do técnico de origem.';
    return null;
  }

  function openToolTransferReview() {
    const error = validateToolTransfer();
    if (error) {
      showNotice(error);
      return;
    }
    setToolTransferReview(true);
  }

  async function saveToolTransfer() {
    const error = validateToolTransfer();
    if (error) {
      showNotice(error);
      return;
    }
    setToolTransferSaving(true);
    try {
      const response = await api.post('/transfers/tools', {
        fromTechnicianId: toolTransferForm.fromTechnicianId,
        technicianId: toolTransferForm.technicianId,
        notes: toolTransferForm.notes || null,
        toolIds: toolTransferForm.toolIds.map(Number),
      });
      setToolTransferReview(false);
      setToolTransferModal(false);
      setToolTransferForm({ fromTechnicianId: '', technicianId: '', notes: '', toolIds: [] });
      setSourceTools([]);
      showNotice(response.data?.message || 'Ferramentas transferidas e guia gerada.', 'success');
      await load();
    } catch (error) {
      showNotice(error.response?.data?.message || error.message || 'Não foi possível transferir as ferramentas.');
    } finally {
      setToolTransferSaving(false);
    }
  }

  async function saveEdit() {
    try {
      const response = await api.put(`/transfers/${edit.item.id}`, edit.form);
      setEdit({ open: false, item: null, form: {} });
      showNotice(response.data?.message || 'Guia atualizada com sucesso.', 'success');
      await load();
    } catch (error) {
      showNotice(error.response?.data?.message || error.message || 'Não foi possível atualizar a guia.');
    }
  }

  async function sign(id, fileList) {
    const files = Array.from(fileList || []);
    if (!files.length) return;
    if (files.length > 8) {
      showNotice('Selecione no máximo 8 arquivos por vez.');
      return;
    }
    const allowed = files.every((file) => file.type === 'application/pdf' || file.type.startsWith('image/'));
    if (!allowed) {
      showNotice('Envie somente arquivos PDF ou imagens.');
      return;
    }
    const totalSize = files.reduce((sum, file) => sum + Number(file.size || 0), 0);
    if (totalSize > 12 * 1024 * 1024) {
      showNotice('O conjunto de arquivos deve ter no máximo 12 MB por envio.');
      return;
    }
    try {
      const attachments = await Promise.all(files.map((file) => new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = () => resolve({ name: file.name, data: reader.result });
        reader.onerror = reject;
        reader.readAsDataURL(file);
      })));
      const response = await api.post(`/transfers/${id}/sign`, { attachments, signatureResponsible: 'Anexo recebido' });
      showNotice(response.data?.message || `${attachments.length} arquivo(s) anexado(s).`, 'success');
      await load();
    } catch (error) {
      showNotice(error.response?.data?.message || error.message || 'Não foi possível anexar os documentos.');
    }
  }

  const filteredApprovedRequests = useMemo(() => {
    const search = requestSearch.trim().toLowerCase();
    return approvedRequests.filter((request) => {
      if (requestWarehouseFilter && String(request.warehouseId || '') !== String(requestWarehouseFilter)) return false;
      if (requestTechnicianFilter && String(request.technicianId || '') !== String(requestTechnicianFilter)) return false;
      if (!search) return true;
      const text = [
        request.requestNumber,
        request.Technician?.name,
        request.Warehouse?.name,
        request.requesterNotes,
        ...(request.MaterialRequestItems || []).map((item) => item.Material?.name),
      ].filter(Boolean).join(' ').toLowerCase();
      return text.includes(search);
    });
  }, [approvedRequests, requestSearch, requestWarehouseFilter, requestTechnicianFilter]);

  const filteredTransfers = useMemo(() => {
    const search = transferSearch.trim().toLowerCase();
    return transfers.filter((transfer) => {
      const isReturn = isReturnTransfer(transfer);
      const isTool = isToolTransfer(transfer);
      if (transferTypeFilter === 'entrega' && (isReturn || isTool)) return false;
      if (transferTypeFilter === 'retorno' && !isReturn) return false;
      if (transferTypeFilter === 'ferramenta' && !isTool) return false;
      if (transferStatusFilter && transfer.status !== transferStatusFilter) return false;
      if (!search) return true;
      const text = [
        transfer.transferNumber,
        transfer.Technician?.name,
        transfer.fromTechnician?.name,
        transfer.Warehouse?.name,
        transfer.status,
        transfer.notes,
        ...(transfer.TransferItems || []).flatMap((item) => [item.Material?.name, item.TechnicianTool?.name, item.itemDescription, item.serialNumber]),
      ].filter(Boolean).join(' ').toLowerCase();
      return text.includes(search);
    });
  }, [transfers, transferSearch, transferStatusFilter, transferTypeFilter]);

  const totalPreview = form.items.reduce((sum, item) => {
    const material = materialForItem(item);
    if (!material) return sum;
    if (material.requiresSerial) return sum + (item.serialNumbers || []).reduce((s, serial) => s + Number(availableAssets.find((a) => a.serialNumber === serial)?.acquisitionCost || material.unitCost || 0), 0);
    return sum + toQuantityNumber(item.quantity) * Number(material.unitCost || 0);
  }, 0);
  const zeroStockRelease = requestLinked && form.items.length > 0 && form.items.every((item) => toQuantityNumber(item.quantity) === 0);
  const reviewItems = form.items
    .map((item, index) => {
      const material = materialForItem(item);
      if (!material) return null;
      const serials = Array.isArray(item.serialNumbers) ? item.serialNumbers : [];
      const quantity = toQuantityNumber(item.quantity);
      const totalValue = material.requiresSerial
        ? serials.reduce((sum, serial) => sum + Number(availableAssets.find((asset) => asset.serialNumber === serial)?.acquisitionCost || material.unitCost || 0), 0)
        : quantity * Number(material.unitCost || 0);
      return {
        key: `${item.materialId}-${index}`,
        name: material.name,
        detail: material.requiresSerial ? 'Equipamento controlado por serial' : `Material sem serial • saldo disponível ${qtyLabel(material.mainStock, material.unit)}`,
        quantity,
        unit: material.unit,
        serialCount: serials.length,
        serialPreview: serials.slice(0, 5).join(', ') + (serials.length > 5 ? ` +${serials.length - 5}` : ''),
        totalValue,
      };
    })
    .filter(Boolean);
  const reviewQuantity = reviewItems.reduce((sum, item) => sum + Number(item.quantity || 0), 0);
  const reviewWarning = selectedTechnician && totalPreview > Number(selectedTechnician.transferApprovalLimit ?? 500)
    ? `O valor ultrapassa o limite individual de ${brl(selectedTechnician.transferApprovalLimit ?? 500)}. Ao confirmar, a carga será enviada para aprovação antes de movimentar o estoque.`
    : zeroStockRelease
      ? 'Todos os itens estão com quantidade zero. A solicitação será liberada sem movimentação de material.'
      : 'Ao confirmar, o saldo do estoque será movimentado e a guia será gerada para a caixa do técnico.';

  const toolSourceTechnician = technicians.find((technician) => String(technician.id) === String(toolTransferForm.fromTechnicianId));
  const toolDestinationTechnician = technicians.find((technician) => String(technician.id) === String(toolTransferForm.technicianId));
  const selectedToolIds = new Set(toolTransferForm.toolIds.map(Number));
  const selectedTools = sourceTools.filter((tool) => selectedToolIds.has(Number(tool.id)));
  const availableToolsForTransfer = sourceTools.filter((tool) => tool.status === 'com_tecnico' && !selectedToolIds.has(Number(tool.id)));
  const toolTransferValue = selectedTools.reduce((sum, tool) => sum + Number(tool.referenceValue || 0), 0);
  const toolTransferReviewItems = selectedTools.map((tool) => ({
    key: tool.id,
    name: tool.name,
    detail: `${tool.brand || 'sem marca/modelo'} • patrimônio/série ${tool.serialNumber}`,
    quantity: 1,
    unit: 'un',
    serialCount: 1,
    serialPreview: tool.serialNumber,
    totalValue: Number(tool.referenceValue || 0),
  }));

  return (
    <div className="page-grid transfer-page">
      <FloatingAlert message={notice.text} type={notice.type} onClose={() => setNotice({ text: '', type: 'danger' })} />
      <div className="toolbar">
        <div><h2>🔁 Transferir material para técnico</h2><p>Selecione o estoque de origem, os materiais disponíveis nele e gere a guia para assinatura.</p></div>
        <div className="action-toolbar"><button className="ghost" onClick={openToolTransfer}>🧰 Transferir ferramentas</button><button onClick={openNewTransfer}>➕ Nova transferência</button></div>
      </div>

      <section className="panel transfer-request-queue">
        <div className="subtoolbar">
          <div><h3>📋 Solicitações aprovadas aguardando transferência</h3><p>Filtre a fila e abra a solicitação para ajustar a quantidade que realmente será entregue.</p></div>
          <span className="badge soft">{filteredApprovedRequests.length} aguardando</span>
        </div>
        <div className="form-grid transfer-request-filters">
          <label>🔎 Pesquisar solicitação<input value={requestSearch} onChange={(e) => setRequestSearch(e.target.value)} placeholder="Número, técnico, estoque ou material" /></label>
          <label>Estoque<select value={requestWarehouseFilter} onChange={(e) => setRequestWarehouseFilter(e.target.value)}><option value="">Todos os estoques autorizados</option>{warehouses.map((warehouse) => <option key={warehouse.id} value={warehouse.id}>{warehouse.name}</option>)}</select></label>
          <label>Técnico<select value={requestTechnicianFilter} onChange={(e) => setRequestTechnicianFilter(e.target.value)}><option value="">Todos os técnicos</option>{technicians.map((technician) => <option key={technician.id} value={technician.id}>{technician.name}</option>)}</select></label>
          <label className="filter-action"><span>&nbsp;</span><button type="button" className="ghost" onClick={() => { setRequestSearch(''); setRequestWarehouseFilter(''); setRequestTechnicianFilter(''); }}>Limpar filtros</button></label>
        </div>
        <div className="table-wrap"><table><thead><tr><th>Solicitação</th><th>Técnico</th><th>Estoque</th><th>Materiais</th><th>Qtd. solicitada</th><th>Valor aprovado</th><th className="action-cell">Ação</th></tr></thead><tbody>{filteredApprovedRequests.map((request) => <tr key={request.id}><td><strong>{request.requestNumber}</strong><br /><small>{request.priority || 'prioridade média'}</small></td><td>{request.Technician?.name || '-'}</td><td>{request.Warehouse?.name || 'Estoque do técnico'}</td><td>{(request.MaterialRequestItems || []).map((item) => item.Material?.name).filter(Boolean).join(', ') || '-'}</td><td>{formatQuantity(request.totalQuantity)}</td><td>{brl(request.totalValue)}</td><td><button type="button" onClick={() => openApprovedRequest(request.id)}>📦 Preparar transferência</button></td></tr>)}</tbody></table></div>
        {!filteredApprovedRequests.length && <div className="empty-state">Nenhuma solicitação aprovada encontrada com os filtros informados.</div>}
      </section>

      <section className="panel filters">
        <div className="form-grid">
          <label>🔎 Pesquisar<input value={transferSearch} onChange={(e) => setTransferSearch(e.target.value)} placeholder="Guia, técnico, estoque, material ou serial" /></label>
          <label>Tipo<select value={transferTypeFilter} onChange={(e) => setTransferTypeFilter(e.target.value)}><option value="">Todos</option><option value="entrega">Entrega para técnico</option><option value="retorno">Retorno para estoque</option><option value="ferramenta">Ferramenta entre técnicos</option></select></label>
          <label>Status<select value={transferStatusFilter} onChange={(e) => setTransferStatusFilter(e.target.value)}><option value="">Todos</option><option value="pendente_assinatura">Pendente de assinatura</option><option value="assinado">Assinado</option><option value="cancelado">Cancelado</option></select></label>
          <label className="filter-action"><span>&nbsp;</span><button type="button" className="ghost" onClick={() => { setTransferSearch(''); setTransferTypeFilter(''); setTransferStatusFilter(''); }}>Limpar filtros</button></label>
        </div>
      </section>

      <section className="panel"><div className="table-wrap"><table><thead><tr><th>Guia</th><th>Tipo</th><th>Técnico</th><th>Estoque</th><th>Data</th><th>Qtd</th><th>Valor</th><th>Status</th><th>Assinatura</th><th className="action-cell">Opções</th></tr></thead><tbody>{filteredTransfers.map((tr) => <tr key={tr.id}><td>{tr.transferNumber}</td><td><span className={`badge ${isToolTransfer(tr) ? 'patrimonio' : isReturnTransfer(tr) ? 'retorno_tecnico' : 'transferencia_tecnico'}`}>{transferTypeLabel(tr)}</span></td><td>{tr.Technician?.name}</td><td><small>{transferWarehouseLabel(tr)}</small><br />{isToolTransfer(tr) ? (tr.fromTechnician?.name || '-') : (tr.Warehouse?.name || '-')}</td><td>{dt(tr.deliveredAt)}</td><td>{formatQuantity(tr.totalQuantity)}</td><td>{brl(tr.totalValue)}</td><td><span className={`badge ${tr.status}`}>{tr.status}</span></td><td><div className="attachment-cell">{tr.attachmentName && <span className="badge success" title={tr.attachmentName}>{tr.attachmentName}</span>}<input type="file" multiple accept="image/*,.pdf" onChange={(e) => { sign(tr.id, e.target.files); e.target.value = ''; }} /><small>Selecione vários arquivos de uma vez. A guia deixa de ficar pendente após o primeiro anexo.</small></div></td><td><div className="action-toolbar"><button className="info" onClick={() => openTransferDetails(tr)}>🔎 Detalhes</button><Link className="ghost" to={`/transferencias/${tr.id}`}>🖨️ Guia</Link>{isAdmin && <button className="ghost" onClick={() => setEdit({ open: true, item: tr, form: { notes: tr.notes || '', status: tr.status || 'pendente_assinatura', deliveredAt: tr.deliveredAt ? String(tr.deliveredAt).slice(0, 16) : '', signatureResponsible: tr.signatureResponsible || '' } })}>✏️ Editar</button>}</div></td></tr>)}</tbody></table></div>{!filteredTransfers.length && <div className="empty-state">Nenhuma transferência encontrada com os filtros informados.</div>}</section>

      <Modal open={modal} title={form.materialRequestId ? '📦 Transferir itens da solicitação aprovada' : '📦 Nova transferência para técnico'} onClose={() => !saving && setModal(false)} footer={<><button className="ghost" disabled={saving} onClick={() => setModal(false)}>Cancelar</button><button disabled={saving} onClick={openReview}>{zeroStockRelease ? 'Revisar liberação sem material' : 'Revisar transferência'}</button></>}>
        <div className="transfer-wizard">
          <section className="transfer-summary-card">
            <div><small>Estoque de origem</small><strong>{selectedWarehouse?.name || 'Selecione um estoque'}</strong><span>{selectedWarehouse ? `${selectedWarehouse.city || '-'} • ${selectedWarehouse.code || 'sem código'}` : 'Materiais serão filtrados pelo estoque'}</span></div>
            <div><small>Técnico selecionado</small><strong>{selectedTechnician?.name || 'Selecione um técnico'}</strong><span>{selectedTechnician?.ContractorCompany?.name || 'Carga individual'}</span></div>
            <div><small>Itens na guia</small><strong>{form.items.length}</strong><span>{formatQuantity(form.items.reduce((s, i) => s + toQuantityNumber(i.quantity || (i.serialNumbers || []).length || 0), 0))} unidade(s)</span></div>
            <div><small>Valor previsto</small><strong>{brl(totalPreview)}</strong><span>Equipamentos + consumíveis</span></div>
            <div><small>Limite sem aprovação</small><strong>{selectedTechnician ? brl(selectedTechnician.transferApprovalLimit ?? 500) : '-'}</strong><span>{selectedTechnician && totalPreview > Number(selectedTechnician.transferApprovalLimit ?? 500) ? 'Exige aprovação do administrador' : 'Liberação direta permitida'}</span></div>
          </section>
          <div className="form-grid">
            <label>🏬 Estoque de origem<select disabled={requestLinked} value={form.warehouseId} onChange={(e) => { setForm({ ...form, warehouseId: e.target.value, items: [] }); setAssetSearch(''); }}><option value="">Selecione</option>{warehouses.map((warehouse) => <option key={warehouse.id} value={warehouse.id}>{warehouse.name} — {warehouse.city || '-'} — {warehouse.code}</option>)}</select></label>
            <label>👷 Técnico<select disabled={requestLinked} value={form.technicianId} onChange={(e) => setForm({ ...form, technicianId: e.target.value })}><option value="">Selecione</option>{technicians.map((t) => <option key={t.id} value={t.id}>{t.name} — {t.ContractorCompany?.name || 'sem empresa'}</option>)}</select></label>
            <label className="span-2">📝 Motivo/observação<input disabled={requestLinked} list="transfer-reason-options" value={form.notes} onChange={(e) => setForm({ ...form, notes: e.target.value })} placeholder="Selecione um motivo padrão ou digite outro" /><datalist id="transfer-reason-options">{TRANSFER_REASON_OPTIONS.map((option) => <option key={option} value={option} />)}</datalist></label>
          </div>
          {requestLinked ? <div className="viz-callout"><strong>Solicitação aprovada vinculada.</strong> Técnico e materiais permanecem vinculados ao pedido. Ajuste a quantidade que será realmente entregue conforme o saldo disponível e selecione os seriais dos equipamentos antes de transferir.</div> : form.warehouseId && <div className="viz-callout">Apenas materiais com saldo no estoque selecionado aparecem abaixo. A transferência fica registrada no histórico, BI e auditoria. Quando o valor ultrapassa o limite individual do técnico, o sistema envia a carga para aprovação antes de movimentar o estoque.</div>}
          {loadingStock && <div className="empty-state">Carregando materiais do estoque selecionado...</div>}
          <div className="subtoolbar"><h4>Itens da guia</h4>{!requestLinked && <button className="ghost" onClick={addItem}>➕ Adicionar item</button>}</div>
          {!requestLinked && !loadingStock && form.warehouseId && materialOptions.length === 0 && <div className="empty-state">Este estoque não possui saldo disponível para transferência.</div>}
          {form.items.length === 0 && <div className="empty-state">{requestLinked ? 'A solicitação aprovada não possui itens disponíveis para transferência.' : 'Clique em “Adicionar item” para montar a carga do técnico.'}</div>}
          {form.items.map((item, i) => {
            const material = materialForItem(item);
            const allSerialAssets = stockByMaterial[item.materialId] || [];
            const serialsSelectedElsewhere = selectedSerialsExcept(form.items, i);
            const serialAssets = allSerialAssets.filter((asset) => {
              if (serialsSelectedElsewhere.has(String(asset.serialNumber || '').toUpperCase())) return false;
              const terms = parseSerialTerms(item.assetSearchApplied || '');
              if (!terms.length) return true;
              const text = assetSearchText(asset);
              return terms.some((term) => text.includes(normalizeSerialText(term)));
            });
            const availableMaterialOptions = optionsWithoutSelected(materialOptions, form.items, i);
            return (
              <div className="item-card transfer-item-card" key={i}>
                <div className="item-head"><strong>📦 Item {i + 1}</strong>{!requestLinked && <button className="ghost danger-outline" onClick={() => removeItem(i)}>Remover</button>}</div>
                <div className="form-grid">
                  <label>Material<select disabled={requestLinked} value={item.materialId} onChange={(e) => handleMaterialChange(i, e.target.value)}><option value="">Selecione o material</option>{material && !materialOptions.some((option) => Number(option.id) === Number(material.id)) && <option value={material.id}>{material.name}</option>}{availableMaterialOptions.map((m) => <option key={m.id} value={m.id}>{m.name} — disponível {qtyLabel(m.mainStock, m.unit)}</option>)}</select></label>
                  <label>Quantidade a transferir<input type="number" min={requestLinked ? 0 : 1} max={material ? Math.min(availableQuantityForMaterial(material, allSerialAssets), requestLinked ? toQuantityNumber(item.requestedQuantity) || Number.POSITIVE_INFINITY : Number.POSITIVE_INFINITY) : undefined} step="1" value={item.quantity ?? ''} disabled={!material} onChange={(e) => updateItem(i, { quantity: e.target.value, serialNumbers: material?.requiresSerial ? [] : item.serialNumbers })} placeholder={material ? 'Informe o que será realmente entregue' : 'Selecione o material primeiro'} />
                    {(() => {
                      if (!material) return <small>Escolha o material e informe a quantidade que será transferida.</small>;
                      const available = availableQuantityForMaterial(material, allSerialAssets);
                      const requested = toQuantityNumber(item.quantity);
                      const exceeds = requested > available;
                      return (
                        <>
                          {requestLinked && <small className="requested-quantity-label">Quantidade solicitada pelo técnico: <strong>{qtyLabel(item.requestedQuantity, material?.unit)}</strong></small>}
                          <small className={exceeds ? 'field-warning stock-balance-label' : 'stock-balance-label'}>Saldo disponível neste estoque: <strong>{qtyLabel(available, material?.unit)}</strong></small>
                          {requestLinked && toQuantityNumber(item.quantity) === 0 && (
                            <small className="zero-stock-release-label">✅ Quantidade 0 selecionada. Este item não será transferido, mas os demais itens da solicitação poderão ser entregues normalmente.</small>
                          )}
                          {exceeds && (
                            <small className="field-warning">⚠️ Quantidade acima do que consta em estoque. Máximo disponível: {qtyLabel(available, material?.unit)}.</small>
                          )}
                          {material.requiresSerial && available === 0 && (
                            <small className="field-warning">Este material está cadastrado como "Exige número de série", mas não há nenhum serial disponível neste estoque. Se este item deveria ser controlado por quantidade (ex.: consumível), edite o cadastro em Estoque → Materiais e desmarque "Exige número de série".</small>
                          )}
                        </>
                      );
                    })()}
                  </label>
                </div>
                {material?.requiresSerial && (
                  <div className="serial-picker">
                    <div className="serial-picker-head serial-picker-head-stacked">
                      <div>
                        <strong>🏷️ Seriais disponíveis no estoque selecionado</strong>
                        <span>{serialAssets.length} disponível(is) filtrado(s) • {allSerialAssets.length} no estoque • {item.serialNumbers?.length || 0} selecionado(s)</span>
                      </div>
                      <div className="serial-transfer-quantity"><button type="button" className="ghost" onClick={() => selectQuantityForItem(i, serialAssets)}>Selecionar quantidade informada</button></div>
                      <div className="serial-quick-filter">
                        <label>
                          <span>🔎 Pesquisar ONU/serial (cole a coluna do Excel — uma por linha)</span>
                          <textarea
                            rows="4"
                            value={item.assetSearch || ''}
                            onChange={(e) => updateItem(i, { assetSearch: e.target.value })}
                            onKeyDown={(e) => { if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) updateItem(i, { assetSearchApplied: item.assetSearch || '' }); }}
                            placeholder={'Cole aqui a lista de ONUs, uma em cada linha, exatamente como copia do Excel:\n102003\n102002\n102001'}
                          />
                        </label>
                        <div className="row-actions">
                          <button type="button" onClick={() => updateItem(i, { assetSearchApplied: item.assetSearch || '' })}>🔍 Filtrar</button>
                          <button type="button" className="ghost" onClick={() => updateItem(i, { assetSearch: '', assetSearchApplied: '' })}>Limpar pesquisa</button>
                        </div>
                      </div>
                      <div className="serial-actions-row">
                        <button type="button" className="ghost" onClick={() => replaceSerialsForItem(i, serialAssets.map((asset) => asset.serialNumber))}>Selecionar tudo filtrado</button>
                        <button type="button" className="ghost" onClick={() => replaceSerialsForItem(i, [])}>Limpar seleção</button>
                      </div>
                    </div>
                    <div className="serial-grid">{serialAssets.map((asset) => { const checked = (item.serialNumbers || []).includes(asset.serialNumber); return <button type="button" key={asset.id} className={`serial-chip ${checked ? 'selected' : ''}`} onClick={() => toggleSerial(i, asset.serialNumber)}><b>{checked ? '✅' : '🏷️'} {asset.serialNumber}</b><span>{asset.Material?.name} • {asset.Warehouse?.name || selectedWarehouse?.name || 'estoque'} • {asset.brand || '-'} {asset.model || ''}</span><small>{asset.mac || 'sem MAC'} • {brl(asset.acquisitionCost)}</small></button>; })}</div>
                    {serialAssets.length === 0 && <div className="empty-state">Nenhum serial disponível para esse material no estoque selecionado.</div>}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      </Modal>

      <OperationReviewModal
        open={reviewOpen}
        title={zeroStockRelease ? 'Revisar liberação da solicitação' : 'Revisar transferência para o técnico'}
        description="Confira estoque, técnico, quantidades, seriais e valores. A transferência só será executada depois da confirmação abaixo."
        metadata={[
          { label: 'Estoque de origem', value: selectedWarehouse?.name, hint: selectedWarehouse?.code || selectedWarehouse?.city },
          { label: 'Técnico de destino', value: selectedTechnician?.name, hint: selectedTechnician?.ContractorCompany?.name || 'Carga individual' },
          { label: 'Motivo', value: form.notes || 'Não informado' },
          { label: 'Tipo de fluxo', value: form.materialRequestId ? 'Entrega de solicitação aprovada' : 'Transferência direta' },
        ]}
        items={reviewItems}
        totalQuantity={reviewQuantity}
        totalValue={totalPreview}
        warning={reviewWarning}
        loading={saving}
        confirmLabel={selectedTechnician && totalPreview > Number(selectedTechnician.transferApprovalLimit ?? 500) ? 'Confirmar e enviar para aprovação' : zeroStockRelease ? 'Confirmar liberação sem material' : 'Confirmar transferência'}
        onCancel={() => setReviewOpen(false)}
        onConfirm={save}
      />

      <Modal open={toolTransferModal} title="🧰 Transferir ferramentas entre técnicos" onClose={() => !toolTransferSaving && setToolTransferModal(false)} footer={<><button className="ghost" disabled={toolTransferSaving} onClick={() => setToolTransferModal(false)}>Cancelar</button><button disabled={toolTransferSaving} onClick={openToolTransferReview}>Revisar transferência</button></>}>
        <div className="form-stack">
          <div className="form-grid">
            <label>Técnico de origem<select value={toolTransferForm.fromTechnicianId} onChange={(e) => selectToolSource(e.target.value)}><option value="">Selecione</option>{technicians.map((technician) => <option key={technician.id} value={technician.id}>{technician.name} — {technician.ContractorCompany?.name || 'sem empresa'}</option>)}</select></label>
            <label>Técnico de destino<select value={toolTransferForm.technicianId} onChange={(e) => setToolTransferForm({ ...toolTransferForm, technicianId: e.target.value })}><option value="">Selecione</option>{technicians.filter((technician) => String(technician.id) !== String(toolTransferForm.fromTechnicianId)).map((technician) => <option key={technician.id} value={technician.id}>{technician.name} — {technician.ContractorCompany?.name || 'sem empresa'}</option>)}</select></label>
            <label className="span-2">Motivo/observação<input value={toolTransferForm.notes} onChange={(e) => setToolTransferForm({ ...toolTransferForm, notes: e.target.value })} placeholder="Ex.: troca de equipe, substituição de técnico, remanejamento de ferramentas" /></label>
          </div>
          <div className="viz-callout">A lista mostra apenas ferramentas ativas cadastradas na ficha do técnico de origem. Ao selecionar uma ferramenta, ela sai da lista disponível e não pode ser repetida.</div>
          {sourceToolsLoading && <div className="empty-state">Carregando ferramentas do técnico de origem...</div>}
          {!sourceToolsLoading && toolTransferForm.fromTechnicianId && sourceTools.length === 0 && <div className="empty-state">Este técnico não possui ferramentas ativas cadastradas na ficha.</div>}
          <div className="tool-transfer-grid">
            <section className="panel-soft">
              <h4>Ferramentas disponíveis</h4>
              {availableToolsForTransfer.length === 0 && <div className="empty-state small">Nenhuma ferramenta disponível para selecionar.</div>}
              {availableToolsForTransfer.map((tool) => <div className="detail-row" key={tool.id}><b>{tool.name}</b><span>{tool.brand || 'sem marca/modelo'} • patrimônio/série {tool.serialNumber}</span><small>{brl(tool.referenceValue)}</small><div className="action-toolbar"><button type="button" onClick={() => addToolToTransfer(tool.id)}>Selecionar</button></div></div>)}
            </section>
            <section className="panel-soft">
              <h4>Ferramentas selecionadas ({selectedTools.length})</h4>
              {selectedTools.length === 0 && <div className="empty-state small">Selecione as ferramentas que serão transferidas.</div>}
              {selectedTools.map((tool) => <div className="detail-row" key={tool.id}><b>{tool.name}</b><span>{tool.brand || 'sem marca/modelo'} • patrimônio/série {tool.serialNumber}</span><small>{brl(tool.referenceValue)}</small><div className="action-toolbar"><button type="button" className="ghost danger-outline" onClick={() => removeToolFromTransfer(tool.id)}>Remover</button></div></div>)}
            </section>
          </div>
          <div className="submit-bar"><span>Selecionadas: <strong>{selectedTools.length}</strong> • valor: <strong>{brl(toolTransferValue)}</strong></span></div>
        </div>
      </Modal>

      <OperationReviewModal
        open={toolTransferReview}
        title="Revisar transferência de ferramentas"
        description="Confira os técnicos de origem e destino, as ferramentas, os patrimônios/séries e os valores antes de confirmar."
        metadata={[
          { label: 'Técnico de origem', value: toolSourceTechnician?.name, hint: toolSourceTechnician?.ContractorCompany?.name || 'Ficha de ferramentas' },
          { label: 'Técnico de destino', value: toolDestinationTechnician?.name, hint: toolDestinationTechnician?.ContractorCompany?.name || 'Nova responsabilidade' },
          { label: 'Motivo/observação', value: toolTransferForm.notes || 'Não informado' },
          { label: 'Tipo de fluxo', value: 'Ferramenta entre técnicos' },
        ]}
        items={toolTransferReviewItems}
        totalQuantity={selectedTools.length}
        totalValue={toolTransferValue}
        warning="Ao confirmar, as ferramentas sairão da ficha do técnico de origem e passarão para a ficha do técnico de destino. Uma guia pendente de assinatura será gerada."
        loading={toolTransferSaving}
        confirmLabel="Confirmar transferência de ferramentas"
        onCancel={() => setToolTransferReview(false)}
        onConfirm={saveToolTransfer}
      />

      <Modal open={edit.open} title={`✏️ Editar guia ${edit.item?.transferNumber || ''}`} onClose={() => setEdit({ open: false, item: null, form: {} })} footer={<><button className="ghost" onClick={() => setEdit({ open: false, item: null, form: {} })}>Cancelar</button><button onClick={saveEdit}>Salvar alteração</button></>}>
        <div className="form-grid"><label>Status<select value={edit.form.status || ''} onChange={(e) => setEdit({ ...edit, form: { ...edit.form, status: e.target.value } })}><option value="pendente_assinatura">Pendente de assinatura</option><option value="assinado">Assinado</option><option value="cancelado">Cancelado</option></select></label><label>Data de entrega<input type="datetime-local" value={edit.form.deliveredAt || ''} onChange={(e) => setEdit({ ...edit, form: { ...edit.form, deliveredAt: e.target.value } })} /></label><label>Responsável pela assinatura<input value={edit.form.signatureResponsible || ''} onChange={(e) => setEdit({ ...edit, form: { ...edit.form, signatureResponsible: e.target.value } })} /></label></div><label>Observações<textarea rows="4" value={edit.form.notes || ''} onChange={(e) => setEdit({ ...edit, form: { ...edit.form, notes: e.target.value } })} /></label><div className="viz-callout">🛡️ Alterações administrativas gravam histórico de auditoria.</div>
      </Modal>

      <DetailsModal open={!!details} title={`🔎 Detalhes da guia ${details?.transferNumber || ''}`} onClose={() => setDetails(null)} footer={<><button className="ghost" onClick={() => setDetails(null)}>Fechar</button>{details && <Link className="ghost" to={`/transferencias/${details.id}`}>Abrir guia</Link>}{isAdmin && details && <button onClick={() => { setEdit({ open: true, item: details, form: { notes: details.notes || '', status: details.status || 'pendente_assinatura', deliveredAt: details.deliveredAt ? String(details.deliveredAt).slice(0, 16) : '', signatureResponsible: details.signatureResponsible || '' } }); setDetails(null); }}>Editar</button>}</>}>
        {details && <><DetailGrid fields={[["Guia", details.transferNumber], ["Tipo", transferTypeLabel(details)], ["Técnico", details.Technician?.name], [transferWarehouseLabel(details), isToolTransfer(details) ? (details.fromTechnician?.name || '-') : (details.Warehouse?.name || details.warehouseId || '-')], ["Status", details.status], ["Entregue em", details.deliveredAt], ["Assinada em", details.signedAt], ["Qtd. total", formatQuantity(details.totalQuantity)], ["Valor total", brl(details.totalValue)], ["Responsável", details.signatureResponsible], ["Anexos", transferAttachmentSummary(details)], ["Observações", details.notes]]} />{getTransferAttachments(details).map((attachment, index) => <AttachmentPreview key={`${attachment.name}-${index}`} name={attachment.name} data={attachment.data} loadData={async () => { const response = await api.get(`/transfers/${details.id}/attachments/${index}`); return response.data?.data?.data || ''; }} label={`Anexo ${index + 1} da guia`} />)}<DetailList title="Itens transferidos" items={details.TransferItems || []} render={(item) => <><b>{item.TechnicianTool?.name || item.itemDescription || item.Material?.name || 'Item'}</b><span>Qtd. {formatQuantity(item.quantity)} • {item.serialNumber || 'sem serial'} • {brl(item.totalCost)}</span></>} /></>}
      </DetailsModal>
    </div>
  );
}
