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

function transferTypeLabel(transfer) {
  return isReturnTransfer(transfer) ? 'Retorno técnico → estoque' : 'Entrega estoque → técnico';
}

function transferWarehouseLabel(transfer) {
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

  function showNotice(text, type = 'danger') {
    setNotice({ text, type });
  }

  async function load() {
    try {
      const [t, tec, wh, requests] = await Promise.all([
        api.get('/transfers'),
        api.get('/technicians'),
        api.get('/warehouses').catch(() => ({ data: { data: [] } })),
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

  async function sign(id, file) {
    if (!file) return;
    const reader = new FileReader();
    reader.onload = async () => {
      try {
        const response = await api.post(`/transfers/${id}/sign`, { attachmentName: file.name, attachmentData: reader.result, signatureResponsible: 'Anexo recebido' });
        showNotice(response.data?.message || 'Assinatura registrada com sucesso.', 'success');
        await load();
      } catch (error) {
        showNotice(error.response?.data?.message || error.message || 'Não foi possível registrar a assinatura.');
      }
    };
    reader.readAsDataURL(file);
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
      if (transferTypeFilter === 'entrega' && isReturn) return false;
      if (transferTypeFilter === 'retorno' && !isReturn) return false;
      if (transferStatusFilter && transfer.status !== transferStatusFilter) return false;
      if (!search) return true;
      const text = [
        transfer.transferNumber,
        transfer.Technician?.name,
        transfer.Warehouse?.name,
        transfer.status,
        transfer.notes,
        ...(transfer.TransferItems || []).flatMap((item) => [item.Material?.name, item.serialNumber]),
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

  return (
    <div className="page-grid transfer-page">
      <FloatingAlert message={notice.text} type={notice.type} onClose={() => setNotice({ text: '', type: 'danger' })} />
      <div className="toolbar">
        <div><h2>🔁 Transferir material para técnico</h2><p>Selecione o estoque de origem, os materiais disponíveis nele e gere a guia para assinatura.</p></div>
        <button onClick={openNewTransfer}>➕ Nova transferência</button>
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
          <label>Tipo<select value={transferTypeFilter} onChange={(e) => setTransferTypeFilter(e.target.value)}><option value="">Todos</option><option value="entrega">Entrega para técnico</option><option value="retorno">Retorno para estoque</option></select></label>
          <label>Status<select value={transferStatusFilter} onChange={(e) => setTransferStatusFilter(e.target.value)}><option value="">Todos</option><option value="pendente_assinatura">Pendente de assinatura</option><option value="assinado">Assinado</option><option value="cancelado">Cancelado</option></select></label>
          <label className="filter-action"><span>&nbsp;</span><button type="button" className="ghost" onClick={() => { setTransferSearch(''); setTransferTypeFilter(''); setTransferStatusFilter(''); }}>Limpar filtros</button></label>
        </div>
      </section>

      <section className="panel"><div className="table-wrap"><table><thead><tr><th>Guia</th><th>Tipo</th><th>Técnico</th><th>Estoque</th><th>Data</th><th>Qtd</th><th>Valor</th><th>Status</th><th>Assinatura</th><th className="action-cell">Opções</th></tr></thead><tbody>{filteredTransfers.map((tr) => <tr key={tr.id}><td>{tr.transferNumber}</td><td><span className={`badge ${isReturnTransfer(tr) ? 'retorno_tecnico' : 'transferencia_tecnico'}`}>{transferTypeLabel(tr)}</span></td><td>{tr.Technician?.name}</td><td><small>{transferWarehouseLabel(tr)}</small><br />{tr.Warehouse?.name || '-'}</td><td>{dt(tr.deliveredAt)}</td><td>{formatQuantity(tr.totalQuantity)}</td><td>{brl(tr.totalValue)}</td><td><span className={`badge ${tr.status}`}>{tr.status}</span></td><td><div className="attachment-cell">{tr.attachmentName && <AttachmentPreview compact name={tr.attachmentName} data={tr.attachmentData} />}<input type="file" accept="image/*,.pdf" onChange={(e) => sign(tr.id, e.target.files?.[0])} /></div></td><td><div className="action-toolbar"><button className="info" onClick={() => setDetails(tr)}>🔎 Detalhes</button><Link className="ghost" to={`/transferencias/${tr.id}`}>🖨️ Guia</Link>{isAdmin && <button className="ghost" onClick={() => setEdit({ open: true, item: tr, form: { notes: tr.notes || '', status: tr.status || 'pendente_assinatura', deliveredAt: tr.deliveredAt ? String(tr.deliveredAt).slice(0, 16) : '', signatureResponsible: tr.signatureResponsible || '' } })}>✏️ Editar</button>}</div></td></tr>)}</tbody></table></div>{!filteredTransfers.length && <div className="empty-state">Nenhuma transferência encontrada com os filtros informados.</div>}</section>

      <Modal open={modal} title={form.materialRequestId ? '📦 Transferir itens da solicitação aprovada' : '📦 Nova transferência para técnico'} onClose={() => !saving && setModal(false)} footer={<><button className="ghost" disabled={saving} onClick={() => setModal(false)}>Cancelar</button><button disabled={saving} onClick={save}>{saving ? 'Processando...' : zeroStockRelease ? 'Liberar solicitação sem material' : form.materialRequestId ? 'Transferir material' : 'Gerar guia e enviar para caixa'}</button></>}>
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
            const serialAssets = allSerialAssets.filter((asset) => {
              const terms = parseSerialTerms(item.assetSearchApplied || '');
              if (!terms.length) return true;
              const text = assetSearchText(asset);
              return terms.some((term) => text.includes(normalizeSerialText(term)));
            });
            return (
              <div className="item-card transfer-item-card" key={i}>
                <div className="item-head"><strong>📦 Item {i + 1}</strong>{!requestLinked && <button className="ghost danger-outline" onClick={() => removeItem(i)}>Remover</button>}</div>
                <div className="form-grid">
                  <label>Material<select disabled={requestLinked} value={item.materialId} onChange={(e) => handleMaterialChange(i, e.target.value)}><option value="">Selecione o material</option>{material && !materialOptions.some((option) => Number(option.id) === Number(material.id)) && <option value={material.id}>{material.name}</option>}{materialOptions.map((m) => <option key={m.id} value={m.id}>{m.name} — disponível {qtyLabel(m.mainStock, m.unit)}</option>)}</select></label>
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

      <Modal open={edit.open} title={`✏️ Editar guia ${edit.item?.transferNumber || ''}`} onClose={() => setEdit({ open: false, item: null, form: {} })} footer={<><button className="ghost" onClick={() => setEdit({ open: false, item: null, form: {} })}>Cancelar</button><button onClick={saveEdit}>Salvar alteração</button></>}>
        <div className="form-grid"><label>Status<select value={edit.form.status || ''} onChange={(e) => setEdit({ ...edit, form: { ...edit.form, status: e.target.value } })}><option value="pendente_assinatura">Pendente de assinatura</option><option value="assinado">Assinado</option><option value="cancelado">Cancelado</option></select></label><label>Data de entrega<input type="datetime-local" value={edit.form.deliveredAt || ''} onChange={(e) => setEdit({ ...edit, form: { ...edit.form, deliveredAt: e.target.value } })} /></label><label>Responsável pela assinatura<input value={edit.form.signatureResponsible || ''} onChange={(e) => setEdit({ ...edit, form: { ...edit.form, signatureResponsible: e.target.value } })} /></label></div><label>Observações<textarea rows="4" value={edit.form.notes || ''} onChange={(e) => setEdit({ ...edit, form: { ...edit.form, notes: e.target.value } })} /></label><div className="viz-callout">🛡️ Alterações administrativas gravam histórico de auditoria.</div>
      </Modal>

      <DetailsModal open={!!details} title={`🔎 Detalhes da guia ${details?.transferNumber || ''}`} onClose={() => setDetails(null)} footer={<><button className="ghost" onClick={() => setDetails(null)}>Fechar</button>{details && <Link className="ghost" to={`/transferencias/${details.id}`}>Abrir guia</Link>}{isAdmin && details && <button onClick={() => { setEdit({ open: true, item: details, form: { notes: details.notes || '', status: details.status || 'pendente_assinatura', deliveredAt: details.deliveredAt ? String(details.deliveredAt).slice(0, 16) : '', signatureResponsible: details.signatureResponsible || '' } }); setDetails(null); }}>Editar</button>}</>}>
        {details && <><DetailGrid fields={[["Guia", details.transferNumber], ["Tipo", transferTypeLabel(details)], ["Técnico", details.Technician?.name], [transferWarehouseLabel(details), details.Warehouse?.name || details.warehouseId || '-'], ["Status", details.status], ["Entregue em", details.deliveredAt], ["Assinada em", details.signedAt], ["Qtd. total", formatQuantity(details.totalQuantity)], ["Valor total", brl(details.totalValue)], ["Responsável", details.signatureResponsible], ["Anexo", details.attachmentName || 'Sem anexo'], ["Observações", details.notes]]} />{details.attachmentName && <AttachmentPreview name={details.attachmentName} data={details.attachmentData} label="Anexo da guia" />}<DetailList title="Itens transferidos" items={details.TransferItems || []} render={(item) => <><b>{item.Material?.name || 'Material'}</b><span>Qtd. {formatQuantity(item.quantity)} • {item.serialNumber || 'sem serial'} • {brl(item.totalCost)}</span></>} /></>}
      </DetailsModal>
    </div>
  );
}
