import { useEffect, useMemo, useState } from 'react';
import api from '../services/api';
import KpiCard from '../components/KpiCard';
import { formatQuantity, formatQuantityLabel } from '../utils/formatQuantity';

function brl(value) { return Number(value || 0).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' }); }
function qtyLabel(value, unit = '') { return formatQuantityLabel(value, unit); }
function splitSerials(value) { return String(value || '').split(/\n|,|;/).map((s) => s.trim()).filter(Boolean); }
function unique(values = []) { return Array.from(new Set(values.map((v) => String(v || '').trim()).filter(Boolean))); }
function quantityNumber(value) { const parsed = Number(String(value ?? '').replace(',', '.')); return Number.isFinite(parsed) ? parsed : 0; }

const emptyForm = { warehouseId: '', reference: '', notes: '', items: [] };

export default function TechnicianReturns() {
  const [technicians, setTechnicians] = useState([]);
  const [warehouses, setWarehouses] = useState([]);
  const [selectedTech, setSelectedTech] = useState('');
  const [box, setBox] = useState(null);
  const [form, setForm] = useState(emptyForm);
  const [message, setMessage] = useState('');
  const [loading, setLoading] = useState(false);

  async function loadInitial() {
    const [techRes, whRes] = await Promise.all([
      api.get('/technicians'),
      api.get('/warehouses').catch(() => ({ data: { data: [] } })),
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

  useEffect(() => { loadInitial(); }, []);
  useEffect(() => { if (selectedTech) loadBox(selectedTech); }, [selectedTech]);

  const materialsInBox = useMemo(() => {
    const map = new Map();
    for (const asset of box?.assets || []) if (asset.Material) map.set(asset.materialId, { ...asset.Material, availableQty: (map.get(asset.materialId)?.availableQty || 0) + 1 });
    for (const balance of box?.balances || []) if (balance.Material) map.set(balance.materialId, { ...balance.Material, availableQty: Number(balance.quantity || 0) });
    return Array.from(map.values()).sort((a, b) => String(a.name).localeCompare(String(b.name)));
  }, [box]);

  function assetsByMaterial(materialId, search = '') {
    const q = String(search || '').trim().toLowerCase();
    return (box?.assets || [])
      .filter((asset) => Number(asset.materialId) === Number(materialId))
      .filter((asset) => !q || [asset.serialNumber, asset.mac, asset.brand, asset.model, asset.Material?.name].filter(Boolean).join(' ').toLowerCase().includes(q));
  }

  function balanceFor(materialId) {
    return (box?.balances || []).find((row) => Number(row.materialId) === Number(materialId));
  }

  function addItem() {
    if (!selectedTech) { setMessage('Selecione o técnico.'); return; }
    if (!materialsInBox.length) { setMessage('Este técnico não possui material na caixa.'); return; }
    setMessage('');
    setForm({ ...form, items: [...form.items, { materialId: '', quantity: '', serialNumbers: [], search: '' }] });
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

  function validate() {
    if (!selectedTech) return 'Selecione o técnico.';
    if (!form.warehouseId) return 'Selecione o estoque de destino.';
    if (!form.items.length) return 'Adicione ao menos um item para retornar ao estoque.';
    for (const item of form.items) {
      const material = materialsInBox.find((m) => Number(m.id) === Number(item.materialId));
      if (!material) return 'Selecione o material em todos os itens adicionados.';
      if (material.requiresSerial) {
        if (!Array.isArray(item.serialNumbers) || item.serialNumbers.length === 0) return `Selecione pelo menos um serial de ${material.name}.`;
      } else {
        const quantity = quantityNumber(item.quantity);
        const available = Number(balanceFor(material.id)?.quantity || 0);
        if (quantity <= 0) return `Informe uma quantidade válida para ${material.name}.`;
        if (quantity > available) return `Saldo insuficiente para ${material.name}. Disponível: ${qtyLabel(available, material.unit)}.`;
      }
    }
    return null;
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
      setForm({ ...emptyForm, warehouseId: form.warehouseId });
      await loadBox(selectedTech);
    } catch (error) {
      setMessage(`❌ ${error.response?.data?.message || error.message || 'Erro ao retornar material.'}`);
    } finally {
      setLoading(false);
    }
  }

  const selectedTechnician = technicians.find((tech) => String(tech.id) === String(selectedTech));
  const selectedWarehouse = warehouses.find((warehouse) => String(warehouse.id) === String(form.warehouseId));
  const totalQty = form.items.reduce((sum, item) => sum + quantityNumber(item.quantity || (item.serialNumbers || []).length || 0), 0);

  return (
    <div className="page-grid technician-return-page">
      <div className="toolbar">
        <div><h2>↩️ Retorno da caixa do técnico para estoque</h2><p>Retire material da responsabilidade do técnico, escolha o estoque de destino e gere uma guia em Transferências para anexar documento/assinatura.</p></div>
        <button className="ghost" onClick={() => loadBox(selectedTech)}>🔄 Atualizar</button>
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
            <input value={form.reference} onChange={(e) => setForm({ ...form, reference: e.target.value })} placeholder="Ex.: DEV-001, conferência mensal" />
          </label>
          <label>Motivo/observação
            <input value={form.notes} onChange={(e) => setForm({ ...form, notes: e.target.value })} placeholder="Motivo do retorno" />
          </label>
        </div>
        <div className="viz-callout">O item sai da caixa do técnico e volta para o estoque selecionado. Estoques listados respeitam o acesso liberado ao usuário.</div>
      </section>

      <section className="panel">
        <div className="subtoolbar"><h3>Itens para retornar</h3><button type="button" className="ghost" onClick={addItem}>➕ Adicionar item</button></div>
        {form.items.length === 0 && <div className="empty-state">Clique em “Adicionar item” e escolha o material que será retirado da caixa do técnico.</div>}
        {form.items.map((item, index) => {
          const material = materialsInBox.find((m) => Number(m.id) === Number(item.materialId));
          const visibleAssets = assetsByMaterial(item.materialId, item.search);
          return (
            <div className="item-card movement-item-card" key={index}>
              <div className="item-head"><strong>📦 Item {index + 1}</strong><button className="ghost danger-outline" onClick={() => removeItem(index)}>Remover</button></div>
              <div className="form-grid">
                <label>Material
                  <select value={item.materialId} onChange={(e) => updateItem(index, { materialId: e.target.value, quantity: '1', serialNumbers: [], search: '' })}>
                    <option value="">Selecione o material</option>
                    {materialsInBox.map((mat) => <option key={mat.id} value={mat.id}>{mat.name} — disponível {qtyLabel(mat.availableQty, mat.unit)}</option>)}
                  </select>
                </label>
                {!material?.requiresSerial && <label>Quantidade
                  <input type="number" min="1" step="1" value={item.quantity} onChange={(e) => updateItem(index, { quantity: e.target.value })} placeholder="Ex.: 30, 40, 50" />
                  <small>Disponível na caixa: {qtyLabel(balanceFor(material?.id)?.quantity, material?.unit)}</small>
                </label>}
              </div>
              {material?.requiresSerial && (
                <div className="serial-picker compact-serial-picker">
                  <div className="serial-picker-head serial-picker-head-stacked">
                    <div><strong>🏷️ Seriais na caixa do técnico</strong><span>{visibleAssets.length} filtrado(s) • {item.serialNumbers?.length || 0} selecionado(s)</span></div>
                    <div className="serial-actions-row"><input value={item.search || ''} onChange={(e) => updateItem(index, { search: e.target.value })} placeholder="Buscar serial ou MAC" /><button type="button" className="ghost" onClick={() => selectVisibleSerials(index, visibleAssets)}>Selecionar tudo filtrado</button><button type="button" className="ghost" onClick={() => updateItem(index, { serialNumbers: [], quantity: '' })}>Limpar</button></div>
                  </div>
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
        <div className="submit-bar"><span>Destino: <strong>{selectedWarehouse?.name || 'não selecionado'}</strong></span><button disabled={loading} onClick={save}>↩️ Confirmar retorno para estoque</button></div>
      </section>
    </div>
  );
}
