import { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import api from '../services/api';
import Modal from '../components/Modal';
import DetailsModal, { DetailGrid, DetailList } from '../components/DetailsModal';
import { useAuth } from '../contexts/AuthContext';

function brl(value) { return Number(value || 0).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' }); }
function dt(value) { return value ? new Date(value).toLocaleString('pt-BR') : '-'; }

export default function Transfers() {
  const { isAdmin } = useAuth();
  const [transfers, setTransfers] = useState([]);
  const [technicians, setTechnicians] = useState([]);
  const [materials, setMaterials] = useState([]);
  const [availableAssets, setAvailableAssets] = useState([]);
  const [modal, setModal] = useState(false);
  const [details, setDetails] = useState(null);
  const [edit, setEdit] = useState({ open: false, item: null, form: {} });
  const [form, setForm] = useState({ technicianId: '', notes: '', items: [] });
  const [assetSearch, setAssetSearch] = useState('');

  async function load() {
    const [t, tec, mat] = await Promise.all([
      api.get('/transfers'),
      api.get('/technicians'),
      api.get('/materials'),
    ]);
    setTransfers(t.data.data);
    setTechnicians(tec.data.data);
    setMaterials(mat.data.data);
  }

  async function loadAvailableAssets() {
    const res = await api.get('/stock/assets?ownerType=estoque&status=em_estoque&limit=2000');
    setAvailableAssets(res.data.data || []);
  }

  useEffect(() => { load(); }, []);
  useEffect(() => { if (modal) loadAvailableAssets(); }, [modal]);

  const stockByMaterial = useMemo(() => {
    const map = {};
    for (const asset of availableAssets) {
      map[asset.materialId] = map[asset.materialId] || [];
      map[asset.materialId].push(asset);
    }
    return map;
  }, [availableAssets]);

  function addItem() {
    setForm({ ...form, items: [...form.items, { materialId: materials[0]?.id || '', quantity: 1, serialNumbers: [] }] });
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
    updateItem(i, { serialNumbers: Array.from(selected), quantity: selected.size });
  }

  async function save() {
    const payload = {
      ...form,
      items: form.items.map((it) => ({
        ...it,
        quantity: Number(it.quantity || 0),
        serialNumbers: Array.isArray(it.serialNumbers) ? it.serialNumbers : [],
      })),
    };
    await api.post('/transfers', payload);
    setModal(false);
    setForm({ technicianId: '', notes: '', items: [] });
    setAssetSearch('');
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

  const selectedTechnician = technicians.find((t) => String(t.id) === String(form.technicianId));
  const totalPreview = form.items.reduce((sum, item) => {
    const material = materials.find((m) => Number(m.id) === Number(item.materialId));
    if (!material) return sum;
    if (material.requiresSerial) return sum + (item.serialNumbers || []).reduce((s, serial) => s + Number(availableAssets.find((a) => a.serialNumber === serial)?.acquisitionCost || material.unitCost || 0), 0);
    return sum + Number(item.quantity || 0) * Number(material.unitCost || 0);
  }, 0);

  return (
    <div className="page-grid transfer-page">
      <div className="toolbar">
        <div><h2>🔁 Transferir material para técnico</h2><p>Selecione materiais, veja seriais disponíveis em estoque e gere a guia para assinatura.</p></div>
        <button onClick={() => setModal(true)}>➕ Nova transferência</button>
      </div>

      <section className="panel"><div className="table-wrap"><table><thead><tr><th>Guia</th><th>Técnico</th><th>Data</th><th>Qtd</th><th>Valor</th><th>Status</th><th>Assinatura</th><th className="action-cell">Opções</th></tr></thead><tbody>{transfers.map((tr) => <tr key={tr.id}><td>{tr.transferNumber}</td><td>{tr.Technician?.name}</td><td>{dt(tr.deliveredAt)}</td><td>{tr.totalQuantity}</td><td>{brl(tr.totalValue)}</td><td><span className={`badge ${tr.status}`}>{tr.status}</span></td><td><input type="file" accept="image/*,.pdf" onChange={(e) => sign(tr.id, e.target.files?.[0])} /></td><td><div className="action-toolbar"><button className="info" onClick={() => setDetails(tr)}>🔎 Detalhes</button><Link className="ghost" to={`/transferencias/${tr.id}`}>🖨️ Guia</Link>{isAdmin && <button className="ghost" onClick={() => setEdit({ open: true, item: tr, form: { notes: tr.notes || '', status: tr.status || 'pendente_assinatura', deliveredAt: tr.deliveredAt ? String(tr.deliveredAt).slice(0, 16) : '', signatureResponsible: tr.signatureResponsible || '' } })}>✏️ Editar</button>}</div></td></tr>)}</tbody></table></div></section>

      <Modal open={modal} title="📦 Nova transferência para técnico" onClose={() => setModal(false)} footer={<><button className="ghost" onClick={() => setModal(false)}>Cancelar</button><button onClick={save}>Gerar guia e enviar para caixa</button></>}>
        <div className="transfer-wizard">
          <section className="transfer-summary-card">
            <div><small>Técnico selecionado</small><strong>{selectedTechnician?.name || 'Selecione um técnico'}</strong><span>{selectedTechnician?.ContractorCompany?.name || 'Carga individual'}</span></div>
            <div><small>Itens na guia</small><strong>{form.items.length}</strong><span>{form.items.reduce((s, i) => s + Number(i.quantity || (i.serialNumbers || []).length || 0), 0)} unidade(s)</span></div>
            <div><small>Valor previsto</small><strong>{brl(totalPreview)}</strong><span>Equipamentos + consumíveis</span></div>
          </section>
          <div className="form-grid"><label>👷 Técnico<select value={form.technicianId} onChange={(e) => setForm({ ...form, technicianId: e.target.value })}><option value="">Selecione</option>{technicians.map((t) => <option key={t.id} value={t.id}>{t.name} — {t.ContractorCompany?.name || 'sem empresa'}</option>)}</select></label><label>📝 Observações<input value={form.notes} onChange={(e) => setForm({ ...form, notes: e.target.value })} placeholder="Motivo, rota, lote, responsável..." /></label></div>
          <div className="subtoolbar"><h4>Itens da guia</h4><button className="ghost" onClick={addItem}>➕ Adicionar item</button></div>
          {form.items.length === 0 && <div className="empty-state">Clique em “Adicionar item” para montar a carga do técnico.</div>}
          {form.items.map((item, i) => {
            const material = materials.find((m) => Number(m.id) === Number(item.materialId));
            const serialAssets = (stockByMaterial[item.materialId] || []).filter((asset) => {
              const q = assetSearch.trim().toLowerCase();
              if (!q) return true;
              return [asset.serialNumber, asset.mac, asset.brand, asset.model].filter(Boolean).join(' ').toLowerCase().includes(q);
            });
            return (
              <div className="item-card transfer-item-card" key={i}>
                <div className="item-head"><strong>📦 Item {i + 1}</strong><button className="ghost danger-outline" onClick={() => removeItem(i)}>Remover</button></div>
                <div className="form-grid"><label>Material<select value={item.materialId} onChange={(e) => updateItem(i, { materialId: e.target.value, serialNumbers: [], quantity: 1 })}>{materials.map((m) => <option key={m.id} value={m.id}>{m.name} — estoque {m.mainStock}</option>)}</select></label>{!material?.requiresSerial && <label>Quantidade<input type="number" min="0" step="0.001" value={item.quantity} onChange={(e) => updateItem(i, { quantity: e.target.value })} /></label>}</div>
                {material?.requiresSerial && <div className="serial-picker"><div className="serial-picker-head"><div><strong>🏷️ Seriais disponíveis no estoque</strong><span>{serialAssets.length} disponível(is) • {item.serialNumbers?.length || 0} selecionado(s)</span></div><input value={assetSearch} onChange={(e) => setAssetSearch(e.target.value)} placeholder="Buscar serial, MAC, marca..." /></div><div className="serial-grid">{serialAssets.map((asset) => { const checked = (item.serialNumbers || []).includes(asset.serialNumber); return <button type="button" key={asset.id} className={`serial-chip ${checked ? 'selected' : ''}`} onClick={() => toggleSerial(i, asset.serialNumber)}><b>{checked ? '✅' : '🏷️'} {asset.serialNumber}</b><span>{asset.Material?.name} • {asset.brand || '-'} {asset.model || ''}</span><small>{asset.mac || 'sem MAC'} • {brl(asset.acquisitionCost)}</small></button>; })}</div>{serialAssets.length === 0 && <div className="empty-state">Nenhum serial disponível para esse material no estoque.</div>}</div>}
              </div>
            );
          })}
        </div>
      </Modal>

      <Modal open={edit.open} title={`✏️ Editar guia ${edit.item?.transferNumber || ''}`} onClose={() => setEdit({ open: false, item: null, form: {} })} footer={<><button className="ghost" onClick={() => setEdit({ open: false, item: null, form: {} })}>Cancelar</button><button onClick={saveEdit}>Salvar alteração</button></>}>
        <div className="form-grid"><label>Status<select value={edit.form.status || ''} onChange={(e) => setEdit({ ...edit, form: { ...edit.form, status: e.target.value } })}><option value="pendente_assinatura">Pendente assinatura</option><option value="assinado">Assinado</option><option value="cancelado">Cancelado</option></select></label><label>Data de entrega<input type="datetime-local" value={edit.form.deliveredAt || ''} onChange={(e) => setEdit({ ...edit, form: { ...edit.form, deliveredAt: e.target.value } })} /></label><label>Responsável assinatura<input value={edit.form.signatureResponsible || ''} onChange={(e) => setEdit({ ...edit, form: { ...edit.form, signatureResponsible: e.target.value } })} /></label></div><label>Observações<textarea rows="4" value={edit.form.notes || ''} onChange={(e) => setEdit({ ...edit, form: { ...edit.form, notes: e.target.value } })} /></label><div className="viz-callout">🛡️ Alterações administrativas gravam histórico de auditoria.</div>
      </Modal>

      <DetailsModal open={!!details} title={`🔎 Detalhes da guia ${details?.transferNumber || ''}`} onClose={() => setDetails(null)} footer={<><button className="ghost" onClick={() => setDetails(null)}>Fechar</button>{details && <Link className="ghost" to={`/transferencias/${details.id}`}>Abrir guia</Link>}{isAdmin && details && <button onClick={() => { setEdit({ open: true, item: details, form: { notes: details.notes || '', status: details.status || 'pendente_assinatura', deliveredAt: details.deliveredAt ? String(details.deliveredAt).slice(0, 16) : '', signatureResponsible: details.signatureResponsible || '' } }); setDetails(null); }}>Editar</button>}</>}>
        {details && <><DetailGrid fields={[["Guia", details.transferNumber], ["Técnico", details.Technician?.name], ["Status", details.status], ["Entregue em", details.deliveredAt], ["Assinada em", details.signedAt], ["Qtd. total", details.totalQuantity], ["Valor total", brl(details.totalValue)], ["Responsável", details.signatureResponsible], ["Anexo", details.attachmentName], ["Observações", details.notes]]} /><DetailList title="Itens transferidos" items={details.TransferItems || []} render={(item) => <><b>{item.Material?.name || 'Material'}</b><span>Qtd. {item.quantity} • {item.serialNumber || 'sem serial'} • {brl(item.totalCost)}</span></>} /></>}
      </DetailsModal>
    </div>
  );
}
