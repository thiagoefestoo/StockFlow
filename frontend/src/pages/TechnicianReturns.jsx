/* eslint-disable react-hooks/exhaustive-deps */
import { useEffect, useMemo, useState } from 'react';
import api from '../services/api';
import KpiCard from '../components/KpiCard';
import Pagination from '../components/Pagination';
import DetailsModal, { DetailGrid } from '../components/DetailsModal';
import OperationReviewModal from '../components/OperationReviewModal';
import { duplicateItemIds, duplicateSerials, optionsWithoutSelected, selectedSerialsExcept } from '../utils/operationSelections';
import { formatQuantity, formatQuantityLabel } from '../utils/formatQuantity';
import { RETURN_REASON_OPTIONS, RETURN_REFERENCE_OPTIONS } from '../constants/operationOptions';

function brl(value) { return Number(value || 0).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' }); }
function qtyLabel(value, unit = '') { return formatQuantityLabel(value, unit); }
function splitSerials(value) { return String(value || '').split(/\n|,|;/).map((s) => s.trim()).filter(Boolean); }
function parseSerialTerms(value) { return String(value || '').split(/[\n,;\t ]+/).map((item) => item.trim()).filter(Boolean); }
function normalizeSerialText(value) { return String(value || '').trim().toLowerCase(); }
function assetSearchText(asset) { return [asset.serialNumber, asset.mac, asset.brand, asset.model, asset.Material?.name].filter(Boolean).join(' ').toLowerCase(); }
function unique(values = []) { return Array.from(new Set(values.map((v) => String(v || '').trim()).filter(Boolean))); }
function quantityNumber(value) { const parsed = Number(String(value ?? '').replace(',', '.')); return Number.isFinite(parsed) ? parsed : 0; }

function dt(value) { return value ? new Date(value).toLocaleString('pt-BR') : '-'; }
function returnItems(row) { return Array.isArray(row?.TransferItems) ? row.TransferItems : []; }
function effectiveReturnStatus(row) {
  if (row?.status === 'cancelado') return 'cancelado';
  return row?.attachmentName ? 'assinado' : 'pendente_assinatura';
}
function returnStatusLabel(status) {
  const labels = { pendente_assinatura: 'Pendente de assinatura', assinado: 'Assinado', cancelado: 'Cancelado' };
  return labels[status] || status || '-';
}
function returnItemSummary(row) {
  const items = returnItems(row);
  if (!items.length) return '-';
  const labels = items.slice(0, 2).map((item) => item.Material?.name || item.itemDescription || 'Material');
  return labels.join(', ') + (items.length > 2 ? ` +${items.length - 2}` : '');
}

const emptyForm = { warehouseId: '', reference: '', notes: '', items: [] };

export default function TechnicianReturns() {
  const [technicians, setTechnicians] = useState([]);
  const [warehouses, setWarehouses] = useState([]);
  const [selectedTech, setSelectedTech] = useState('');
  const [box, setBox] = useState(null);
  const [form, setForm] = useState(emptyForm);
  const [message, setMessage] = useState('');
  const [loading, setLoading] = useState(false);
  const [reviewOpen, setReviewOpen] = useState(false);
  const [historyRows, setHistoryRows] = useState([]);
  const [historySearch, setHistorySearch] = useState('');
  const [historyTechnicianId, setHistoryTechnicianId] = useState('');
  const [historyWarehouseId, setHistoryWarehouseId] = useState('');
  const [historyStatus, setHistoryStatus] = useState('');
  const [historyPage, setHistoryPage] = useState(1);
  const [historyPagination, setHistoryPagination] = useState({ page: 1, pageSize: 15, total: 0, totalPages: 1 });
  const [historyLoading, setHistoryLoading] = useState(false);
  const [historyMessage, setHistoryMessage] = useState('');
  const [historyDetails, setHistoryDetails] = useState(null);

  async function loadInitial() {
    const [techRes, whRes] = await Promise.all([
      api.get('/technicians'),
      api.get('/warehouses?operationalOnly=true').catch(() => ({ data: { data: [] } })),
    ]);
    const techList = techRes.data.data || [];
    const whList = whRes.data.data || [];
    setTechnicians(techList);
    setWarehouses(whList);
    if (!selectedTech && techList[0]) setSelectedTech(String(techList[0].id));
    if (!form.warehouseId && whList[0]) setForm((current) => ({ ...current, warehouseId: String(whList[0].id) }));
  }

  async function loadBox(id = selectedTech) {
    if (!id) { setBox(null); return; }
    const res = await api.get(`/stock/technician-box/${id}?_=${Date.now()}`);
    setBox(res.data.data);
  }

  async function loadHistory(targetPage = historyPage) {
    setHistoryLoading(true);
    try {
      setHistoryMessage('');
      const params = { page: targetPage, pageSize: 15 };
      if (historySearch.trim()) params.search = historySearch.trim();
      if (historyTechnicianId) params.technicianId = historyTechnicianId;
      if (historyWarehouseId) params.warehouseId = historyWarehouseId;
      if (historyStatus) params.status = historyStatus;
      const response = await api.get('/stock/technician-box/returns-history', { params });
      setHistoryRows(response.data.data || []);
      setHistoryPagination(response.data.pagination || { page: targetPage, pageSize: 15, total: response.data.data?.length || 0, totalPages: 1 });
      setHistoryPage(targetPage);
    } catch (error) {
      setHistoryMessage(error.response?.data?.message || 'Erro ao carregar o histórico de retornos.');
    } finally {
      setHistoryLoading(false);
    }
  }

  useEffect(() => { loadInitial(); loadHistory(1); }, []);
  useEffect(() => { if (selectedTech) loadBox(selectedTech); }, [selectedTech]);

  const materialsInBox = useMemo(() => {
    const map = new Map();
    for (const asset of box?.assets || []) if (asset.Material) map.set(asset.materialId, { ...asset.Material, availableQty: (map.get(asset.materialId)?.availableQty || 0) + 1 });
    for (const balance of box?.balances || []) if (balance.Material && Number(balance.quantity || 0) > 0) map.set(balance.materialId, { ...balance.Material, availableQty: Number(balance.quantity || 0) });
    return Array.from(map.values()).sort((a, b) => String(a.name).localeCompare(String(b.name)));
  }, [box]);

  function assetsByMaterial(materialId, search = '') {
    const terms = parseSerialTerms(search);
    return (box?.assets || [])
      .filter((asset) => Number(asset.materialId) === Number(materialId))
      .filter((asset) => {
        if (!terms.length) return true;
        const text = assetSearchText(asset);
        return terms.some((term) => text.includes(normalizeSerialText(term)));
      });
  }

  function balanceFor(materialId) {
    return (box?.balances || []).find((row) => Number(row.materialId) === Number(materialId));
  }

  function addItem() {
    if (!selectedTech) { setMessage('Selecione o técnico.'); return; }
    if (!materialsInBox.length) { setMessage('Este técnico não possui material na caixa.'); return; }
    setMessage('');
    setForm({ ...form, items: [...form.items, { materialId: '', quantity: '', serialNumbers: [], assetSearch: '', assetSearchApplied: '' }] });
  }

  function updateItem(index, patch) {
    const items = [...form.items];
    items[index] = { ...items[index], ...patch };
    setForm({ ...form, items });
  }

  function removeItem(index) {
    setForm({ ...form, items: form.items.filter((_, i) => i !== index) });
  }

  function toggleSerial(index, serialNumber) {
    const item = form.items[index];
    const selected = new Set(item.serialNumbers || []);
    if (selected.has(serialNumber)) selected.delete(serialNumber);
    else selected.add(serialNumber);
    const next = Array.from(selected);
    updateItem(index, { serialNumbers: next, quantity: next.length });
  }

  function selectVisibleSerials(index, assets) {
    const current = form.items[index]?.serialNumbers || [];
    const next = unique([...current, ...assets.map((asset) => asset.serialNumber)]);
    updateItem(index, { serialNumbers: next, quantity: next.length });
  }

  function replaceSerialsForItem(index, serials) {
    const next = unique(serials);
    updateItem(index, { serialNumbers: next, quantity: next.length });
  }

  function validate() {
    if (!selectedTech) return 'Selecione o técnico.';
    if (!form.warehouseId) return 'Selecione o estoque de destino.';
    if (!form.items.length) return 'Adicione ao menos um item para retornar ao estoque.';
    const repeatedMaterials = duplicateItemIds(form.items);
    if (repeatedMaterials.length) return 'O mesmo material não pode ser selecionado mais de uma vez no retorno.';
    const repeatedSerials = duplicateSerials(form.items);
    if (repeatedSerials.length) return `O mesmo serial não pode ser selecionado mais de uma vez: ${repeatedSerials.join(', ')}.`;
    for (const item of form.items) {
      const material = materialsInBox.find((m) => Number(m.id) === Number(item.materialId));
      if (!material) return 'Selecione o material em todos os itens adicionados.';
      if (material.requiresSerial) {
        if ((!Array.isArray(item.serialNumbers) || item.serialNumbers.length === 0) && quantityNumber(item.quantity) !== 0) return `Selecione pelo menos um serial de ${material.name} ou informe quantidade 0.`;
      } else {
        const quantity = quantityNumber(item.quantity);
        const available = Number(balanceFor(material.id)?.quantity || 0);
        if (quantity < 0) return `A quantidade de ${material.name} não pode ser negativa.`;
        if (quantity > available) return `Saldo insuficiente para ${material.name}. Disponível: ${qtyLabel(available, material.unit)}.`;
      }
    }
    return null;
  }

  function openReview() {
    const error = validate();
    if (error) { setMessage(`❌ ${error}`); return; }
    setReviewOpen(true);
  }

  async function save() {
    const error = validate();
    if (error) { setMessage(`❌ ${error}`); return; }
    setLoading(true);
    try {
      const response = await api.post('/stock/technician-box/return-to-stock', {
        technicianId: selectedTech,
        warehouseId: form.warehouseId,
        reference: form.reference,
        notes: form.notes,
        items: form.items.map((item) => ({
          materialId: item.materialId,
          quantity: quantityNumber(item.quantity),
          serialNumbers: Array.isArray(item.serialNumbers) ? item.serialNumbers : [],
        })),
      });
      const transfer = response.data?.data;
      setMessage(`✅ Material retornado para o estoque e guia ${transfer?.transferNumber || transfer?.reference || ''} gerada em Transferências para anexar documento.`);
      setReviewOpen(false);
      setForm({ ...emptyForm, warehouseId: form.warehouseId });
      await Promise.all([loadBox(selectedTech), loadHistory(1)]);
    } catch (error) {
      setMessage(`❌ ${error.response?.data?.message || error.message || 'Erro ao retornar material.'}`);
    } finally {
      setLoading(false);
    }
  }

  const selectedTechnician = technicians.find((tech) => String(tech.id) === String(selectedTech));
  const selectedWarehouse = warehouses.find((warehouse) => String(warehouse.id) === String(form.warehouseId));
  const totalQty = form.items.reduce((sum, item) => sum + quantityNumber(item.quantity || (item.serialNumbers || []).length || 0), 0);
  const reviewItems = form.items.map((item, index) => {
    const material = materialsInBox.find((row) => Number(row.id) === Number(item.materialId));
    const serials = Array.isArray(item.serialNumbers) ? item.serialNumbers : [];
    const quantity = material?.requiresSerial ? serials.length : quantityNumber(item.quantity);
    const totalValue = material?.requiresSerial
      ? serials.reduce((sum, serial) => sum + Number((box?.assets || []).find((asset) => asset.serialNumber === serial)?.acquisitionCost || material?.unitCost || 0), 0)
      : quantity * Number(material?.unitCost || 0);
    return {
      key: `${item.materialId || 'empty'}-${index}`,
      name: material?.name || `Item ${index + 1}`,
      detail: material?.requiresSerial ? 'Equipamento serializado' : 'Material controlado por quantidade',
      quantity,
      unit: material?.unit || 'un',
      serialCount: serials.length,
      serialPreview: serials.slice(0, 5).join(', ') + (serials.length > 5 ? ` +${serials.length - 5}` : ''),
      totalValue,
    };
  });
  const reviewValue = reviewItems.reduce((sum, item) => sum + Number(item.totalValue || 0), 0);
  const historyStats = useMemo(() => ({
    quantity: historyRows.reduce((sum, row) => sum + Number(row.totalQuantity || 0), 0),
    value: historyRows.reduce((sum, row) => sum + Number(row.totalValue || 0), 0),
    pending: historyRows.filter((row) => effectiveReturnStatus(row) === 'pendente_assinatura').length,
  }), [historyRows]);

  return (
    <div className="page-grid technician-return-page">
      <div className="toolbar">
        <div><h2>↩️ Retorno da caixa do técnico para estoque</h2><p>Retire material da responsabilidade do técnico, escolha o estoque de destino e gere uma guia em Transferências para anexar documento/assinatura.</p></div>
        <button className="ghost" onClick={() => Promise.all([loadBox(selectedTech), loadHistory(historyPage)])}>🔄 Atualizar</button>
      </div>

      {message && <div className={`alert ${message.startsWith('❌') ? 'danger' : 'success'}`}>{message}</div>}

      <section className="kpi-grid small">
        <KpiCard label="Técnico" value={selectedTechnician?.name || '-'} />
        <KpiCard label="Itens na caixa" value={formatQuantity(box?.summary?.totalQuantity || 0)} />
        <KpiCard label="Valor em custódia" value={brl(box?.summary?.totalValue)} tone="warning" />
        <KpiCard label="Qtd. selecionada" value={formatQuantity(totalQty)} tone="success" />
      </section>

      <section className="panel">
        <div className="form-grid">
          <label>👷 Técnico
            <select value={selectedTech} onChange={(e) => { setSelectedTech(e.target.value); setForm(emptyForm); setMessage(''); }}>
              <option value="">Selecione</option>
              {technicians.map((tech) => <option key={tech.id} value={tech.id}>{tech.name} — {tech.ContractorCompany?.name || 'sem empresa'}</option>)}
            </select>
          </label>
          <label>🏬 Estoque de destino
            <select value={form.warehouseId} onChange={(e) => setForm({ ...form, warehouseId: e.target.value })}>
              <option value="">Selecione</option>
              {warehouses.map((warehouse) => <option key={warehouse.id} value={warehouse.id}>{warehouse.name} — {warehouse.city || '-'} — {warehouse.code || 'sem código'}</option>)}
            </select>
          </label>
          <label>Referência
            <input list="return-reference-options" value={form.reference} onChange={(e) => setForm({ ...form, reference: e.target.value })} placeholder="Selecione ou digite uma referência" />
            <datalist id="return-reference-options">{RETURN_REFERENCE_OPTIONS.map((option) => <option key={option} value={option} />)}</datalist>
          </label>
          <label>Motivo/observação
            <input list="return-reason-options" value={form.notes} onChange={(e) => setForm({ ...form, notes: e.target.value })} placeholder="Selecione ou digite o motivo do retorno" />
            <datalist id="return-reason-options">{RETURN_REASON_OPTIONS.map((option) => <option key={option} value={option} />)}</datalist>
          </label>
        </div>
        <div className="viz-callout">O item sai da caixa do técnico e volta para o estoque selecionado. Estoques listados respeitam o acesso liberado ao usuário.</div>
      </section>

      <section className="panel">
        <div className="subtoolbar"><h3>Itens para retornar</h3><button type="button" className="ghost" onClick={addItem}>➕ Adicionar item</button></div>
        {form.items.length === 0 && <div className="empty-state">Clique em “Adicionar item” e escolha o material que será retirado da caixa do técnico.</div>}
        {form.items.map((item, index) => {
          const material = materialsInBox.find((m) => Number(m.id) === Number(item.materialId));
          const availableMaterials = optionsWithoutSelected(materialsInBox, form.items, index);
          const serialsSelectedElsewhere = selectedSerialsExcept(form.items, index);
          const allSerialAssets = assetsByMaterial(item.materialId);
          const visibleAssets = assetsByMaterial(item.materialId, item.assetSearchApplied)
            .filter((asset) => !serialsSelectedElsewhere.has(String(asset.serialNumber || '').toUpperCase()));
          return (
            <div className="item-card movement-item-card" key={index}>
              <div className="item-head"><strong>📦 Item {index + 1}</strong><button className="ghost danger-outline" onClick={() => removeItem(index)}>Remover</button></div>
              <div className="form-grid">
                <label>Material
                  <select value={item.materialId} onChange={(e) => updateItem(index, { materialId: e.target.value, quantity: '0', serialNumbers: [], assetSearch: '', assetSearchApplied: '' })}>
                    <option value="">Selecione o material</option>
                    {availableMaterials.map((mat) => <option key={mat.id} value={mat.id}>{mat.name} — disponível {qtyLabel(mat.availableQty, mat.unit)}</option>)}
                  </select>
                </label>
                {!material?.requiresSerial && <label>Quantidade
                  <input type="number" min="0" step="1" value={item.quantity} onChange={(e) => updateItem(index, { quantity: e.target.value })} placeholder="Ex.: 30, 40, 50" />
                  <small>Disponível na caixa: {qtyLabel(balanceFor(material?.id)?.quantity, material?.unit)}</small>
                  {quantityNumber(item.quantity) === 0 && <small>Quantidade 0 aceita: o item será registrado na conferência, sem movimentar saldo.</small>}
                </label>}
              </div>
              {material?.requiresSerial && (
                <div className="serial-picker compact-serial-picker">
                  <div className="serial-picker-head serial-picker-head-stacked">
                    <div><strong>🏷️ Seriais na caixa do técnico</strong><span>{visibleAssets.length} disponível(is) filtrado(s) • {allSerialAssets.length} na caixa • {item.serialNumbers?.length || 0} selecionado(s)</span></div>
                    <div className="serial-quick-filter">
                      <label>
                        <span>🔎 Pesquisar vários seriais ou MACs (cole a coluna do Excel — um por linha)</span>
                        <textarea
                          rows="4"
                          value={item.assetSearch || ''}
                          onChange={(e) => updateItem(index, { assetSearch: e.target.value })}
                          onKeyDown={(e) => { if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) updateItem(index, { assetSearchApplied: item.assetSearch || '' }); }}
                          placeholder={'Cole aqui a lista, uma por linha:\n485754430E7407B7\n485754430E8F05B7\n485754430E7973B7'}
                        />
                      </label>
                      <div className="row-actions">
                        <button type="button" onClick={() => updateItem(index, { assetSearchApplied: item.assetSearch || '' })}>🔍 Filtrar</button>
                        <button type="button" className="ghost" onClick={() => updateItem(index, { assetSearch: '', assetSearchApplied: '' })}>Limpar pesquisa</button>
                      </div>
                    </div>
                    <div className="serial-actions-row"><button type="button" className="ghost" onClick={() => selectVisibleSerials(index, visibleAssets)}>Selecionar tudo filtrado</button><button type="button" className="ghost" onClick={() => replaceSerialsForItem(index, [])}>Limpar seleção</button></div>
                  </div>
                  {(item.serialNumbers || []).length === 0 && <small>Sem serial selecionado, este item será registrado com quantidade 0 e não movimentará o estoque.</small>}
                  <div className="serial-grid">
                    {visibleAssets.map((asset) => {
                      const checked = (item.serialNumbers || []).includes(asset.serialNumber);
                      return <button type="button" key={asset.id} className={`serial-chip ${checked ? 'selected' : ''}`} onClick={() => toggleSerial(index, asset.serialNumber)}><b>{checked ? '✅' : '🏷️'} {asset.serialNumber}</b><span>{asset.Material?.name}</span><small>{asset.mac || 'sem MAC'} • {brl(asset.acquisitionCost || asset.Material?.unitCost)}</small></button>;
                    })}
                  </div>
                </div>
              )}
            </div>
          );
        })}
        <div className="submit-bar"><span>Destino: <strong>{selectedWarehouse?.name || 'não selecionado'}</strong></span><button disabled={loading} onClick={openReview}>↩️ Revisar retorno para estoque</button></div>
      </section>

      <section className="panel technician-return-history">
        <div className="subtoolbar">
          <div>
            <span className="eyebrow">🧾 Rastreabilidade</span>
            <h3>Histórico de retornos do técnico</h3>
            <p>Consulte os retornos já realizados, da operação mais recente para a mais antiga, sem sair desta página.</p>
          </div>
          <button type="button" className="ghost" onClick={() => loadHistory(historyPage)} disabled={historyLoading}>{historyLoading ? 'Atualizando...' : '🔄 Atualizar histórico'}</button>
        </div>

        {historyMessage && <div className="alert danger">{historyMessage}</div>}

        <div className="kpi-grid small">
          <KpiCard label="Retornos encontrados" value={historyPagination.total || 0} />
          <KpiCard label="Qtd. nesta página" value={formatQuantity(historyStats.quantity)} />
          <KpiCard label="Valor nesta página" value={brl(historyStats.value)} tone="success" />
          <KpiCard label="Pendentes de assinatura" value={historyStats.pending} tone={historyStats.pending ? 'warning' : 'success'} />
        </div>

        <div className="form-grid return-history-filters">
          <label>🔎 Pesquisar
            <input value={historySearch} onChange={(e) => setHistorySearch(e.target.value)} onKeyDown={(e) => { if (e.key === 'Enter') loadHistory(1); }} placeholder="Guia, referência ou observação" />
          </label>
          <label>👷 Técnico
            <select value={historyTechnicianId} onChange={(e) => setHistoryTechnicianId(e.target.value)}>
              <option value="">Todos</option>
              {technicians.map((tech) => <option key={tech.id} value={tech.id}>{tech.name}</option>)}
            </select>
          </label>
          <label>🏬 Estoque de destino
            <select value={historyWarehouseId} onChange={(e) => setHistoryWarehouseId(e.target.value)}>
              <option value="">Todos</option>
              {warehouses.map((warehouse) => <option key={warehouse.id} value={warehouse.id}>{warehouse.name} — {warehouse.city || '-'}</option>)}
            </select>
          </label>
          <label>Status da guia
            <select value={historyStatus} onChange={(e) => setHistoryStatus(e.target.value)}>
              <option value="">Todos</option>
              <option value="pendente_assinatura">Pendente de assinatura</option>
              <option value="assinado">Assinado</option>
              <option value="cancelado">Cancelado</option>
            </select>
          </label>
          <label className="filter-action"><span>&nbsp;</span><button type="button" onClick={() => loadHistory(1)} disabled={historyLoading}>{historyLoading ? 'Carregando...' : 'Aplicar filtros'}</button></label>
        </div>

        <div className="table-wrap">
          <table>
            <thead><tr><th>Data</th><th>Guia</th><th>Técnico</th><th>Destino</th><th>Materiais</th><th>Qtd.</th><th>Valor</th><th>Status</th><th>Assinatura</th><th>Operador</th><th className="action-cell">Opções</th></tr></thead>
            <tbody>
              {historyRows.map((row) => {
                const status = effectiveReturnStatus(row);
                return <tr key={row.id}>
                  <td>{dt(row.deliveredAt || row.createdAt)}</td>
                  <td><strong>{row.transferNumber || '-'}</strong></td>
                  <td>{row.Technician?.name || '-'}</td>
                  <td>{row.Warehouse?.name || '-'}<br /><small>{[row.Warehouse?.city, row.Warehouse?.state].filter(Boolean).join('/') || '-'}</small></td>
                  <td title={returnItems(row).map((item) => item.Material?.name || item.itemDescription || 'Material').join(', ')}>{returnItemSummary(row)}</td>
                  <td>{formatQuantity(row.totalQuantity || 0)}</td>
                  <td>{brl(row.totalValue)}</td>
                  <td><span className={`badge ${status}`}>{returnStatusLabel(status)}</span></td>
                  <td>{row.attachmentName ? <span className="badge success">Documento anexado</span> : <span className="badge pendente_assinatura">Sem documento</span>}</td>
                  <td>{row.createdBy?.name || 'Sistema'}</td>
                  <td><div className="action-toolbar"><button type="button" className="info" onClick={() => setHistoryDetails(row)}>🔎 Detalhes</button></div></td>
                </tr>;
              })}
            </tbody>
          </table>
        </div>
        {!historyLoading && historyRows.length === 0 && <div className="empty-state">Nenhum retorno encontrado com os filtros informados.</div>}
        <Pagination {...historyPagination} page={historyPage} loading={historyLoading} onPageChange={loadHistory} />
      </section>

      <OperationReviewModal
        open={reviewOpen}
        title="Revisar retorno do técnico para o estoque"
        description="Confira técnico, estoque de destino, itens, quantidades e seriais. O retorno só será executado depois da confirmação."
        metadata={[
          { label: 'Técnico de origem', value: selectedTechnician?.name },
          { label: 'Estoque de destino', value: selectedWarehouse?.name, hint: selectedWarehouse?.code || selectedWarehouse?.city },
          { label: 'Referência', value: form.reference || 'Gerada automaticamente' },
          { label: 'Motivo/observação', value: form.notes || 'Não informado' },
        ]}
        items={reviewItems}
        totalQuantity={totalQty}
        totalValue={reviewValue}
        warning="Itens com quantidade maior que 0 sairão da caixa e entrarão no estoque. Linhas com quantidade 0 serão registradas na guia sem movimentar saldo."
        loading={loading}
        confirmLabel="Confirmar retorno ao estoque"
        onCancel={() => setReviewOpen(false)}
        onConfirm={save}
      />

      <DetailsModal open={!!historyDetails} title="🔎 Detalhes do retorno técnico" onClose={() => setHistoryDetails(null)}>
        {historyDetails && <>
          <DetailGrid fields={[
            ['Data do retorno', dt(historyDetails.deliveredAt || historyDetails.createdAt)],
            ['Guia', historyDetails.transferNumber],
            ['Técnico de origem', historyDetails.Technician?.name],
            ['Estoque de destino', historyDetails.Warehouse?.name],
            ['Cidade de destino', [historyDetails.Warehouse?.city, historyDetails.Warehouse?.state].filter(Boolean).join('/')],
            ['Quantidade total', formatQuantity(historyDetails.totalQuantity || 0)],
            ['Valor total', brl(historyDetails.totalValue)],
            ['Status', returnStatusLabel(effectiveReturnStatus(historyDetails))],
            ['Documento', historyDetails.attachmentName || 'Não anexado'],
            ['Responsável pela assinatura', historyDetails.signatureResponsible],
            ['Operador', historyDetails.createdBy?.name || 'Sistema'],
            ['Observação', historyDetails.notes],
          ]} />
          <section className="detail-section">
            <h4>Materiais retornados</h4>
            <div className="table-wrap"><table><thead><tr><th>Material</th><th>Qtd.</th><th>Serial</th><th>Valor unitário</th><th>Total</th></tr></thead><tbody>{returnItems(historyDetails).map((item) => <tr key={item.id}><td>{item.Material?.name || item.itemDescription || '-'}</td><td>{formatQuantity(item.quantity || 0)}</td><td>{item.serialNumber || item.SerializedAsset?.serialNumber || '-'}</td><td>{brl(item.unitCost)}</td><td>{brl(item.totalCost)}</td></tr>)}</tbody></table></div>
            {!returnItems(historyDetails).length && <div className="empty-state">Nenhum item vinculado a esta guia.</div>}
          </section>
        </>}
      </DetailsModal>
    </div>
  );
}
