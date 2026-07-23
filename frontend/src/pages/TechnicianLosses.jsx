import { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import api from '../services/api';
import Modal from '../components/Modal';
import DetailsModal, { DetailGrid, DetailList } from '../components/DetailsModal';
import AttachmentPreview from '../components/AttachmentPreview';
import { formatQuantity, formatQuantityWithUnit } from '../utils/formatQuantity';

function brl(value) { return Number(value || 0).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' }); }
function dt(value) { return value ? new Date(value).toLocaleString('pt-BR') : '-'; }
function qtyLabel(value, unit = '') { return formatQuantityWithUnit(value, unit); }

const emptyForm = { technicianId: '', reason: '', notes: '', attachmentName: '', attachmentData: '', items: [] };

export default function TechnicianLosses() {
  const [technicians, setTechnicians] = useState([]);
  const [losses, setLosses] = useState([]);
  const [stock, setStock] = useState(null);
  const [modal, setModal] = useState(false);
  const [details, setDetails] = useState(null);
  const [form, setForm] = useState(emptyForm);
  const [message, setMessage] = useState('');
  const [serialSearch, setSerialSearch] = useState('');

  async function load() {
    const [techRes, lossRes] = await Promise.all([
      api.get('/technicians'),
      api.get('/stock/technician-losses'),
    ]);
    setTechnicians(techRes.data.data || []);
    setLosses(lossRes.data.data || []);
  }

  async function loadTechStock(technicianId) {
    if (!technicianId) {
      setStock(null);
      return;
    }
    const res = await api.get(`/stock/technician-box/${technicianId}`);
    setStock(res.data.data);
  }

  useEffect(() => { load(); }, []);

  const materialOptions = useMemo(() => {
    const map = new Map();
    for (const asset of stock?.assets || []) {
      if (asset.Material) map.set(asset.Material.id, { ...asset.Material, availableQty: (map.get(asset.Material.id)?.availableQty || 0) + 1 });
    }
    for (const balance of stock?.balances || []) {
      if (balance.Material) map.set(balance.Material.id, { ...balance.Material, availableQty: Number(balance.quantity || 0) });
    }
    return Array.from(map.values()).sort((a, b) => String(a.name).localeCompare(String(b.name)));
  }, [stock]);

  function assetsByMaterial(materialId) {
    const q = serialSearch.trim().toLowerCase();
    return (stock?.assets || [])
      .filter((asset) => Number(asset.materialId) === Number(materialId))
      .filter((asset) => !q || [asset.serialNumber, asset.mac, asset.Material?.name].filter(Boolean).join(' ').toLowerCase().includes(q));
  }

  function selectedTechnician() {
    return technicians.find((tech) => String(tech.id) === String(form.technicianId));
  }

  function openNew() {
    setForm(emptyForm);
    setStock(null);
    setSerialSearch('');
    setMessage('');
    setModal(true);
  }

  function addItem() {
    if (!form.technicianId) {
      setMessage('Selecione primeiro o técnico.');
      return;
    }
    setForm({ ...form, items: [...form.items, { materialId: '', quantity: 1, serialNumbers: [] }] });
  }

  function removeItem(index) {
    setForm({ ...form, items: form.items.filter((_, i) => i !== index) });
  }

  function updateItem(index, patch) {
    const items = [...form.items];
    items[index] = { ...items[index], ...patch };
    setForm({ ...form, items });
  }

  function toggleSerial(index, serialNumber) {
    const item = form.items[index];
    const current = new Set(item.serialNumbers || []);
    if (current.has(serialNumber)) current.delete(serialNumber);
    else current.add(serialNumber);
    updateItem(index, { serialNumbers: Array.from(current), quantity: current.size || 1 });
  }

  function readFile(file) {
    return new Promise((resolve, reject) => {
      if (!file) return resolve(null);
      const reader = new FileReader();
      reader.onload = () => resolve({ name: file.name, data: reader.result });
      reader.onerror = reject;
      reader.readAsDataURL(file);
    });
  }

  function validate() {
    if (!form.technicianId) return 'Selecione o técnico.';
    if (!form.reason.trim()) return 'Informe o motivo da perda/desconto.';
    if (!form.items.length) return 'Adicione ao menos um item perdido.';
    for (const item of form.items) {
      const material = materialOptions.find((m) => Number(m.id) === Number(item.materialId));
      if (!material) return 'Selecione o material em todos os itens adicionados.';
      if (material.requiresSerial) {
        if (!Array.isArray(item.serialNumbers) || !item.serialNumbers.length) return `Selecione pelo menos um serial perdido de ${material.name}.`;
      } else {
        const qty = Number(item.quantity || 0);
        const available = Number(material.availableQty || 0);
        if (qty <= 0) return `Informe uma quantidade válida para ${material.name}.`;
        if (qty > available) return `Saldo insuficiente na caixa do técnico para ${material.name}. Disponível: ${qtyLabel(available, material.unit)}.`;
      }
    }
    return null;
  }

  async function save() {
    const error = validate();
    if (error) {
      setMessage(error);
      return;
    }
    try {
      await api.post('/stock/technician-box/loss', {
        ...form,
        items: form.items.map((item) => ({
          materialId: item.materialId,
          quantity: Number(item.quantity || 0),
          serialNumbers: Array.isArray(item.serialNumbers) ? item.serialNumbers : [],
        })),
      });
      setMessage('Perda registrada. O material saiu da caixa do técnico e entrou no histórico/BI.');
      setModal(false);
      setForm(emptyForm);
      setStock(null);
      await load();
    } catch (error) {
      setMessage(error.response?.data?.message || error.message || 'Erro ao registrar perda.');
    }
  }

  async function signLoss(id, file) {
    if (!file) return;
    const attachment = await readFile(file);
    await api.post(`/transfers/${id}/sign`, {
      attachmentName: attachment.name,
      attachmentData: attachment.data,
      signatureResponsible: 'Documento de reconhecimento anexado',
    });
    await load();
  }

  async function onSelectTechnician(value) {
    setForm({ ...form, technicianId: value, items: [] });
    setMessage('');
    await loadTechStock(value);
  }

  const totalPreview = form.items.reduce((sum, item) => {
    const material = materialOptions.find((m) => Number(m.id) === Number(item.materialId));
    if (!material) return sum;
    if (material.requiresSerial) {
      return sum + (item.serialNumbers || []).reduce((acc, serial) => {
        const asset = (stock?.assets || []).find((a) => a.serialNumber === serial);
        return acc + Number(asset?.acquisitionCost || material.unitCost || 0);
      }, 0);
    }
    return sum + Number(item.quantity || 0) * Number(material.unitCost || 0);
  }, 0);

  return (
    <div className="page-grid technician-loss-page">
      <div className="toolbar">
        <div>
          <h2>Perdas e descontos do técnico</h2>
          <p>Registre material perdido, gere guia de reconhecimento e baixe automaticamente da caixa do técnico.</p>
        </div>
        <button onClick={openNew}>Registrar perda</button>
      </div>

      {message && <div className="alert danger">{message}</div>}

      <section className="kpi-grid small">
        <article><small>Perdas registradas</small><strong>{losses.length}</strong></article>
        <article><small>Valor em desconto/perda</small><strong>{brl(losses.reduce((s, l) => s + Number(l.totalValue || 0), 0))}</strong></article>
        <article><small>Guias pendentes</small><strong>{losses.filter((l) => l.status === 'pendente_assinatura').length}</strong></article>
      </section>

      <section className="panel">
        <div className="table-wrap">
          <table>
            <thead><tr><th>Guia</th><th>Técnico</th><th>Data</th><th>Itens</th><th>Valor</th><th>Status</th><th>Documento</th><th className="action-cell">Opções</th></tr></thead>
            <tbody>
              {losses.map((loss) => <tr key={loss.id}>
                <td><strong>{loss.transferNumber}</strong></td>
                <td>{loss.Technician?.name || '-'}</td>
                <td>{dt(loss.deliveredAt || loss.createdAt)}</td>
                <td>{formatQuantity(loss.totalQuantity)}</td>
                <td>{brl(loss.totalValue)}</td>
                <td><span className={`badge ${loss.status}`}>{loss.status}</span></td>
                <td>{loss.attachmentName ? <AttachmentPreview compact name={loss.attachmentName} data={loss.attachmentData} /> : <input type="file" accept="image/*,.pdf" onChange={(e) => signLoss(loss.id, e.target.files?.[0])} />}</td>
                <td><div className="action-toolbar"><button className="info" onClick={() => setDetails(loss)}>Detalhes</button><Link className="ghost" to={`/perdas-tecnico/${loss.id}`}>Guia</Link></div></td>
              </tr>)}
              {!losses.length && <tr><td colSpan="8"><div className="empty-state">Nenhuma perda registrada.</div></td></tr>}
            </tbody>
          </table>
        </div>
      </section>

      <Modal open={modal} title="Registrar perda/desconto de material" onClose={() => setModal(false)} footer={<><button className="ghost" onClick={() => setModal(false)}>Cancelar</button><button onClick={save}>Registrar perda e gerar guia</button></>}>
        <div className="loss-summary-card">
          <article><small>Técnico</small><strong>{selectedTechnician()?.name || 'Selecione'}</strong></article>
          <article><small>Itens</small><strong>{form.items.length}</strong></article>
          <article><small>Valor para desconto</small><strong>{brl(totalPreview)}</strong></article>
        </div>

        <div className="form-grid">
          <label>Técnico responsável<select value={form.technicianId} onChange={(e) => onSelectTechnician(e.target.value)}><option value="">Selecione</option>{technicians.map((tech) => <option key={tech.id} value={tech.id}>{tech.name} — {tech.ContractorCompany?.name || 'sem empresa'}</option>)}</select></label>
          <label>Motivo da perda/desconto<input value={form.reason} onChange={(e) => setForm({ ...form, reason: e.target.value })} placeholder="Ex.: material perdido, avaria, extravio..." /></label>
          <label className="span-2">Observações<textarea rows="3" value={form.notes} onChange={(e) => setForm({ ...form, notes: e.target.value })} placeholder="Descreva detalhes da ocorrência, protocolo interno ou autorização." /></label>
          <label className="span-2">Documento assinado/reconhecimento<input type="file" accept="image/*,.pdf" onChange={async (e) => { const file = await readFile(e.target.files?.[0]); if (file) setForm({ ...form, attachmentName: file.name, attachmentData: file.data }); }} /><small>Opcional na abertura: também será possível anexar depois na lista.</small></label>{form.attachmentName && <AttachmentPreview compact name={form.attachmentName} data={form.attachmentData} label="Documento selecionado" />}
        </div>

        <div className="subtoolbar"><h4>Material perdido</h4><button className="ghost" onClick={addItem}>Adicionar item</button></div>
        {!form.technicianId && <div className="empty-state small">Selecione um técnico para carregar a caixa dele.</div>}
        {form.technicianId && !materialOptions.length && <div className="empty-state small">Este técnico não possui material em caixa.</div>}

        {form.items.map((item, i) => {
          const material = materialOptions.find((m) => Number(m.id) === Number(item.materialId));
          const serialAssets = assetsByMaterial(item.materialId);
          return <div className="item-card loss-item-card" key={i}>
            <div className="item-head"><strong>Item {i + 1}</strong><button className="ghost danger-outline" onClick={() => removeItem(i)}>Remover</button></div>
            <div className="form-grid">
              <label>Material<select value={item.materialId} onChange={(e) => updateItem(i, { materialId: e.target.value, serialNumbers: [], quantity: 1 })}><option value="">Selecione o material</option>{materialOptions.map((m) => <option key={m.id} value={m.id}>{m.name} — disponível {qtyLabel(m.availableQty, m.unit)}</option>)}</select></label>
              {!material?.requiresSerial && <label>Quantidade perdida<input type="number" min="0" max={Number(material?.availableQty || 0)} step="0.001" value={item.quantity} onChange={(e) => updateItem(i, { quantity: e.target.value })} /><small>Disponível: {qtyLabel(material?.availableQty, material?.unit)}</small></label>}
            </div>
            {material?.requiresSerial && <div className="serial-picker"><div className="serial-picker-head"><div><strong>Selecione o(s) serial(is) perdido(s)</strong><span>{serialAssets.length} disponível(is) na caixa do técnico</span></div><input value={serialSearch} onChange={(e) => setSerialSearch(e.target.value)} placeholder="Buscar serial..." /></div><div className="serial-list">{serialAssets.map((asset) => { const checked = (item.serialNumbers || []).includes(asset.serialNumber); return <button type="button" className={`serial-chip ${checked ? 'selected' : ''}`} key={asset.id} onClick={() => toggleSerial(i, asset.serialNumber)}><span><b>{asset.serialNumber}</b><small>{asset.Material?.name || material.name} • {brl(asset.acquisitionCost || material.unitCost)}</small></span><em>{checked ? 'Selecionado' : 'Selecionar'}</em></button>; })}</div>{!serialAssets.length && <div className="empty-state small">Nenhum serial disponível para este material na caixa do técnico.</div>}</div>}
          </div>;
        })}
        <div className="viz-callout">Ao registrar, o material sai da caixa do técnico, entra no histórico como perda, alimenta os BIs e gera uma guia para assinatura/reconhecimento.</div>
      </Modal>

      <DetailsModal open={!!details} title={`Detalhes da perda ${details?.transferNumber || ''}`} onClose={() => setDetails(null)} footer={<><button className="ghost" onClick={() => setDetails(null)}>Fechar</button>{details && <Link className="ghost" to={`/perdas-tecnico/${details.id}`}>Abrir guia</Link>}</>}>
        {details && <><DetailGrid fields={[["Guia", details.transferNumber], ["Técnico", details.Technician?.name], ["Status", details.status], ["Data", details.deliveredAt], ["Qtd. total", formatQuantity(details.totalQuantity)], ["Valor do desconto", brl(details.totalValue)], ["Documento", details.attachmentName || 'Sem anexo'], ["Observações", details.notes]]} />{details.attachmentName && <AttachmentPreview name={details.attachmentName} data={details.attachmentData} label="Documento de reconhecimento" />}<DetailList title="Itens baixados por perda" items={details.TransferItems || []} render={(item) => <><b>{item.Material?.name || 'Material'}</b><span>Qtd. {formatQuantity(item.quantity)} • {item.serialNumber || 'sem serial'} • {brl(item.totalCost)}</span></>} /></>}
      </DetailsModal>
    </div>
  );
}
