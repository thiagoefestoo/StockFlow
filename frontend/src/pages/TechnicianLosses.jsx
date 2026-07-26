import { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import api from '../services/api';
import Modal from '../components/Modal';
import DetailsModal, { DetailGrid, DetailList } from '../components/DetailsModal';
import AttachmentPreview from '../components/AttachmentPreview';
import KpiCard from '../components/KpiCard';
import OperationReviewModal from '../components/OperationReviewModal';
import { duplicateItemIds, duplicateSerials, optionsWithoutSelected, selectedSerialsExcept } from '../utils/operationSelections';
import { formatQuantity, formatQuantityWithUnit } from '../utils/formatQuantity';
import { LOSS_REASON_OPTIONS } from '../constants/operationOptions';

function brl(value) { return Number(value || 0).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' }); }
function dt(value) { return value ? new Date(value).toLocaleString('pt-BR') : '-'; }
function qtyLabel(value, unit = '') { return formatQuantityWithUnit(value, unit); }
function lossNature(loss) {
  return (loss?.TransferItems || []).some((item) => item.itemType === 'ferramenta' || item.TechnicianTool)
    ? 'Ferramenta'
    : 'Material';
}
function lossItemName(item) {
  return item?.itemDescription || item?.TechnicianTool?.name || item?.Material?.name || 'Item';
}

const emptyForm = {
  lossType: 'material',
  technicianId: '',
  reason: '',
  notes: '',
  attachmentName: '',
  attachmentData: '',
  items: [],
  toolIds: [],
};

export default function TechnicianLosses() {
  const [technicians, setTechnicians] = useState([]);
  const [losses, setLosses] = useState([]);
  const [stock, setStock] = useState(null);
  const [toolsData, setToolsData] = useState(null);
  const [modal, setModal] = useState(false);
  const [details, setDetails] = useState(null);
  const [form, setForm] = useState(emptyForm);
  const [message, setMessage] = useState('');
  const [serialSearch, setSerialSearch] = useState('');
  const [toolSearch, setToolSearch] = useState('');
  const [reviewOpen, setReviewOpen] = useState(false);
  const [saving, setSaving] = useState(false);

  async function load() {
    const [techRes, lossRes] = await Promise.all([
      api.get('/technicians'),
      api.get('/stock/technician-losses'),
    ]);
    setTechnicians(techRes.data.data || []);
    setLosses(lossRes.data.data || []);
  }

  async function loadTechResources(technicianId) {
    if (!technicianId) {
      setStock(null);
      setToolsData(null);
      return;
    }
    const [stockRes, toolsRes] = await Promise.all([
      api.get(`/stock/technician-box/${technicianId}`),
      api.get(`/technicians/${technicianId}/tools`),
    ]);
    setStock(stockRes.data.data);
    setToolsData(toolsRes.data.data);
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

  const availableTools = useMemo(() => {
    const query = toolSearch.trim().toLowerCase();
    return (toolsData?.tools || [])
      .filter((tool) => tool.status === 'com_tecnico')
      .filter((tool) => !query || [tool.name, tool.brand, tool.serialNumber].filter(Boolean).join(' ').toLowerCase().includes(query))
      .sort((a, b) => String(a.name).localeCompare(String(b.name)));
  }, [toolsData, toolSearch]);

  function assetsByMaterial(materialId) {
    const query = serialSearch.trim().toLowerCase();
    return (stock?.assets || [])
      .filter((asset) => Number(asset.materialId) === Number(materialId))
      .filter((asset) => !query || [asset.serialNumber, asset.mac, asset.Material?.name].filter(Boolean).join(' ').toLowerCase().includes(query));
  }

  function selectedTechnician() {
    return technicians.find((tech) => String(tech.id) === String(form.technicianId));
  }

  function openNew() {
    setForm(emptyForm);
    setStock(null);
    setToolsData(null);
    setSerialSearch('');
    setToolSearch('');
    setMessage('');
    setModal(true);
  }

  function changeLossType(lossType) {
    setForm({ ...form, lossType, items: [], toolIds: [] });
    setSerialSearch('');
    setToolSearch('');
    setMessage('');
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

  function toggleTool(toolId) {
    const current = new Set((form.toolIds || []).map(Number));
    if (current.has(Number(toolId))) current.delete(Number(toolId));
    else current.add(Number(toolId));
    setForm({ ...form, toolIds: Array.from(current) });
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

    if (form.lossType === 'ferramenta') {
      if (!form.toolIds.length) return 'Selecione ao menos uma ferramenta da ficha do técnico.';
      const activeIds = new Set((toolsData?.tools || []).filter((tool) => tool.status === 'com_tecnico').map((tool) => Number(tool.id)));
      if (form.toolIds.some((id) => !activeIds.has(Number(id)))) return 'Uma ferramenta selecionada não está mais disponível na ficha do técnico.';
      return null;
    }

    if (!form.items.length) return 'Adicione ao menos um material perdido.';
    if (duplicateItemIds(form.items).length) return 'O mesmo material não pode ser selecionado mais de uma vez.';
    const repeatedSerials = duplicateSerials(form.items);
    if (repeatedSerials.length) return `O mesmo serial não pode ser selecionado mais de uma vez: ${repeatedSerials.join(', ')}.`;
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

  function openReview() {
    const validationError = validate();
    if (validationError) { setMessage(validationError); return; }
    setReviewOpen(true);
  }

  async function save() {
    if (saving) return;
    const validationError = validate();
    if (validationError) {
      setMessage(validationError);
      return;
    }
    try {
      setSaving(true);
      await api.post('/stock/technician-box/loss', {
        ...form,
        items: form.lossType === 'material' ? form.items.map((item) => ({
          materialId: item.materialId,
          quantity: Number(item.quantity || 0),
          serialNumbers: Array.isArray(item.serialNumbers) ? item.serialNumbers : [],
        })) : [],
        toolIds: form.lossType === 'ferramenta' ? form.toolIds.map(Number) : [],
      });
      setMessage(form.lossType === 'ferramenta'
        ? 'Perda registrada. A ferramenta saiu da ficha do técnico e a guia entrou na fila de assinatura.'
        : 'Perda registrada. O material saiu da caixa do técnico e a guia entrou na fila de assinatura.');
      setReviewOpen(false);
      setModal(false);
      setForm(emptyForm);
      setStock(null);
      setToolsData(null);
      await load();
    } catch (error) {
      setMessage(error.response?.data?.message || error.message || 'Erro ao registrar perda.');
    } finally {
      setSaving(false);
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
    setForm({ ...form, technicianId: value, items: [], toolIds: [] });
    setMessage('');
    await loadTechResources(value);
  }

  const selectedTools = useMemo(() => {
    const ids = new Set((form.toolIds || []).map(Number));
    return (toolsData?.tools || []).filter((tool) => ids.has(Number(tool.id)));
  }, [form.toolIds, toolsData]);

  const totalPreview = form.lossType === 'ferramenta'
    ? selectedTools.reduce((sum, tool) => sum + Number(tool.referenceValue || 0), 0)
    : form.items.reduce((sum, item) => {
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

  const itemCount = form.lossType === 'ferramenta' ? form.toolIds.length : form.items.length;
  const reviewItems = form.lossType === 'ferramenta'
    ? selectedTools.map((tool) => ({
      key: `tool-${tool.id}`,
      name: tool.name,
      detail: `${tool.brand || 'Sem marca'} • patrimônio/série ${tool.serialNumber || '-'}`,
      quantity: 1,
      unit: 'un',
      serialCount: tool.serialNumber ? 1 : 0,
      serialPreview: tool.serialNumber || '',
      totalValue: Number(tool.referenceValue || 0),
    }))
    : form.items.map((item, index) => {
      const material = materialOptions.find((row) => Number(row.id) === Number(item.materialId));
      const serials = Array.isArray(item.serialNumbers) ? item.serialNumbers : [];
      const quantity = material?.requiresSerial ? serials.length : Number(item.quantity || 0);
      const totalValue = material?.requiresSerial
        ? serials.reduce((sum, serial) => sum + Number((stock?.assets || []).find((asset) => asset.serialNumber === serial)?.acquisitionCost || material?.unitCost || 0), 0)
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
  const reviewQuantity = reviewItems.reduce((sum, item) => sum + Number(item.quantity || 0), 0);

  return (
    <div className="page-grid technician-loss-page">
      <div className="toolbar">
        <div>
          <h2>Perdas e descontos do técnico</h2>
          <p>Registre materiais ou ferramentas perdidas, gere a guia e mantenha a fila de assinatura centralizada.</p>
        </div>
        <button onClick={openNew}>Registrar perda</button>
      </div>

      {message && <div className="alert danger">{message}</div>}

      <section className="kpi-grid small">
        <KpiCard label="Perdas registradas" value={losses.length} hint="Quantidade de ocorrências de perda ou desconto já registradas." />
        <KpiCard label="Valor em desconto/perda" value={brl(losses.reduce((s, l) => s + Number(l.totalValue || 0), 0))} hint="Soma financeira dos itens baixados por perda ou desconto." tone="warning" />
        <KpiCard label="Guias pendentes" value={losses.filter((l) => l.status === 'pendente_assinatura').length} hint="Guias de perda que ainda aguardam documento ou assinatura." />
      </section>

      <section className="panel">
        <div className="table-wrap">
          <table>
            <thead><tr><th>Guia</th><th>Tipo</th><th>Técnico</th><th>Data</th><th>Itens</th><th>Valor</th><th>Status</th><th>Documento</th><th className="action-cell">Opções</th></tr></thead>
            <tbody>
              {losses.map((loss) => <tr key={loss.id}>
                <td><strong>{loss.transferNumber}</strong></td>
                <td><span className={`badge ${lossNature(loss) === 'Ferramenta' ? 'warning' : 'info'}`}>{lossNature(loss)}</span></td>
                <td>{loss.Technician?.name || '-'}</td>
                <td>{dt(loss.deliveredAt || loss.createdAt)}</td>
                <td>{formatQuantity(loss.totalQuantity)}</td>
                <td>{brl(loss.totalValue)}</td>
                <td><span className={`badge ${loss.status}`}>{loss.status}</span></td>
                <td>{loss.attachmentName ? <AttachmentPreview compact name={loss.attachmentName} data={loss.attachmentData} /> : <input type="file" accept="image/*,.pdf" onChange={(e) => signLoss(loss.id, e.target.files?.[0])} />}</td>
                <td><div className="action-toolbar"><button className="info" onClick={() => setDetails(loss)}>Detalhes</button><Link className="ghost" to={`/perdas-tecnico/${loss.id}`}>Guia</Link></div></td>
              </tr>)}
              {!losses.length && <tr><td colSpan="9"><div className="empty-state">Nenhuma perda registrada.</div></td></tr>}
            </tbody>
          </table>
        </div>
      </section>

      <Modal open={modal} title="Registrar perda/desconto" onClose={() => !saving && setModal(false)} footer={<><button className="ghost" disabled={saving} onClick={() => setModal(false)}>Cancelar</button><button disabled={saving} onClick={openReview}>Revisar perda/desconto</button></>}>
        <div className="loss-summary-card">
          <article><small>Técnico</small><strong>{selectedTechnician()?.name || 'Selecione'}</strong></article>
          <article><small>Itens selecionados</small><strong>{itemCount}</strong></article>
          <article><small>Valor para desconto</small><strong>{brl(totalPreview)}</strong></article>
        </div>

        <div className="form-grid">
          <label>Tipo de baixa<select value={form.lossType} onChange={(e) => changeLossType(e.target.value)}><option value="material">Material da caixa do técnico</option><option value="ferramenta">Ferramenta da ficha do técnico</option></select></label>
          <label>Técnico responsável<select value={form.technicianId} onChange={(e) => onSelectTechnician(e.target.value)}><option value="">Selecione</option>{technicians.map((tech) => <option key={tech.id} value={tech.id}>{tech.name} — {tech.ContractorCompany?.name || 'sem empresa'}</option>)}</select></label>
          <label>Motivo da perda/desconto<input list="loss-reason-options" value={form.reason} onChange={(e) => setForm({ ...form, reason: e.target.value })} placeholder="Selecione um motivo padrão ou digite outro" /><datalist id="loss-reason-options">{LOSS_REASON_OPTIONS.map((option) => <option key={option} value={option} />)}</datalist></label>
          <label className="span-2">Observações<textarea rows="3" value={form.notes} onChange={(e) => setForm({ ...form, notes: e.target.value })} placeholder="Descreva detalhes da ocorrência, protocolo interno ou autorização." /></label>
          <label className="span-2">Documento assinado/reconhecimento<input type="file" accept="image/*,.pdf" onChange={async (e) => { const file = await readFile(e.target.files?.[0]); if (file) setForm({ ...form, attachmentName: file.name, attachmentData: file.data }); }} /><small>Opcional na abertura: também será possível anexar depois na fila.</small></label>{form.attachmentName && <AttachmentPreview compact name={form.attachmentName} data={form.attachmentData} label="Documento selecionado" />}
        </div>

        {!form.technicianId && <div className="empty-state small">Selecione um técnico para carregar os itens sob responsabilidade dele.</div>}

        {form.lossType === 'material' && <>
          <div className="subtoolbar"><h4>Material perdido</h4><button type="button" className="ghost" onClick={addItem}>Adicionar item</button></div>
          {form.technicianId && !materialOptions.length && <div className="empty-state small">Este técnico não possui material em caixa.</div>}
          {form.items.map((item, i) => {
            const material = materialOptions.find((m) => Number(m.id) === Number(item.materialId));
            const availableMaterials = optionsWithoutSelected(materialOptions, form.items, i);
            const serialsSelectedElsewhere = selectedSerialsExcept(form.items, i);
            const serialAssets = assetsByMaterial(item.materialId)
              .filter((asset) => !serialsSelectedElsewhere.has(String(asset.serialNumber || '').toUpperCase()));
            return <div className="item-card loss-item-card" key={i}>
              <div className="item-head"><strong>Item {i + 1}</strong><button type="button" className="ghost danger-outline" onClick={() => removeItem(i)}>Remover</button></div>
              <div className="form-grid">
                <label>Material<select value={item.materialId} onChange={(e) => updateItem(i, { materialId: e.target.value, serialNumbers: [], quantity: 1 })}><option value="">Selecione o material</option>{availableMaterials.map((m) => <option key={m.id} value={m.id}>{m.name} — disponível {qtyLabel(m.availableQty, m.unit)}</option>)}</select></label>
                {!material?.requiresSerial && <label>Quantidade perdida<input type="number" min="1" max={Number(material?.availableQty || 0)} step="1" value={item.quantity} onChange={(e) => updateItem(i, { quantity: e.target.value })} /><small>Disponível: {qtyLabel(material?.availableQty, material?.unit)}</small></label>}
              </div>
              {material?.requiresSerial && <div className="serial-picker"><div className="serial-picker-head"><div><strong>Selecione o(s) serial(is) perdido(s)</strong><span>{serialAssets.length} disponível(is) na caixa do técnico</span></div><input value={serialSearch} onChange={(e) => setSerialSearch(e.target.value)} placeholder="Buscar serial..." /></div><div className="serial-list">{serialAssets.map((asset) => { const checked = (item.serialNumbers || []).includes(asset.serialNumber); return <button type="button" className={`serial-chip ${checked ? 'selected' : ''}`} key={asset.id} onClick={() => toggleSerial(i, asset.serialNumber)}><span><b>{asset.serialNumber}</b><small>{asset.Material?.name || material.name} • {brl(asset.acquisitionCost || material.unitCost)}</small></span><em>{checked ? 'Selecionado' : 'Selecionar'}</em></button>; })}</div>{!serialAssets.length && <div className="empty-state small">Nenhum serial disponível para este material na caixa do técnico.</div>}</div>}
            </div>;
          })}
        </>}

        {form.lossType === 'ferramenta' && <>
          <div className="subtoolbar"><div><h4>Ferramentas disponíveis na ficha</h4><small>Somente ferramentas que ainda estão com o técnico.</small></div><input className="loss-tool-search" value={toolSearch} onChange={(e) => setToolSearch(e.target.value)} placeholder="Buscar ferramenta ou patrimônio..." /></div>
          {form.technicianId && !availableTools.length && <div className="empty-state small">Este técnico não possui ferramentas ativas na ficha.</div>}
          <div className="loss-tool-list">
            {availableTools.map((tool) => {
              const selected = form.toolIds.map(Number).includes(Number(tool.id));
              return <button type="button" key={tool.id} className={`loss-tool-card ${selected ? 'selected' : ''}`} onClick={() => toggleTool(tool.id)}>
                <span><b>{tool.name}</b><small>{tool.brand || 'Sem marca'} • Patrimônio/série: {tool.serialNumber}</small><small>Em custódia desde {dt(tool.deliveredAt)}</small></span>
                <strong>{brl(tool.referenceValue)}</strong>
                <em>{selected ? 'Selecionada' : 'Selecionar'}</em>
              </button>;
            })}
          </div>
        </>}

        <div className="viz-callout">Ao registrar, o item sai da responsabilidade do técnico, entra no histórico de perda/desconto e a guia fica na fila para anexar o documento assinado.</div>
      </Modal>

      <OperationReviewModal
        open={reviewOpen}
        title="Revisar perda ou desconto"
        description="Confira técnico, motivo, itens e valores. A baixa só será registrada após a confirmação."
        metadata={[
          { label: 'Técnico responsável', value: selectedTechnician()?.name },
          { label: 'Tipo de baixa', value: form.lossType === 'ferramenta' ? 'Ferramenta da ficha' : 'Material da caixa' },
          { label: 'Motivo', value: form.reason },
          { label: 'Documento', value: form.attachmentName || 'Será anexado posteriormente' },
        ]}
        items={reviewItems}
        totalQuantity={reviewQuantity}
        totalValue={totalPreview}
        warning="Ao confirmar, os itens sairão da responsabilidade do técnico e uma guia de perda/desconto será criada."
        loading={saving}
        confirmLabel="Confirmar perda e gerar guia"
        onCancel={() => setReviewOpen(false)}
        onConfirm={save}
      />

      <DetailsModal open={!!details} title={`Detalhes da perda ${details?.transferNumber || ''}`} onClose={() => setDetails(null)} footer={<><button className="ghost" onClick={() => setDetails(null)}>Fechar</button>{details && <Link className="ghost" to={`/perdas-tecnico/${details.id}`}>Abrir guia</Link>}</>}>
        {details && <><DetailGrid fields={[["Guia", details.transferNumber], ["Tipo", lossNature(details)], ["Técnico", details.Technician?.name], ["Status", details.status], ["Data", details.deliveredAt], ["Qtd. total", formatQuantity(details.totalQuantity)], ["Valor do desconto", brl(details.totalValue)], ["Documento", details.attachmentName || 'Sem anexo'], ["Observações", details.notes]]} />{details.attachmentName && <AttachmentPreview name={details.attachmentName} data={details.attachmentData} label="Documento de reconhecimento" />}<DetailList title="Itens baixados por perda" items={details.TransferItems || []} render={(item) => <><b>{lossItemName(item)}</b><span>{item.itemType === 'ferramenta' ? 'Ferramenta' : 'Material'} • Qtd. {formatQuantity(item.quantity)} • {item.serialNumber || 'sem serial'} • {brl(item.totalCost)}</span></>} /></>}
      </DetailsModal>
    </div>
  );
}
