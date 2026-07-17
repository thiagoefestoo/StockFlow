import { useEffect, useMemo, useState } from 'react';
import api from '../services/api';
import Modal from '../components/Modal';
import DetailsModal, { DetailGrid, DetailList } from '../components/DetailsModal';
import KpiCard from '../components/KpiCard';
import { useAuth } from '../contexts/AuthContext';

const empty = {
  name: '',
  code: '',
  region: '',
  city: '',
  state: '',
  address: '',
  responsibleName: '',
  approvalLimit: 0,
  status: 'ativo',
  notes: '',
};

function brl(v) { return Number(v || 0).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' }); }
function dt(value) { return value ? new Date(value).toLocaleString('pt-BR') : '-'; }
function splitSerials(value) { return String(value || '').split(/\n|,|;/).map((s) => s.trim()).filter(Boolean); }

function emptyTransfer(toWarehouseId = '') {
  return { fromWarehouseId: '', toWarehouseId, reference: '', notes: '', items: [] };
}

export default function Warehouses() {
  const { isAdmin, user } = useAuth();
  const [rows, setRows] = useState([]);
  const [materials, setMaterials] = useState([]);
  const [availableAssets, setAvailableAssets] = useState([]);
  const [form, setForm] = useState(empty);
  const [modal, setModal] = useState(false);
  const [details, setDetails] = useState(null);
  const [transferModal, setTransferModal] = useState(false);
  const [transferForm, setTransferForm] = useState(emptyTransfer());
  const [assetSearch, setAssetSearch] = useState('');
  const [message, setMessage] = useState('');

  const canManageStructure = isAdmin || user?.role === 'supervisor';

  async function load() {
    const [w, m] = await Promise.all([
      api.get('/warehouses'),
      api.get('/materials').catch(() => ({ data: { data: [] } })),
    ]);
    setRows(w.data.data || []);
    setMaterials(m.data.data || []);
  }

  async function loadAssets(fromWarehouseId = transferForm.fromWarehouseId) {
    if (!fromWarehouseId) {
      setAvailableAssets([]);
      return;
    }
    const res = await api.get(`/stock/assets?ownerType=estoque&status=em_estoque&warehouseId=${fromWarehouseId}&limit=2500`);
    setAvailableAssets(res.data.data || []);
  }

  useEffect(() => { load(); }, []);
  useEffect(() => { if (transferModal) loadAssets(transferForm.fromWarehouseId); }, [transferModal, transferForm.fromWarehouseId]); // eslint-disable-line react-hooks/exhaustive-deps

  const totalValue = rows.reduce((s, r) => s + Number(r.totalValue || 0), 0);

  const assetsByMaterial = useMemo(() => {
    const map = {};
    for (const asset of availableAssets) {
      map[asset.materialId] = map[asset.materialId] || [];
      map[asset.materialId].push(asset);
    }
    return map;
  }, [availableAssets]);

  async function save() {
    try {
      setMessage('');
      if (form.id) await api.put(`/warehouses/${form.id}`, form);
      else await api.post('/warehouses', form);
      setModal(false);
      setForm(empty);
      await load();
      setMessage('Estoque salvo com sucesso.');
    } catch (e) {
      setMessage(e.response?.data?.message || 'Erro ao salvar estoque.');
    }
  }

  async function openDetails(row) {
    const res = await api.get(`/warehouses/${row.id}`);
    setDetails(res.data.data);
  }

  function openTransfer(row = null) {
    setTransferForm(emptyTransfer(row?.id || ''));
    setAvailableAssets([]);
    setAssetSearch('');
    setTransferModal(true);
  }

  function addTransferItem() {
    setTransferForm((current) => ({ ...current, items: [...current.items, { materialId: materials[0]?.id || '', quantity: 1, serialNumbers: [] }] }));
  }

  function removeTransferItem(index) {
    setTransferForm((current) => ({ ...current, items: current.items.filter((_, i) => i !== index) }));
  }

  function updateTransferItem(index, patch) {
    setTransferForm((current) => {
      const items = [...current.items];
      items[index] = { ...items[index], ...patch };
      return { ...current, items };
    });
  }

  function toggleSerial(index, serialNumber) {
    const item = transferForm.items[index];
    const selected = new Set(item.serialNumbers || []);
    if (selected.has(serialNumber)) selected.delete(serialNumber);
    else selected.add(serialNumber);
    updateTransferItem(index, { serialNumbers: Array.from(selected), quantity: selected.size });
  }

  async function submitWarehouseTransfer() {
    try {
      setMessage('');
      const payload = {
        ...transferForm,
        items: transferForm.items.map((item) => {
          const serialNumbers = Array.isArray(item.serialNumbers) ? item.serialNumbers : splitSerials(item.serialNumbersText);
          return { ...item, quantity: Number(serialNumbers.length || item.quantity || 0), serialNumbers };
        }),
      };
      await api.post('/warehouses/transfer-stock', payload);
      setTransferModal(false);
      setTransferForm(emptyTransfer());
      await load();
      setMessage('Solicitação enviada para aprovação do administrador. O saldo será movimentado somente após aprovação.');
    } catch (e) {
      setMessage(e.response?.data?.message || e.message || 'Erro ao transferir entre estoques.');
    }
  }


  async function requestWarehouseDelete(row) {
    const hasItems = Number(row.totalValue || 0) > 0 || Number(row.assetCount || 0) > 0 || Number(row.consumableLines || 0) > 0;
    if (hasItems) {
      setMessage('Este estoque possui materiais/equipamentos. Transfira todos os itens para outro estoque antes de solicitar exclusão.');
      return;
    }
    const confirmed = window.confirm(`Solicitar exclusão do estoque ${row.code} • ${row.name}? A exclusão só será executada após aprovação do admin e o sistema irá validar novamente se o estoque está vazio.`);
    if (!confirmed) return;
    try {
      setMessage('');
      await api.post(`/warehouses/${row.id}/request-delete`, { notes: 'Solicitação de exclusão enviada pela tela de estoques.' });
      setMessage('Sucesso: solicitação de exclusão enviada para aprovação do administrador.');
      await load();
    } catch (e) {
      setMessage(e.response?.data?.message || 'Não foi possível solicitar exclusão do estoque. Transfira os itens para outro estoque e tente novamente.');
    }
  }

  return <div className="page-grid erp-page warehouse-page">
    <section className="toolbar">
      <div>
        <span className="eyebrow">Rede logística</span>
        <h2>Estoques por cidade/região</h2>
        <p>Crie estoques por cidade, transfira materiais entre unidades e limite cada estoquista aos estoques autorizados pelo admin.</p>
      </div>
      <div className="row-actions">
        <button className="ghost" onClick={load}>Atualizar</button>
        <button className="ghost" onClick={() => openTransfer()}>Transferir entre estoques</button>
        {canManageStructure && <button onClick={() => { setForm(empty); setModal(true); }}>Novo estoque</button>}
      </div>
    </section>

    {message && <div className={message.includes('sucesso') ? 'alert success' : 'alert danger'}>{message}</div>}

    <div className="kpi-grid small">
      <KpiCard label="Estoques" value={rows.length} />
      <KpiCard label="Ativos" value={rows.filter((r) => r.status === 'ativo').length} />
      <KpiCard label="Patrimônio autorizado" value={brl(totalValue)} />
      <KpiCard label="Equipamentos" value={rows.reduce((s, r) => s + Number(r.assetCount || 0), 0)} />
    </div>

    <section className="panel">
      <div className="panel-title">
        <div><h3>Unidades de estoque</h3><p>Estoquistas veem apenas os estoques vinculados em Usuários e permissões. Estoques só podem ser excluídos quando estiverem vazios e após aprovação do admin.</p></div>
      </div>
      <div className="table-wrap">
        <table>
          <thead><tr><th>Nº estoque</th><th>Estoque</th><th>Cidade/região</th><th>Responsável</th><th>Valor</th><th>Status</th><th>Opções</th></tr></thead>
          <tbody>{rows.map((r) => <tr key={r.id}>
            <td><strong>{r.code}</strong></td>
            <td>{r.name}<br /><small>{r.notes || '-'}</small></td>
            <td>{r.city || '-'} {r.state || ''}<br /><small>{r.region || '-'}</small></td>
            <td>{r.responsibleName || '-'}</td>
            <td>{brl(r.totalValue)}</td>
            <td><span className={`badge ${r.status}`}>{r.status === 'ativo' ? 'Ativo' : r.status}</span></td>
            <td><div className="row-actions"><button className="info" onClick={() => openDetails(r)}>Detalhes/BI</button><button className="ghost" onClick={() => openTransfer(r)}>Receber transferência</button>{canManageStructure && <button className="ghost" onClick={() => { setForm(r); setModal(true); }}>Editar</button>}{canManageStructure && <button className="ghost danger-outline" onClick={() => requestWarehouseDelete(r)}>Solicitar exclusão</button>}</div></td>
          </tr>)}</tbody>
        </table>
      </div>
    </section>

    <Modal open={modal} title={form.id ? 'Editar estoque' : 'Novo estoque'} onClose={() => setModal(false)} footer={<><button className="ghost" onClick={() => setModal(false)}>Cancelar</button><button onClick={save}>Salvar estoque</button></>}>
      <div className="form-stack">
        <div className="form-grid">
          <label>Nome do estoque<input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} placeholder="Estoque São Pedro da Aldeia" /></label>
          <label>Número/código do estoque<input value={form.code} onChange={(e) => setForm({ ...form, code: e.target.value })} placeholder="SPA-001" /></label>
          <label>Cidade<input value={form.city || ''} onChange={(e) => setForm({ ...form, city: e.target.value })} placeholder="São Pedro da Aldeia" /></label>
          <label>UF<input value={form.state || ''} maxLength="2" onChange={(e) => setForm({ ...form, state: e.target.value.toUpperCase() })} placeholder="RJ" /></label>
          <label>Região<input value={form.region || ''} onChange={(e) => setForm({ ...form, region: e.target.value })} placeholder="Região dos Lagos" /></label>
          <label>Responsável local<input value={form.responsibleName || ''} onChange={(e) => setForm({ ...form, responsibleName: e.target.value })} /></label>
          <label>Limite local de aprovação<input type="number" value={form.approvalLimit || 0} onChange={(e) => setForm({ ...form, approvalLimit: e.target.value })} /></label>
          <label>Estoque ativo?<select value={form.status} onChange={(e) => setForm({ ...form, status: e.target.value })}><option value="ativo">Sim, ativo</option><option value="inativo">Não, inativo</option><option value="bloqueado">Bloqueado</option></select></label>
        </div>
        <label>Endereço<input value={form.address || ''} onChange={(e) => setForm({ ...form, address: e.target.value })} /></label>
        <label>Observações<textarea rows="3" value={form.notes || ''} onChange={(e) => setForm({ ...form, notes: e.target.value })} /></label>
      </div>
    </Modal>

    <Modal open={transferModal} title="Solicitar transferência entre estoques" onClose={() => setTransferModal(false)} footer={<><button className="ghost" onClick={() => setTransferModal(false)}>Cancelar</button><button onClick={submitWarehouseTransfer}>Solicitar aprovação do admin</button></>}>
      <div className="form-stack warehouse-transfer-form">
        <div className="alert warning">A transferência entre estoques ficará pendente na Central de aprovações. Somente o admin executa a movimentação do saldo.</div>
        <div className="form-grid">
          <label>Estoque de origem<select value={transferForm.fromWarehouseId} onChange={(e) => setTransferForm({ ...transferForm, fromWarehouseId: e.target.value, items: transferForm.items.map((item) => ({ ...item, serialNumbers: [] })) })}><option value="">Selecione</option>{rows.map((w) => <option key={w.id} value={w.id}>{w.code} • {w.name} • {w.city || w.region || '-'}</option>)}</select></label>
          <label>Estoque de destino<select value={transferForm.toWarehouseId} onChange={(e) => setTransferForm({ ...transferForm, toWarehouseId: e.target.value })}><option value="">Selecione</option>{rows.map((w) => <option key={w.id} value={w.id}>{w.code} • {w.name} • {w.city || w.region || '-'}</option>)}</select></label>
          <label>Referência<input value={transferForm.reference} onChange={(e) => setTransferForm({ ...transferForm, reference: e.target.value })} placeholder="TE-SPA-001" /></label>
          <label>Buscar serial<input value={assetSearch} onChange={(e) => setAssetSearch(e.target.value)} placeholder="Serial, MAC, modelo..." /></label>
        </div>
        <label>Observação<textarea rows="2" value={transferForm.notes} onChange={(e) => setTransferForm({ ...transferForm, notes: e.target.value })} placeholder="Motivo da transferência, responsável, rota..." /></label>
        <div className="subtoolbar"><h4>Itens transferidos</h4><button type="button" className="ghost" onClick={addTransferItem}>Adicionar item</button></div>
        {transferForm.items.length === 0 && <div className="empty-state">Adicione materiais para montar a transferência do estoque central para a unidade escolhida.</div>}
        {transferForm.items.map((item, index) => {
          const material = materials.find((m) => Number(m.id) === Number(item.materialId));
          const serialAssets = (assetsByMaterial[item.materialId] || []).filter((asset) => {
            const q = assetSearch.trim().toLowerCase();
            if (!q) return true;
            return [asset.serialNumber, asset.mac, asset.brand, asset.model].filter(Boolean).join(' ').toLowerCase().includes(q);
          });
          return <div className="item-card" key={index}>
            <div className="item-head"><strong>Item {index + 1}</strong><button type="button" className="ghost danger-outline" onClick={() => removeTransferItem(index)}>Remover</button></div>
            <div className="form-grid">
              <label>Material<select value={item.materialId} onChange={(e) => updateTransferItem(index, { materialId: e.target.value, serialNumbers: [], quantity: 1 })}>{materials.map((m) => <option key={m.id} value={m.id}>{m.name} • {m.category} • saldo {m.mainStock}</option>)}</select></label>
              {!material?.requiresSerial && <label>Quantidade<input type="number" min="0" step="0.001" value={item.quantity} onChange={(e) => updateTransferItem(index, { quantity: e.target.value })} /></label>}
            </div>
            {material?.requiresSerial && <div className="serial-picker">
              <div className="serial-picker-head"><strong>Seriais disponíveis no estoque de origem</strong><small>{serialAssets.length} disponível(is) • {(item.serialNumbers || []).length} selecionado(s)</small></div>
              <div className="serial-list">{serialAssets.map((asset) => { const checked = (item.serialNumbers || []).includes(asset.serialNumber); return <button type="button" key={asset.id} className={`serial-chip ${checked ? 'selected' : ''}`} onClick={() => toggleSerial(index, asset.serialNumber)}><span><b>{asset.serialNumber}</b><small>{asset.Material?.name || material.name} • {asset.status} • {brl(asset.acquisitionCost || material.unitCost)}</small></span><em>{checked ? 'Selecionado' : 'Selecionar'}</em></button>; })}</div>
              {serialAssets.length === 0 && <div className="empty-state small">Nenhum serial deste material disponível no estoque de origem.</div>}
            </div>}
          </div>;
        })}
      </div>
    </Modal>

    <DetailsModal open={!!details} title={`Estoque ${details?.warehouse?.name || ''}`} onClose={() => setDetails(null)}>
      <DetailGrid fields={details ? [
        ['Número/código', details.warehouse.code], ['Nome', details.warehouse.name], ['Cidade', `${details.warehouse.city || '-'} ${details.warehouse.state || ''}`], ['Região', details.warehouse.region], ['Responsável', details.warehouse.responsibleName], ['Estoque ativo?', details.warehouse.status === 'ativo' ? 'Sim' : details.warehouse.status], ['Valor total', brl(details.bi?.totalValue)], ['Última movimentação', dt(details.bi?.lastMovementAt)],
      ] : []} />
      {details && <>
        <div className="kpi-grid small"><KpiCard label="Valor em materiais" value={brl(details.bi?.totalValue)} /><KpiCard label="Equipamentos" value={details.bi?.assetCount || 0} /><KpiCard label="Linhas consumíveis" value={details.bi?.consumableLines || 0} /><KpiCard label="Transferências p/ técnico" value={details.bi?.technicianTransfers || 0} /></div>
        <DetailList title="Estoquistas/usuários vinculados" items={details.users || []} render={(u) => <><b>{u.name}</b><span>{u.email} • {u.role} • {u.status}</span><small>Limite de aprovação: {brl(u.approvalLimit)}</small></>} />
        <DetailList title="Técnicos com estoque padrão vinculado" items={details.technicians || []} render={(t) => <><b>{t.name}</b><span>{t.email || '-'} • {t.status}</span><small>{(t.serviceCities || []).join(', ')}</small></>} />
        <DetailList title="Equipamentos serializados no estoque" items={details.assets || []} render={(a) => <><b>{a.serialNumber}</b><span>{a.Material?.name} • {a.status} • {brl(a.acquisitionCost || a.Material?.unitCost)}</span></>} />
        <DetailList title="Materiais consumíveis no estoque" items={details.balances || []} render={(b) => <><b>{b.Material?.name}</b><span>{b.quantity} {b.Material?.unit} • {brl(Number(b.quantity || 0) * Number(b.Material?.unitCost || 0))}</span></>} />
        <DetailList title="Histórico e BI de movimentações deste estoque" items={details.movements || []} render={(m) => <><b>{m.reference || m.type} • {dt(m.movementAt)}</b><span>{m.Material?.name || '-'} • Qtd. {m.quantity} • {m.serialNumber || 'sem serial'}</span><small>{m.fromWarehouse?.name || m.fromOwnerType || '-'} → {m.toWarehouse?.name || m.toOwnerType || m.toTechnician?.name || '-'} • Operador: {m.createdBy?.name || 'Sistema'}</small></>} />
      </>}
    </DetailsModal>
  </div>;
}
