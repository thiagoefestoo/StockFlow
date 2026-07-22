/* eslint-disable react-hooks/exhaustive-deps */
import { useEffect, useMemo, useState } from 'react';
import api from '../services/api';
import KpiCard from '../components/KpiCard';
import DetailsModal, { DetailGrid, DetailList } from '../components/DetailsModal';
import { formatQuantity, formatQuantityInput, formatQuantityLabel } from '../utils/formatQuantity';

function brl(value) { return Number(value || 0).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' }); }
function dt(value) { return value ? new Date(value).toLocaleString('pt-BR') : '-'; }
function splitSerials(value) { return String(value || '').split(/\n|,|;/).map((s) => s.trim()).filter(Boolean); }

const emptyClientForm = {
  osNumber: '',
  customerName: '',
  customerCpf: '',
  customerAddress: '',
  city: '',
  serviceType: 'instalacao',
  notes: '',
  items: [],
};
const emptyReturnForm = { warehouseId: '', reference: '', notes: '', items: [] };

export default function TechnicianBoxControl() {
  const [technicians, setTechnicians] = useState([]);
  const [warehouses, setWarehouses] = useState([]);
  const [selectedTech, setSelectedTech] = useState('');
  const [box, setBox] = useState(null);
  const [tab, setTab] = useState('cliente');
  const [clientForm, setClientForm] = useState(emptyClientForm);
  const [returnForm, setReturnForm] = useState(emptyReturnForm);
  const [message, setMessage] = useState('');
  const [details, setDetails] = useState(null);

  async function loadTechs() {
    const [techRes, whRes] = await Promise.all([
      api.get('/technicians'),
      api.get('/warehouses').catch(() => ({ data: { data: [] } })),
    ]);
    const list = techRes.data.data || [];
    const warehouseList = whRes.data.data || [];
    setTechnicians(list);
    setWarehouses(warehouseList);
    if (!selectedTech && list[0]) setSelectedTech(String(list[0].id));
    if (!returnForm.warehouseId && warehouseList[0]) setReturnForm((current) => ({ ...current, warehouseId: String(warehouseList[0].id) }));
  }

  async function loadBox(id = selectedTech) {
    if (!id) return;
    const res = await api.get(`/stock/technician-box/${id}`);
    setBox(res.data.data);
  }

  useEffect(() => { loadTechs(); }, []);
  useEffect(() => { if (selectedTech) loadBox(selectedTech); }, [selectedTech]);

  useEffect(() => {
    if (!selectedTech) return undefined;

    const refresh = () => loadBox(selectedTech);
    const interval = setInterval(refresh, 15000);
    const onFocus = () => refresh();
    const onStorage = (event) => {
      if (event.key === 'superinfra:technician-box-refresh') refresh();
    };
    const onLocalRefresh = () => refresh();

    window.addEventListener('focus', onFocus);
    window.addEventListener('storage', onStorage);
    window.addEventListener('superinfra:technician-box-refresh', onLocalRefresh);

    return () => {
      clearInterval(interval);
      window.removeEventListener('focus', onFocus);
      window.removeEventListener('storage', onStorage);
      window.removeEventListener('superinfra:technician-box-refresh', onLocalRefresh);
    };
  }, [selectedTech]);

  const materialsInBox = useMemo(() => {
    const map = new Map();
    for (const asset of box?.assets || []) {
      if (!map.has(asset.materialId)) map.set(asset.materialId, asset.Material);
    }
    for (const balance of box?.balances || []) {
      if (!map.has(balance.materialId)) map.set(balance.materialId, balance.Material);
    }
    return Array.from(map.values()).filter(Boolean);
  }, [box]);

  function assetsByMaterial(materialId) {
    return (box?.assets || []).filter((asset) => Number(asset.materialId) === Number(materialId));
  }

  function balanceFor(materialId) {
    return (box?.balances || []).find((row) => Number(row.materialId) === Number(materialId));
  }

  function addClientItem() {
    setClientForm({ ...clientForm, items: [...clientForm.items, { materialId: '', quantity: '', serialNumbersText: '' }] });
  }
  function addReturnItem() {
    setReturnForm({ ...returnForm, items: [...returnForm.items, { materialId: '', quantity: '', serialNumbersText: '' }] });
  }
  function updateClientItem(i, patch) {
    const items = [...clientForm.items];
    items[i] = { ...items[i], ...patch };
    setClientForm({ ...clientForm, items });
  }
  function updateReturnItem(i, patch) {
    const items = [...returnForm.items];
    items[i] = { ...items[i], ...patch };
    setReturnForm({ ...returnForm, items });
  }
  function removeClientItem(i) { setClientForm({ ...clientForm, items: clientForm.items.filter((_, idx) => idx !== i) }); }
  function removeReturnItem(i) { setReturnForm({ ...returnForm, items: returnForm.items.filter((_, idx) => idx !== i) }); }

  function toggleSerial(formName, index, serialNumber) {
    const form = formName === 'client' ? clientForm : returnForm;
    const item = form.items[index];
    const selected = new Set(splitSerials(item.serialNumbersText));
    if (selected.has(serialNumber)) selected.delete(serialNumber);
    else selected.add(serialNumber);
    const serialNumbersText = Array.from(selected).join('\n');
    if (formName === 'client') updateClientItem(index, { serialNumbersText, quantity: selected.size });
    else updateReturnItem(index, { serialNumbersText, quantity: selected.size });
  }

  async function moveToClient() {
    try {
      const payload = {
        ...clientForm,
        technicianId: selectedTech,
        items: clientForm.items.map((item) => ({ ...item, quantity: Number(item.quantity || 0), serialNumbers: splitSerials(item.serialNumbersText) })),
      };
      await api.post('/stock/technician-box/move-to-client', payload);
      setMessage('✅ Movimentação para cliente registrada. Caixa, OS, histórico, auditoria e BI foram atualizados.');
      setClientForm(emptyClientForm);
      loadBox(selectedTech);
    } catch (error) {
      setMessage(`❌ ${error.response?.data?.message || error.message || 'Erro ao movimentar para cliente.'}`);
    }
  }

  async function returnToStock() {
    try {
      const payload = {
        ...returnForm,
        technicianId: selectedTech,
        items: returnForm.items.map((item) => ({ ...item, quantity: Number(item.quantity || 0), serialNumbers: splitSerials(item.serialNumbersText) })),
      };
      await api.post('/stock/technician-box/return-to-stock', payload);
      setMessage('✅ Material devolvido ao estoque. Caixa, histórico, auditoria e BI foram atualizados.');
      setReturnForm(emptyReturnForm);
      loadBox(selectedTech);
    } catch (error) {
      setMessage(`❌ ${error.response?.data?.message || error.message || 'Erro ao devolver ao estoque.'}`);
    }
  }

  const selected = technicians.find((t) => String(t.id) === String(selectedTech));

  return (
    <div className="page-grid technician-box-admin-page">
      <section className="command-center">
        <div>
          <span className="eyebrow">🧰 Central administrativa</span>
          <h2>Caixa do técnico em tempo real</h2>
          <p>Faça baixa por OS, movimente material para cliente, devolva ao estoque e consulte tudo que está em nome do técnico.</p>
        </div>
        <button className="ghost" onClick={() => loadBox(selectedTech)}>🔄 Atualizar agora</button>
      </section>

      <section className="panel box-selector-panel">
        <div className="form-grid">
          <label>👷 Técnico / colaborador
            <select value={selectedTech} onChange={(e) => { setSelectedTech(e.target.value); setMessage(''); }}>
              <option value="">Selecione</option>
              {technicians.map((tec) => <option key={tec.id} value={tec.id}>{tec.name} — {tec.ContractorCompany?.name || 'sem terceirizada'}</option>)}
            </select>
          </label>
          <label>🏢 Terceirizada / vínculo
            <input value={selected?.ContractorCompany?.name || selected?.type || ''} readOnly />
          </label>
        </div>
      </section>

      {message && <div className={`alert ${message.startsWith('❌') ? 'danger' : 'success'}`}>{message}</div>}

      <div className="kpi-grid small">
        <KpiCard label="Equipamentos" value={box?.summary?.assetsCount || 0} hint="Seriais em nome do técnico" tone="success" />
        <KpiCard label="Consumíveis" value={box?.summary?.consumableLines || 0} hint="Linhas de materiais" />
        <KpiCard label="Valor em custódia" value={brl(box?.summary?.totalValue)} hint="Equipamentos + consumíveis" tone="warning" />
      </div>

      <section className="two-col">
        <article className="panel">
          <div className="panel-title"><div><h3>📦 Resumo da caixa</h3><p>Materiais agrupados e valores estimados em tempo real.</p></div></div>
          <div className="timeline">
            {(box?.groupedMaterials || []).map((row) => (
              <button type="button" className="event box-group-row" key={row.materialId} onClick={() => setDetails({ type: 'group', item: row })}>
                <strong>{row.requiresSerial ? '🏷️' : '📦'} {row.material}</strong>
                <span>{formatQuantity(row.quantity, row.unit || 'un')} • {brl(row.value)} • {row.category}</span>
                <small>{row.requiresSerial ? `${row.serials?.length || 0} serial(is)` : 'consumível sem serial'}</small>
              </button>
            ))}
            {(box?.groupedMaterials || []).length === 0 && <div className="empty-state">Nenhum material na caixa deste técnico.</div>}
          </div>
        </article>

        <article className="panel">
          <div className="panel-title"><div><h3>🏷️ Equipamentos serializados</h3><p>Clique para ver serial, MAC, valor e dias em custódia.</p></div></div>
          <div className="asset-grid">
            {(box?.assets || []).map((asset) => (
              <button type="button" className="asset-card asset-button" key={asset.id} onClick={() => setDetails({ type: 'asset', item: asset })}>
                <b>🏷️ {asset.serialNumber}</b>
                <span>{asset.Material?.name}</span>
                <small>{asset.brand || '-'} {asset.model || ''} • {asset.custodyDays || 0} dia(s) • {brl(asset.acquisitionCost || asset.Material?.unitCost)}</small>
              </button>
            ))}
          </div>
        </article>
      </section>

      <section className="panel action-workbench">
        <div className="tabbar">
          <button className={tab === 'cliente' ? 'active' : 'ghost'} onClick={() => setTab('cliente')}>📲 Baixar para cliente / OS</button>
          <button className={tab === 'estoque' ? 'active' : 'ghost'} onClick={() => setTab('estoque')}>↩️ Devolver para estoque</button>
          <button className={tab === 'historico' ? 'active' : 'ghost'} onClick={() => setTab('historico')}>🧾 Histórico da caixa</button>
        </div>

        {tab === 'cliente' && (
          <div className="workbench-grid">
            <div>
              <h3>📲 Transferir material do técnico para cliente</h3>
              <p className="muted">Use quando o técnico não conseguir dar baixa pelo celular. Se informar OS, o sistema cria a OS concluída e vincula os materiais.</p>
              <div className="form-grid">
                <label>Nº da OS <input value={clientForm.osNumber} onChange={(e) => setClientForm({ ...clientForm, osNumber: e.target.value })} placeholder="Ex.: OS-12345" /></label>
                <label>Tipo <select value={clientForm.serviceType} onChange={(e) => setClientForm({ ...clientForm, serviceType: e.target.value })}><option value="instalacao">Instalação</option><option value="manutencao">Manutenção</option><option value="troca_onu">Troca de ONU</option><option value="retirada">Retirada</option><option value="outro">Outro</option></select></label>
                <label>CPF/CNPJ do cliente <input value={clientForm.customerCpf} onChange={(e) => setClientForm({ ...clientForm, customerCpf: e.target.value })} /></label>
                <label>Nome do cliente <input value={clientForm.customerName} onChange={(e) => setClientForm({ ...clientForm, customerName: e.target.value })} /></label>
                <label>Endereço <input value={clientForm.customerAddress} onChange={(e) => setClientForm({ ...clientForm, customerAddress: e.target.value })} /></label>
                <label>Cidade <input value={clientForm.city} onChange={(e) => setClientForm({ ...clientForm, city: e.target.value })} /></label>
              </div>
              <label>Observação da baixa<textarea rows="3" value={clientForm.notes} onChange={(e) => setClientForm({ ...clientForm, notes: e.target.value })} placeholder="Motivo, atendimento, autorização, observações do supervisor..." /></label>
              <div className="subtoolbar"><h4>Itens usados no cliente</h4><button className="ghost" onClick={addClientItem}>➕ Adicionar item</button></div>
              {clientForm.items.map((item, i) => <MovementItem key={i} item={item} index={i} materials={materialsInBox} assetsByMaterial={assetsByMaterial} balanceFor={balanceFor} update={updateClientItem} remove={removeClientItem} toggleSerial={(serial) => toggleSerial('client', i, serial)} />)}
              <button className="wide" onClick={moveToClient}>✅ Confirmar baixa/movimentação para cliente</button>
            </div>
            <PreviewBox title="Impacto desta operação" form={clientForm} materials={materialsInBox} box={box} target="cliente" />
          </div>
        )}

        {tab === 'estoque' && (
          <div className="workbench-grid">
            <div>
              <h3>↩️ Devolver material do técnico para estoque</h3>
              <p className="muted">Use para recolhimento, conferência, ajuste operacional, troca de equipe ou material não utilizado.</p>
              <div className="form-grid"><label>Estoque de destino<select value={returnForm.warehouseId || ''} onChange={(e) => setReturnForm({ ...returnForm, warehouseId: e.target.value })}><option value="">Selecione</option>{warehouses.map((warehouse) => <option key={warehouse.id} value={warehouse.id}>{warehouse.name} — {warehouse.city || '-'} — {warehouse.code || 'sem código'}</option>)}</select></label><label>Referência<input value={returnForm.reference} onChange={(e) => setReturnForm({ ...returnForm, reference: e.target.value })} placeholder="Ex.: DEV-001, conferência mensal..." /></label><label>Motivo<input value={returnForm.notes} onChange={(e) => setReturnForm({ ...returnForm, notes: e.target.value })} placeholder="Motivo do retorno" /></label></div>
              <div className="subtoolbar"><h4>Itens para retornar ao estoque</h4><button className="ghost" onClick={addReturnItem}>➕ Adicionar item</button></div>
              {returnForm.items.map((item, i) => <MovementItem key={i} item={item} index={i} materials={materialsInBox} assetsByMaterial={assetsByMaterial} balanceFor={balanceFor} update={updateReturnItem} remove={removeReturnItem} toggleSerial={(serial) => toggleSerial('return', i, serial)} />)}
              <button className="wide" onClick={returnToStock}>↩️ Confirmar devolução ao estoque</button>
            </div>
            <PreviewBox title="Impacto da devolução" form={returnForm} materials={materialsInBox} box={box} target="estoque" />
          </div>
        )}

        {tab === 'historico' && (
          <div className="history-rich">
            <h3>🧾 Histórico completo da caixa</h3>
            <div className="table-wrap"><table><thead><tr><th>Data</th><th>Tipo</th><th>Material</th><th>Serial</th><th>Origem</th><th>Destino</th><th>Referência</th><th>Usuário</th><th>Opções</th></tr></thead><tbody>{(box?.movements || []).map((m) => <tr key={m.id}><td>{dt(m.movementAt)}</td><td><span className={`badge ${m.type}`}>{m.type}</span></td><td>{m.Material?.name}</td><td>{m.serialNumber || '-'}</td><td>{m.fromOwnerType || '-'} {m.fromTechnician?.name ? `• ${m.fromTechnician.name}` : ''}</td><td>{m.toOwnerType || '-'} {m.toTechnician?.name ? `• ${m.toTechnician.name}` : ''}</td><td>{m.reference || '-'}</td><td>{m.createdBy?.name || '-'}</td><td><button className="info" onClick={() => setDetails({ type: 'movement', item: m })}>Detalhes</button></td></tr>)}</tbody></table></div>
          </div>
        )}
      </section>

      <section className="panel">
        <div className="panel-title"><div><h3>📲 OS e baixas recentes</h3><p>Últimos registros associados ao técnico selecionado.</p></div></div>
        <div className="table-wrap"><table><thead><tr><th>OS</th><th>Cliente</th><th>Tipo</th><th>Status</th><th>Data</th><th>Itens</th><th>Opções</th></tr></thead><tbody>{(box?.orders || []).map((order) => <tr key={order.id}><td>{order.osNumber}</td><td>{order.customerName}<br /><small>{order.customerCpf}</small></td><td>{order.serviceType}</td><td><span className={`badge ${order.status}`}>{order.status}</span></td><td>{dt(order.completedAt || order.createdAt)}</td><td>{order.ServiceOrderMaterials?.length || 0}</td><td><button className="info" onClick={() => setDetails({ type: 'order', item: order })}>Detalhes</button></td></tr>)}</tbody></table></div>
      </section>

      <DetailsModal open={!!details} title="Detalhes da caixa do técnico" onClose={() => setDetails(null)}>
        {details?.type === 'asset' && <DetailGrid fields={[["Serial", details.item.serialNumber], ["Material", details.item.Material?.name], ["MAC", details.item.mac], ["Marca/modelo", `${details.item.brand || '-'} ${details.item.model || ''}`], ["Valor", brl(details.item.acquisitionCost || details.item.Material?.unitCost)], ["Custódia desde", details.item.custodyStartedAt], ["Dias", details.item.custodyDays], ["Status", details.item.status]]} />}
        {details?.type === 'group' && <DetailGrid fields={[["Material", details.item.material], ["Categoria", details.item.category], ["Quantidade", formatQuantity(details.item.quantity, details.item.unit)], ["Valor", brl(details.item.value)], ["Serializado", details.item.requiresSerial ? 'Sim' : 'Não'], ["Seriais", details.item.serials?.join(', ') || '-']]} />}
        {details?.type === 'movement' && <DetailGrid fields={[["Data", details.item.movementAt], ["Tipo", details.item.type], ["Material", details.item.Material?.name], ["Serial", details.item.serialNumber], ["Quantidade", formatQuantity(details.item.quantity)], ["Origem", details.item.fromOwnerType], ["Destino", details.item.toOwnerType], ["Referência", details.item.reference], ["Usuário", details.item.createdBy?.name], ["Notas", details.item.notes]]} />}
        {details?.type === 'order' && <><DetailGrid fields={[["OS", details.item.osNumber], ["Cliente", details.item.customerName], ["CPF/CNPJ", details.item.customerCpf], ["Endereço", details.item.customerAddress], ["Cidade", details.item.city], ["Tipo", details.item.serviceType], ["Status", details.item.status], ["Concluída em", details.item.completedAt], ["Notas", details.item.notes]]} /><DetailList title="Materiais baixados" items={details.item.ServiceOrderMaterials || []} render={(item) => <><b>{item.Material?.name || 'Material'}</b><span>Qtd. {formatQuantity(item.quantity)} • {item.serialNumber || 'sem serial'} • {brl(item.totalCost)}</span></>} /></>}
      </DetailsModal>
    </div>
  );
}

function MovementItem({ item, index, materials, assetsByMaterial, balanceFor, update, remove, toggleSerial }) {
  const material = materials.find((m) => Number(m.id) === Number(item.materialId));
  const assets = assetsByMaterial(item.materialId);
  const selectedSerials = splitSerials(item.serialNumbersText);
  const balance = balanceFor(item.materialId);
  return (
    <div className="item-card movement-item-card">
      <div className="item-head"><strong>📦 Item {index + 1}</strong><button className="ghost danger-outline" onClick={() => remove(index)}>Remover</button></div>
      <div className="form-grid">
        <label>Material
          <select value={item.materialId} onChange={(e) => update(index, { materialId: e.target.value, quantity: 1, serialNumbersText: '' })}>
            <option value="">Selecione o material</option>{materials.map((mat) => <option key={mat.id} value={mat.id}>{mat.name}</option>)}
          </select>
        </label>
        {!material?.requiresSerial && <label>Quantidade disponível: {formatQuantity(balance?.quantity, material?.unit)}<input type="number" min="0" step="0.001" value={item.quantity} onChange={(e) => update(index, { quantity: e.target.value })} /></label>}
      </div>
      {material?.requiresSerial && (
        <div className="serial-picker compact-serial-picker">
          <div className="serial-picker-head"><div><strong>🏷️ Seriais em nome do técnico</strong><span>{assets.length} disponível(is) • {selectedSerials.length} selecionado(s)</span></div></div>
          <div className="serial-grid">
            {assets.map((asset) => {
              const checked = selectedSerials.includes(asset.serialNumber);
              return <button type="button" key={asset.id} className={`serial-chip ${checked ? 'selected' : ''}`} onClick={() => toggleSerial(asset.serialNumber)}><b>{checked ? '✅' : '🏷️'} {asset.serialNumber}</b><span>{asset.Material?.name} • {asset.brand || '-'} {asset.model || ''}</span><small>{asset.mac || 'sem MAC'} • {brl(asset.acquisitionCost || asset.Material?.unitCost)}</small></button>;
            })}
          </div>
        </div>
      )}
    </div>
  );
}

function PreviewBox({ title, form, materials, target }) {
  const rows = form.items.map((item) => {
    const material = materials.find((mat) => Number(mat.id) === Number(item.materialId));
    const qty = material?.requiresSerial ? splitSerials(item.serialNumbersText).length : Number(item.quantity || 0);
    const value = qty * Number(material?.unitCost || 0);
    return { material, qty, value, serials: splitSerials(item.serialNumbersText) };
  });
  const totalQty = rows.reduce((sum, row) => sum + Number(row.qty || 0), 0);
  const totalValue = rows.reduce((sum, row) => sum + Number(row.value || 0), 0);
  return (
    <aside className="panel-soft preview-box">
      <h3>{title}</h3>
      <div className="mini-kpi"><strong>{totalQty}</strong><span>item(ns) para {target}</span></div>
      <div className="mini-kpi"><strong>{brl(totalValue)}</strong><span>valor estimado</span></div>
      <div className="timeline">
        {rows.map((row, idx) => <div className="event compact" key={idx}><strong>{row.material?.name || 'Material'}</strong><span>{row.qty} {row.material?.unit || 'un'} • {brl(row.value)}</span>{row.serials.length > 0 && <small>{row.serials.join(', ')}</small>}</div>)}
        {rows.length === 0 && <div className="empty-state">Adicione itens para visualizar o impacto.</div>}
      </div>
      <div className="viz-callout">🛡️ Toda ação gera histórico, movimentação e auditoria com usuário responsável.</div>
    </aside>
  );
}
