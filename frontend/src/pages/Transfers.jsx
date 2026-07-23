import { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import api from '../services/api';
import Modal from '../components/Modal';
import DetailsModal, { DetailGrid, DetailList } from '../components/DetailsModal';
import AttachmentPreview from '../components/AttachmentPreview';
import { useAuth } from '../contexts/AuthContext';
import { formatQuantity, formatQuantityInput, formatQuantityWithUnit } from '../utils/formatQuantity';

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
  const [transfers, setTransfers] = useState([]);
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

  async function load() {
    const [t, tec, wh] = await Promise.all([
      api.get('/transfers'),
      api.get('/technicians'),
      api.get('/warehouses').catch(() => ({ data: { data: [] } })),
    ]);
    setTransfers(t.data.data || []);
    setTechnicians(tec.data.data || []);
    setWarehouses(wh.data.data || []);
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
      setWarehouseMaterials((overview.data.data || []).filter((material) => Number(material.mainStock || 0) > 0));
      setAvailableAssets(assets.data.data || []);
    } finally {
      setLoadingStock(false);
    }
  }

  useEffect(() => { load(); }, []);

  useEffect(() => {
    const requestId = new URLSearchParams(window.location.search).get('requestId');
    if (!requestId || requestPrefilled || !warehouses.length || !technicians.length) return;
    async function prefillFromRequest() {
      try {
        const { data } = await api.get(`/material-requests/${requestId}`);
        const request = data.data;
        if (!request || request.status !== 'aprovado' || request.requestType === 'recarga_estoque') return;
        const warehouseId = request.warehouseId || request.Technician?.defaultWarehouseId || warehouses[0]?.id || '';
        setForm({
          warehouseId: warehouseId ? String(warehouseId) : '',
          technicianId: request.technicianId ? String(request.technicianId) : '',
          materialRequestId: request.id,
          notes: `Entrega pela solicitação ${request.requestNumber}.`,
          items: (request.MaterialRequestItems || []).map((item) => ({
            materialId: item.materialId ? String(item.materialId) : '',
            quantity: item.approvedQuantity || item.quantity || 1,
            serialNumbers: [],
          })),
        });
        setAssetSearch('');
        setModal(true);
        setRequestPrefilled(true);
      } catch (error) {
        window.alert(error.response?.data?.message || 'Não foi possível carregar a solicitação aprovada.');
        setRequestPrefilled(true);
      }
    }
    prefillFromRequest();
  }, [warehouses, technicians, requestPrefilled]);

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

  const selectedTechnician = technicians.find((t) => String(t.id) === String(form.technicianId));
  const selectedWarehouse = warehouses.find((w) => String(w.id) === String(form.warehouseId));

  function openNewTransfer() {
    const firstActive = warehouses.find((warehouse) => warehouse.status === 'ativo') || warehouses[0];
    setForm({ warehouseId: firstActive ? String(firstActive.id) : '', technicianId: '', notes: '', materialRequestId: '', items: [] });
    setAssetSearch('');
    setModal(true);
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
      bulkSerialSearch: '',
    });
  }

  function addItem() {
    if (!form.warehouseId) {
      window.alert('Selecione primeiro o estoque de origem.');
      return;
    }
    if (!materialOptions.length) {
      window.alert('Este estoque não possui materiais disponíveis para transferência.');
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
    if (selected.has(serialNumber)) selected.delete(serialNumber);
    else selected.add(serialNumber);
    updateItem(i, { serialNumbers: Array.from(selected) });
  }


  function selectSerialsForItem(i, serials) {
    const selected = uniqueSerials([...(form.items[i]?.serialNumbers || []), ...serials]);
    updateItem(i, { serialNumbers: selected, quantity: selected.length || 1 });
  }

  function replaceSerialsForItem(i, serials) {
    const selected = uniqueSerials(serials);
    updateItem(i, { serialNumbers: selected, quantity: selected.length || 1 });
  }

  function selectQuantityForItem(i, assets) {
    const item = form.items[i];
    const desired = Math.trunc(toQuantityNumber(item.quantity));
    if (desired <= 0) {
      window.alert('Informe uma quantidade válida para selecionar os seriais.');
      return;
    }
    if (desired > assets.length) {
      window.alert(`Quantidade maior que os seriais disponíveis. Disponível: ${assets.length}.`);
      return;
    }
    replaceSerialsForItem(i, assets.slice(0, desired).map((asset) => asset.serialNumber));
  }

  function selectBulkSearchedSerials(i, allAssets) {
    const item = form.items[i];
    const terms = parseSerialTerms(item.bulkSerialSearch || '');
    if (!terms.length) {
      window.alert('Digite ou cole um ou mais seriais para pesquisar. Separe por linha, vírgula, ponto e vírgula ou espaço.');
      return;
    }
    const matched = [];
    const notFound = [];
    for (const term of terms) {
      const q = normalizeSerialText(term);
      const asset = allAssets.find((candidate) => {
        const serial = normalizeSerialText(candidate.serialNumber);
        const mac = normalizeSerialText(candidate.mac);
        return serial === q || mac === q || serial.includes(q) || mac.includes(q);
      });
      if (asset) matched.push(asset.serialNumber);
      else notFound.push(term);
    }
    if (!matched.length) {
      window.alert('Nenhuma ONU/serial pesquisado foi encontrado no estoque selecionado.');
      return;
    }
    selectSerialsForItem(i, matched);
    if (notFound.length) window.alert(`Selecionado(s) ${uniqueSerials(matched).length} serial(is). Não encontrado(s): ${notFound.join(', ')}`);
  }

  function validateBeforeSave() {
    if (!form.warehouseId) return 'Selecione o estoque de origem.';
    if (!form.technicianId) return 'Selecione o técnico de destino.';
    if (!form.items.length) return 'Adicione pelo menos um item à transferência.';

    for (const item of form.items) {
      const material = materialOptions.find((m) => Number(m.id) === Number(item.materialId));
      if (!material) return 'Existe item selecionado que não está disponível no estoque de origem.';
      if (material.requiresSerial) {
        const quantity = Math.trunc(toQuantityNumber(item.quantity));
        const serialCount = Array.isArray(item.serialNumbers) ? item.serialNumbers.length : 0;
        const available = availableQuantityForMaterial(material, stockByMaterial[item.materialId] || []);
        if (quantity <= 0) return `Informe a quantidade que deseja transferir de ${material.name}.`;
        if (quantity > available) return `Quantidade acima do que consta em estoque para ${material.name}. Disponível neste estoque: ${qtyLabel(available, material.unit)}.`;
        if (serialCount !== quantity) return `Para ${material.name}, selecione exatamente ${formatQuantity(quantity)} serial(is). Selecionado(s): ${formatQuantity(serialCount)}.`;
      } else {
        const quantity = toQuantityNumber(item.quantity);
        const available = availableQuantityForMaterial(material, []);
        if (quantity <= 0) return `Informe uma quantidade válida para ${material.name}.`;
        if (quantity > available) return `Quantidade acima do que consta em estoque para ${material.name}. Disponível neste estoque: ${qtyLabel(available, material.unit)}.`;
      }
    }
    return null;
  }

  async function save() {
    const error = validateBeforeSave();
    if (error) {
      window.alert(error);
      return;
    }
    const payload = {
      ...form,
      warehouseId: form.warehouseId,
      items: form.items.map((it) => ({
        ...it,
        quantity: toQuantityNumber(it.quantity),
        serialNumbers: Array.isArray(it.serialNumbers) ? it.serialNumbers : [],
      })),
    };
    await api.post('/transfers', payload);
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
    load();
  }

  async function saveEdit() {
    await api.put(`/transfers/${edit.item.id}`, edit.form);
    setEdit({ open: false, item: null, form: {} });
    load();
  }

  async function sign(id, file) {
    if (!file) return;
    const reader = new FileReader();
    reader.onload = async () => {
      await api.post(`/transfers/${id}/sign`, { attachmentName: file.name, attachmentData: reader.result, signatureResponsible: 'Anexo recebido' });
      load();
    };
    reader.readAsDataURL(file);
  }

  const totalPreview = form.items.reduce((sum, item) => {
    const material = materialOptions.find((m) => Number(m.id) === Number(item.materialId));
    if (!material) return sum;
    if (material.requiresSerial) return sum + (item.serialNumbers || []).reduce((s, serial) => s + Number(availableAssets.find((a) => a.serialNumber === serial)?.acquisitionCost || material.unitCost || 0), 0);
    return sum + toQuantityNumber(item.quantity) * Number(material.unitCost || 0);
  }, 0);

  return (
    <div className="page-grid transfer-page">
      <div className="toolbar">
        <div><h2>🔁 Transferir material para técnico</h2><p>Selecione o estoque de origem, os materiais disponíveis nele e gere a guia para assinatura.</p></div>
        <button onClick={openNewTransfer}>➕ Nova transferência</button>
      </div>

      <section className="panel"><div className="table-wrap"><table><thead><tr><th>Guia</th><th>Tipo</th><th>Técnico</th><th>Estoque</th><th>Data</th><th>Qtd</th><th>Valor</th><th>Status</th><th>Assinatura</th><th className="action-cell">Opções</th></tr></thead><tbody>{transfers.map((tr) => <tr key={tr.id}><td>{tr.transferNumber}</td><td><span className={`badge ${isReturnTransfer(tr) ? 'retorno_tecnico' : 'transferencia_tecnico'}`}>{transferTypeLabel(tr)}</span></td><td>{tr.Technician?.name}</td><td><small>{transferWarehouseLabel(tr)}</small><br />{tr.Warehouse?.name || '-'}</td><td>{dt(tr.deliveredAt)}</td><td>{formatQuantity(tr.totalQuantity)}</td><td>{brl(tr.totalValue)}</td><td><span className={`badge ${tr.status}`}>{tr.status}</span></td><td><div className="attachment-cell">{tr.attachmentName && <AttachmentPreview compact name={tr.attachmentName} data={tr.attachmentData} />}<input type="file" accept="image/*,.pdf" onChange={(e) => sign(tr.id, e.target.files?.[0])} /></div></td><td><div className="action-toolbar"><button className="info" onClick={() => setDetails(tr)}>🔎 Detalhes</button><Link className="ghost" to={`/transferencias/${tr.id}`}>🖨️ Guia</Link>{isAdmin && <button className="ghost" onClick={() => setEdit({ open: true, item: tr, form: { notes: tr.notes || '', status: tr.status || 'pendente_assinatura', deliveredAt: tr.deliveredAt ? String(tr.deliveredAt).slice(0, 16) : '', signatureResponsible: tr.signatureResponsible || '' } })}>✏️ Editar</button>}</div></td></tr>)}</tbody></table></div></section>

      <Modal open={modal} title={form.materialRequestId ? '📦 Entregar carga solicitada ao técnico' : '📦 Nova transferência para técnico'} onClose={() => setModal(false)} footer={<><button className="ghost" onClick={() => setModal(false)}>Cancelar</button><button onClick={save}>Gerar guia e enviar para caixa</button></>}>
        <div className="transfer-wizard">
          <section className="transfer-summary-card">
            <div><small>Estoque de origem</small><strong>{selectedWarehouse?.name || 'Selecione um estoque'}</strong><span>{selectedWarehouse ? `${selectedWarehouse.city || '-'} • ${selectedWarehouse.code || 'sem código'}` : 'Materiais serão filtrados pelo estoque'}</span></div>
            <div><small>Técnico selecionado</small><strong>{selectedTechnician?.name || 'Selecione um técnico'}</strong><span>{selectedTechnician?.ContractorCompany?.name || 'Carga individual'}</span></div>
            <div><small>Itens na guia</small><strong>{form.items.length}</strong><span>{formatQuantity(form.items.reduce((s, i) => s + toQuantityNumber(i.quantity || (i.serialNumbers || []).length || 0), 0))} unidade(s)</span></div>
            <div><small>Valor previsto</small><strong>{brl(totalPreview)}</strong><span>Equipamentos + consumíveis</span></div>
          </section>
          <div className="form-grid">
            <label>🏬 Estoque de origem<select value={form.warehouseId} onChange={(e) => { setForm({ ...form, warehouseId: e.target.value, items: [] }); setAssetSearch(''); }}><option value="">Selecione</option>{warehouses.map((warehouse) => <option key={warehouse.id} value={warehouse.id}>{warehouse.name} — {warehouse.city || '-'} — {warehouse.code}</option>)}</select></label>
            <label>👷 Técnico<select value={form.technicianId} onChange={(e) => setForm({ ...form, technicianId: e.target.value })}><option value="">Selecione</option>{technicians.map((t) => <option key={t.id} value={t.id}>{t.name} — {t.ContractorCompany?.name || 'sem empresa'}</option>)}</select></label>
            <label className="span-2">📝 Observações<input value={form.notes} onChange={(e) => setForm({ ...form, notes: e.target.value })} placeholder="Motivo, rota, lote, responsável..." /></label>
          </div>
          {form.warehouseId && <div className="viz-callout">Apenas materiais com saldo no estoque selecionado aparecem abaixo. A transferência fica registrada no histórico, BI e auditoria.</div>}
          {loadingStock && <div className="empty-state">Carregando materiais do estoque selecionado...</div>}
          <div className="subtoolbar"><h4>Itens da guia</h4><button className="ghost" onClick={addItem}>➕ Adicionar item</button></div>
          {!loadingStock && form.warehouseId && materialOptions.length === 0 && <div className="empty-state">Este estoque não possui saldo disponível para transferência.</div>}
          {form.items.length === 0 && <div className="empty-state">Clique em “Adicionar item” para montar a carga do técnico.</div>}
          {form.items.map((item, i) => {
            const material = materialOptions.find((m) => Number(m.id) === Number(item.materialId));
            const allSerialAssets = stockByMaterial[item.materialId] || [];
            const serialAssets = allSerialAssets.filter((asset) => {
              const q = String(item.assetSearch || '').trim().toLowerCase();
              if (!q) return true;
              return assetSearchText(asset).includes(q);
            });
            return (
              <div className="item-card transfer-item-card" key={i}>
                <div className="item-head"><strong>📦 Item {i + 1}</strong><button className="ghost danger-outline" onClick={() => removeItem(i)}>Remover</button></div>
                <div className="form-grid">
                  <label>Material<select value={item.materialId} onChange={(e) => handleMaterialChange(i, e.target.value)}><option value="">Selecione o material</option>{materialOptions.map((m) => <option key={m.id} value={m.id}>{m.name} — disponível {qtyLabel(m.mainStock, m.unit)}</option>)}</select></label>
                  <label>Quantidade a transferir<input type="number" min="1" max={material ? availableQuantityForMaterial(material, allSerialAssets) || undefined : undefined} step={material?.requiresSerial ? '1' : '1'} value={item.quantity ?? ''} disabled={!material} onChange={(e) => updateItem(i, { quantity: e.target.value })} placeholder={material ? 'Ex.: 30, 40, 50' : 'Selecione o material primeiro'} />
                    {(() => {
                      if (!material) return <small>Escolha o material e informe a quantidade que será transferida.</small>;
                      const available = availableQuantityForMaterial(material, allSerialAssets);
                      const requested = toQuantityNumber(item.quantity);
                      const exceeds = requested > available;
                      return (
                        <>
                          <small className={exceeds ? 'field-warning' : ''}>Disponível neste estoque: {qtyLabel(available, material?.unit)}</small>
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
                      <div className="serial-actions-row">
                        <input value={item.assetSearch || ''} onChange={(e) => updateItem(i, { assetSearch: e.target.value })} placeholder="Buscar serial, MAC, marca..." />
                        <button type="button" className="ghost" onClick={() => replaceSerialsForItem(i, serialAssets.map((asset) => asset.serialNumber))}>Selecionar tudo filtrado</button>
                        <button type="button" className="ghost" onClick={() => replaceSerialsForItem(i, [])}>Limpar seleção</button>
                      </div>
                    </div>
                    <div className="bulk-serial-search-card">
                      <label>
                        <span>Pesquisar várias ONUs/seriais de uma vez</span>
                        <textarea rows="3" value={item.bulkSerialSearch || ''} onChange={(e) => updateItem(i, { bulkSerialSearch: e.target.value })} placeholder="Cole aqui vários seriais, um por linha ou separados por vírgula. Ex.: 102003, 102002, 102001" />
                      </label>
                      <div className="row-actions">
                        <button type="button" onClick={() => selectBulkSearchedSerials(i, allSerialAssets)}>Selecionar ONUs pesquisadas</button>
                        <button type="button" className="ghost" onClick={() => updateItem(i, { bulkSerialSearch: '' })}>Limpar pesquisa</button>
                      </div>
                      <small>O sistema seleciona somente seriais disponíveis no estoque de origem e evita duplicar o mesmo serial na guia.</small>
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
