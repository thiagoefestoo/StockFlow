import { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import api from '../services/api';
import Modal from '../components/Modal';
import DetailsModal, { DetailGrid, DetailList } from '../components/DetailsModal';
import KpiCard from '../components/KpiCard';
import AttachmentPreview from '../components/AttachmentPreview';
import { useAuth } from '../contexts/AuthContext';
import { formatQuantity, formatQuantityInput, formatQuantityLabel } from '../utils/formatQuantity';

const empty = {
  name: '',
  document: '',
  phone: '',
  email: '',
  type: 'interno',
  status: 'ativo',
  companyId: '',
  serviceCitiesText: '',
  defaultWarehouseId: '',
  createPortalUser: false,
  portalPassword: '',
  mustChangePassword: true,
  transferApprovalLimit: 500,
};

const emptyTool = { name: '', serialNumber: '', brand: '', referenceValue: '', notes: '' };
const emptyRemoval = { status: 'devolvida', removalReason: '', replacementName: '', replacementSerial: '', replacementBrand: '', replacementValue: '' };
const emptyToolDocument = { file: null, signedAt: '', notes: '' };
const TOOL_STATUS_LABELS = { com_tecnico: 'Com o técnico', substituida: 'Substituída', perdida: 'Perdida', desgaste: 'Baixada por desgaste', devolvida: 'Devolvida' };

function brl(value) { return Number(value || 0).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' }); }
function dt(value) { return value ? new Date(value).toLocaleString('pt-BR') : '-'; }
function citiesToText(value) { return Array.isArray(value) ? value.join(', ') : ''; }
function textToCities(value) { return String(value || '').split(',').map((item) => item.trim()).filter(Boolean); }
function readFileAsDataUrl(file) { return new Promise((resolve, reject) => { const reader = new FileReader(); reader.onload = () => resolve(reader.result); reader.onerror = reject; reader.readAsDataURL(file); }); }

function formFromTechnician(technician) {
  return {
    ...empty,
    ...technician,
    companyId: technician.companyId || '',
    defaultWarehouseId: technician.defaultWarehouseId || '',
    serviceCitiesText: citiesToText(technician.serviceCities),
    createPortalUser: !!technician.portalUser,
    portalPassword: '',
    mustChangePassword: technician.portalUser ? !!technician.portalUser.mustChangePassword : true,
  };
}

export default function Technicians() {
  const { isAdmin, canAccessModule } = useAuth();
  const canEditTechnician = isAdmin || canAccessModule('technicianEdit');
  const canManageTransferLimit = isAdmin || canAccessModule('technicianTransferLimitManage');
  const [technicians, setTechnicians] = useState([]);
  const [companies, setCompanies] = useState([]);
  const [warehouses, setWarehouses] = useState([]);
  const [modal, setModal] = useState(false);
  const [details, setDetails] = useState({ open: false, technician: null, stock: null });
  const [form, setForm] = useState(empty);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [limitModal, setLimitModal] = useState({ open: false, technician: null, value: 500 });
  const [limitSaving, setLimitSaving] = useState(false);
  const [limitError, setLimitError] = useState('');
  const canViewTools = isAdmin || canAccessModule('technicianTools');
  const canEditTools = isAdmin || canAccessModule('technicianToolsEdit');
  const [tools, setTools] = useState([]);
  const [toolModal, setToolModal] = useState(false);
  const [toolForm, setToolForm] = useState(emptyTool);
  const [toolSaving, setToolSaving] = useState(false);
  const [toolError, setToolError] = useState('');
  const [toolsLoading, setToolsLoading] = useState(false);
  const [removeModal, setRemoveModal] = useState({ open: false, tool: null });
  const [removeForm, setRemoveForm] = useState(emptyRemoval);
  const [removeSaving, setRemoveSaving] = useState(false);
  const [removeError, setRemoveError] = useState('');
  const [toolDocuments, setToolDocuments] = useState([]);
  const [documentModal, setDocumentModal] = useState(false);
  const [documentForm, setDocumentForm] = useState(emptyToolDocument);
  const [documentSaving, setDocumentSaving] = useState(false);
  const [documentError, setDocumentError] = useState('');

  async function load() {
    const [t, c, w] = await Promise.all([
      api.get('/technicians'),
      api.get('/companies'),
      api.get('/warehouses').catch(() => ({ data: { data: [] } })),
    ]);
    setTechnicians(t.data.data || []);
    setCompanies(c.data.data || []);
    setWarehouses(w.data.data || []);
  }

  useEffect(() => { load(); }, []);

  function openCreate() {
    setError('');
    setForm(empty);
    setModal(true);
  }

  function openEdit(technician) {
    if (!canEditTechnician) return;
    setError('');
    setForm(formFromTechnician(technician));
    setModal(true);
  }

  async function save() {
    setSaving(true);
    setError('');
    try {
      const payload = {
        ...form,
        companyId: form.companyId || null,
        defaultWarehouseId: form.defaultWarehouseId || null,
        serviceCities: textToCities(form.serviceCitiesText),
        createPortalUser: !!form.createPortalUser || !!String(form.portalPassword || '').trim(),
        portalPassword: String(form.portalPassword || '') || undefined,
        mustChangePassword: !!form.mustChangePassword,
        transferApprovalLimit: Number(form.transferApprovalLimit || 0),
      };
      if (!canManageTransferLimit) delete payload.transferApprovalLimit;
      delete payload.serviceCitiesText;
      if (!payload.createPortalUser && !payload.portalPassword) {
        delete payload.portalPassword;
        delete payload.mustChangePassword;
      }
      if (form.id) await api.put(`/technicians/${form.id}`, payload);
      else await api.post('/technicians', payload);
      setModal(false);
      setForm(empty);
      await load();
    } catch (err) {
      setError(err.response?.data?.message || 'Não foi possível salvar o técnico.');
    } finally {
      setSaving(false);
    }
  }

  function openLimitEdit(technician) {
    setLimitError('');
    setLimitModal({ open: true, technician, value: technician.transferApprovalLimit ?? 500 });
  }

  async function saveTransferLimit() {
    const value = Number(limitModal.value);
    if (!Number.isFinite(value) || value < 0) {
      setLimitError('Informe um limite válido, igual ou maior que zero.');
      return;
    }
    setLimitSaving(true);
    setLimitError('');
    try {
      await api.put(`/technicians/${limitModal.technician.id}`, { transferApprovalLimit: value });
      setLimitModal({ open: false, technician: null, value: 500 });
      await load();
    } catch (err) {
      setLimitError(err.response?.data?.message || 'Não foi possível atualizar o limite do técnico.');
    } finally {
      setLimitSaving(false);
    }
  }

  async function loadTools(technicianId) {
    if (!canViewTools) {
      setTools([]);
      return;
    }
    setToolsLoading(true);
    setToolError('');
    try {
      const res = await api.get(`/technicians/${technicianId}/tools`);
      setTools(res.data.data?.tools || []);
    } catch (err) {
      setToolError(err.response?.data?.message || 'Não foi possível carregar a ficha de ferramentas do técnico.');
    } finally {
      setToolsLoading(false);
    }
  }

  async function loadToolDocuments(technicianId) {
    if (!canViewTools) {
      setToolDocuments([]);
      return;
    }
    try {
      const res = await api.get(`/technicians/${technicianId}/tools/documents`);
      setToolDocuments(res.data.data?.documents || []);
    } catch (err) {
      setDocumentError(err.response?.data?.message || 'Não foi possível carregar os termos assinados.');
    }
  }

  async function openDetails(technician) {
    setToolError('');
    setDocumentError('');
    setTools([]);
    setToolDocuments([]);
    const stock = (await api.get(`/technicians/${technician.id}/stock`)).data.data;
    setDetails({ open: true, technician, stock });
    if (Array.isArray(stock?.tools)) setTools(stock.tools);
    await Promise.all([loadTools(technician.id), loadToolDocuments(technician.id)]);
  }

  async function refreshDetails() {
    if (details.technician) openDetails(details.technician);
  }

  function openAddTool() {
    setToolError('');
    setToolForm(emptyTool);
    setToolModal(true);
  }

  async function saveTool() {
    if (!details.technician) return;
    setToolSaving(true);
    setToolError('');
    try {
      await api.post(`/technicians/${details.technician.id}/tools`, {
        name: toolForm.name,
        serialNumber: toolForm.serialNumber,
        brand: toolForm.brand || null,
        referenceValue: Number(toolForm.referenceValue || 0),
        notes: toolForm.notes || null,
      });
      setToolModal(false);
      setToolForm(emptyTool);
      await loadTools(details.technician.id);
    } catch (err) {
      setToolError(err.response?.data?.message || 'Não foi possível registrar a ferramenta.');
    } finally {
      setToolSaving(false);
    }
  }

  function openRemoveTool(tool) {
    setRemoveError('');
    setRemoveForm(emptyRemoval);
    setRemoveModal({ open: true, tool });
  }

  async function saveRemoveTool() {
    if (!details.technician || !removeModal.tool) return;
    if (!removeForm.removalReason.trim()) {
      setRemoveError('Descreva o motivo da baixa.');
      return;
    }
    setRemoveSaving(true);
    setRemoveError('');
    try {
      const payload = { status: removeForm.status, removalReason: removeForm.removalReason };
      if (removeForm.status === 'substituida' && removeForm.replacementSerial.trim()) {
        payload.replacement = {
          name: removeForm.replacementName || removeModal.tool.name,
          serialNumber: removeForm.replacementSerial,
          brand: removeForm.replacementBrand || null,
          referenceValue: Number(removeForm.replacementValue || removeModal.tool.referenceValue || 0),
        };
      }
      await api.post(`/technicians/${details.technician.id}/tools/${removeModal.tool.id}/remove`, payload);
      setRemoveModal({ open: false, tool: null });
      setRemoveForm(emptyRemoval);
      await loadTools(details.technician.id);
    } catch (err) {
      setRemoveError(err.response?.data?.message || 'Não foi possível registrar a baixa da ferramenta.');
    } finally {
      setRemoveSaving(false);
    }
  }

  function openDocumentUpload() {
    setDocumentError('');
    setDocumentForm({ ...emptyToolDocument, signedAt: new Date().toISOString().slice(0, 10) });
    setDocumentModal(true);
  }

  async function saveToolDocument() {
    if (!details.technician) return;
    if (!documentForm.file) {
      setDocumentError('Selecione o termo assinado em PDF ou imagem.');
      return;
    }
    if (documentForm.file.size > 12 * 1024 * 1024) {
      setDocumentError('O arquivo deve ter no máximo 12 MB.');
      return;
    }
    setDocumentSaving(true);
    setDocumentError('');
    try {
      const documentData = await readFileAsDataUrl(documentForm.file);
      await api.post(`/technicians/${details.technician.id}/tools/documents`, {
        documentName: documentForm.file.name,
        documentData,
        signedAt: documentForm.signedAt || undefined,
        notes: documentForm.notes || null,
      });
      setDocumentModal(false);
      setDocumentForm(emptyToolDocument);
      await Promise.all([loadToolDocuments(details.technician.id), load()]);
    } catch (err) {
      setDocumentError(err.response?.data?.message || 'Não foi possível anexar o termo assinado.');
    } finally {
      setDocumentSaving(false);
    }
  }

  async function deleteToolDocument(document) {
    if (!details.technician || !window.confirm(`Remover o termo "${document.documentName}" da ficha?`)) return;
    setDocumentError('');
    try {
      await api.delete(`/technicians/${details.technician.id}/tools/documents/${document.id}`);
      await Promise.all([loadToolDocuments(details.technician.id), load()]);
    } catch (err) {
      setDocumentError(err.response?.data?.message || 'Não foi possível remover o termo assinado.');
    }
  }

  const totalValue = useMemo(() => technicians.reduce((sum, technician) => sum + Number(technician.totalCustodyValue ?? technician.assetValue ?? 0), 0), [technicians]);
  const totalTools = useMemo(() => technicians.reduce((sum, technician) => sum + Number(technician.toolCount || 0), 0), [technicians]);
  const totalToolDocuments = useMemo(() => technicians.reduce((sum, technician) => sum + Number(technician.toolDocumentCount || 0), 0), [technicians]);
  const cityOptions = useMemo(() => Array.from(new Set(warehouses.map((w) => String(w.city || '').trim()).filter(Boolean))).sort((a, b) => a.localeCompare(b, 'pt-BR')), [warehouses]);
  function selectedServiceCities() { return textToCities(form.serviceCitiesText); }
  function toggleServiceCity(city) {
    const selected = new Set(selectedServiceCities());
    if (selected.has(city)) selected.delete(city);
    else selected.add(city);
    setForm({ ...form, serviceCitiesText: Array.from(selected).join(', ') });
  }
  function selectDefaultWarehouse(value) {
    const warehouse = warehouses.find((w) => String(w.id) === String(value));
    const selected = new Set(selectedServiceCities());
    if (warehouse?.city) selected.add(warehouse.city);
    setForm({ ...form, defaultWarehouseId: value, serviceCitiesText: Array.from(selected).join(', ') });
  }

  return (
    <div className="page-grid technicians-page">
      <div className="toolbar">
        <div>
          <h2>Técnicos e terceirizadas</h2>
          <p>Gerencie técnico, cidades atendidas, estoque padrão e acesso de login salvo no banco Neon.</p>
        </div>
        {isAdmin && <button onClick={openCreate}>Novo técnico</button>}
      </div>

      <div className="kpi-grid small">
        <KpiCard label="Técnicos" value={technicians.length} />
        <KpiCard label="Ativos" value={technicians.filter((t) => t.status === 'ativo').length} />
        <KpiCard label="Com acesso" value={technicians.filter((t) => t.portalUser).length} />
        <KpiCard label="Ferramentas em custódia" value={totalTools} />
        <KpiCard label="Termos assinados" value={totalToolDocuments} />
        <KpiCard label="Patrimônio em campo" value={brl(totalValue)} />
      </div>

      <section className="panel">
        <div className="table-wrap">
          <table>
            <thead>
              <tr><th>Técnico</th><th>E-mail</th><th>Empresa</th><th>Cidades</th><th>Estoque padrão</th><th>Ferramentas</th><th>Termos</th><th>Acesso</th><th>Status</th><th className="action-cell">Opções</th></tr>
            </thead>
            <tbody>
              {technicians.map((t) => (
                <tr key={t.id}>
                  <td><button className="link-button" onClick={() => openDetails(t)}>{t.name}</button></td>
                  <td>{t.email || '-'}</td>
                  <td>{t.ContractorCompany?.name || '-'}</td>
                  <td>{citiesToText(t.serviceCities) || '-'}</td>
                  <td>{t.defaultWarehouse?.name || '-'}</td>
                  <td><strong>{formatQuantity(t.toolCount || 0)}</strong><br /><small>{brl(t.toolValue || 0)}</small></td>
                  <td><strong>{formatQuantity(t.toolDocumentCount || 0)}</strong><br /><small>assinado(s)</small></td>
                  <td>{t.portalUser ? <span className="badge ativo">Liberado</span> : <span className="badge pendente">Sem login</span>}</td>
                  <td>{t.status}</td>
                  <td>
                    <div className="action-toolbar">
                      <button className="info" onClick={() => openDetails(t)}>Detalhes</button>
                      {canManageTransferLimit && <button className="ghost" onClick={() => openLimitEdit(t)}>Editar limite</button>}
                      {canEditTechnician && <button className="ghost" onClick={() => openEdit(t)}>Editar</button>}
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      <Modal open={modal} title={form.id ? 'Editar técnico' : 'Novo técnico'} onClose={() => setModal(false)} footer={<><button className="ghost" onClick={() => setModal(false)}>Cancelar</button><button disabled={saving} onClick={save}>{saving ? 'Salvando...' : 'Salvar'}</button></>}>
        <div className="form-stack">
          {error && <div className="alert danger">{error}</div>}
          <div className="form-grid">
            <label>Nome<input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} /></label>
            <label>CPF/documento<input value={form.document || ''} onChange={(e) => setForm({ ...form, document: e.target.value })} /></label>
            <label>Telefone<input value={form.phone || ''} onChange={(e) => setForm({ ...form, phone: e.target.value })} /></label>
            <label>E-mail de login<input type="email" value={form.email || ''} onChange={(e) => setForm({ ...form, email: e.target.value })} placeholder="tecnico@empresa.com" /></label>
            <label>Empresa<select value={form.companyId || ''} onChange={(e) => setForm({ ...form, companyId: e.target.value })}><option value="">Sem empresa</option>{companies.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}</select></label>
            <label>Tipo<select value={form.type} onChange={(e) => setForm({ ...form, type: e.target.value })}><option value="interno">Interno</option><option value="terceirizado">Terceirizado</option></select></label>
            {canManageTransferLimit && <label>Limite de transferência sem aprovação<input type="number" min="0" step="0.01" value={form.transferApprovalLimit ?? 500} onChange={(e) => setForm({ ...form, transferApprovalLimit: e.target.value })} /><small>Acima deste valor, a carga será enviada para aprovação do administrador.</small></label>}
            <label>Status<select value={form.status} onChange={(e) => setForm({ ...form, status: e.target.value })}><option value="ativo">Ativo</option><option value="inativo">Inativo</option><option value="bloqueado">Bloqueado</option></select></label>
            <label>Estoque regional vinculado ao técnico<select value={form.defaultWarehouseId || ''} onChange={(e) => selectDefaultWarehouse(e.target.value)}><option value="">Selecione o estoque regional</option>{warehouses.map((w) => <option key={w.id} value={w.id}>{w.name} {w.city ? `- ${w.city}` : ''}</option>)}</select><small>Ao selecionar o estoque, a cidade dele é marcada automaticamente abaixo.</small></label>
          </div>
          <div className="form-field full-span">
            <span className="field-label">Cidades atendidas</span>
            <div className="city-checkbox-list">
              {cityOptions.map((city) => <label className="check-pill" key={city}><input type="checkbox" checked={selectedServiceCities().includes(city)} onChange={() => toggleServiceCity(city)} /><span>{city}</span></label>)}
              {cityOptions.length === 0 && <small>Nenhuma cidade disponível. Cadastre a cidade no estoque regional.</small>}
            </div>
            <small>Sem campo manual: as cidades são carregadas automaticamente dos estoques regionais cadastrados.</small>
          </div>

          <section className="panel-soft">
            <h4>Acesso do técnico</h4>
            <label className="check-line"><input type="checkbox" checked={!!form.createPortalUser} onChange={(e) => setForm({ ...form, createPortalUser: e.target.checked })} /> Criar ou sincronizar conta de login no banco Neon</label>
            {form.createPortalUser && (
              <div className="form-grid">
                <label>{form.id ? 'Nova senha manual' : 'Senha inicial'}<input type="password" value={form.portalPassword || ''} onChange={(e) => setForm({ ...form, portalPassword: e.target.value, createPortalUser: true })} placeholder={form.id ? 'Digite para alterar; vazio mantém a atual' : 'Mínimo 6 caracteres'} /></label>
                <label>Trocar senha no primeiro acesso<select value={String(form.mustChangePassword)} onChange={(e) => setForm({ ...form, mustChangePassword: e.target.value === 'true' })}><option value="true">Sim</option><option value="false">Não</option></select></label>
              </div>
            )}
            <small>O login fica salvo na tabela de usuários do Neon. O técnico pode entrar pelo e-mail ou pelo nome cadastrado.</small>
          </section>
        </div>
      </Modal>

      <Modal open={limitModal.open} title={`Limite sem aprovação: ${limitModal.technician?.name || ''}`} onClose={() => setLimitModal({ open: false, technician: null, value: 500 })} footer={<><button className="ghost" onClick={() => setLimitModal({ open: false, technician: null, value: 500 })}>Cancelar</button><button disabled={limitSaving} onClick={saveTransferLimit}>{limitSaving ? 'Salvando...' : 'Salvar limite'}</button></>}>
        <div className="form-stack">
          {limitError && <div className="alert danger">{limitError}</div>}
          <label>Limite de transferência sem aprovação<input type="number" min="0" step="0.01" value={limitModal.value} onChange={(e) => setLimitModal({ ...limitModal, value: e.target.value })} /><small>Transferências acima deste valor serão enviadas para aprovação do administrador. A alteração ficará registrada na auditoria.</small></label>
        </div>
      </Modal>

      <DetailsModal open={details.open} title={`Central do técnico: ${details.technician?.name || ''}`} onClose={() => setDetails({ open: false, technician: null, stock: null })} footer={<><button className="ghost" onClick={() => setDetails({ open: false, technician: null, stock: null })}>Fechar</button><button className="ghost" onClick={refreshDetails}>Atualizar</button>{canManageTransferLimit && details.technician && <button className="ghost" onClick={() => { openLimitEdit(details.technician); setDetails({ open: false, technician: null, stock: null }); }}>Editar limite</button>}{canEditTechnician && details.technician && <button onClick={() => { openEdit(details.technician); setDetails({ open: false, technician: null, stock: null }); }}>Editar técnico</button>}</>}>
        {details.technician && <div className="technician-command-center"><DetailGrid fields={[["Nome", details.technician.name], ["Documento", details.technician.document], ["Telefone", details.technician.phone], ["E-mail", details.technician.email], ["Empresa", details.technician.ContractorCompany?.name], ["Tipo", details.technician.type], ["Status", details.technician.status], ["Cidades atendidas", citiesToText(details.technician.serviceCities)], ["Estoque padrão", details.technician.defaultWarehouse?.name], ["Limite sem aprovação", brl(details.technician.transferApprovalLimit ?? 500)], ["Acesso de login", details.technician.portalUser ? 'Liberado' : 'Sem login'], ["Equipamentos", details.stock?.summary?.assetsCount ?? details.technician.assetCount], ["Valor equipamentos", brl(details.stock?.summary?.assetsValue ?? details.technician.assetValue)], ["Valor consumíveis", brl(details.stock?.summary?.consumableValue)], ["Ferramentas em custódia", details.stock?.summary?.toolsCount ?? details.technician.toolCount ?? 0], ["Termos de ferramentas", toolDocuments.length || details.technician.toolDocumentCount || 0], ["Valor das ferramentas", brl(details.stock?.summary?.toolsValue ?? details.technician.toolValue)], ["Valor total em nome", brl(details.stock?.summary?.totalValue ?? details.technician.totalCustodyValue)], ["OS abertas", details.stock?.summary?.openOrders], ["Custódia +60 dias", details.stock?.summary?.oldCustody], ["Criado em", dt(details.technician.createdAt)]]} />
          <section className="panel-soft"><h4>Resumo por material</h4><div className="table-wrap compact"><table><thead><tr><th>Material</th><th>Qtd.</th><th>Valor</th><th>Seriais</th></tr></thead><tbody>{(details.stock?.groupedMaterials || []).map((row) => <tr key={row.material}><td>{row.material}</td><td>{formatQuantity(row.quantity)}</td><td>{brl(row.value)}</td><td>{(row.serials || []).slice(0, 6).join(', ')}{(row.serials || []).length > 6 ? '...' : ''}</td></tr>)}</tbody></table></div></section>
          <DetailList title="Equipamentos serializados na caixa" items={details.stock?.assets || []} render={(asset) => <><b>{asset.serialNumber}</b><span>{asset.Material?.name} • {asset.status} • {brl(asset.acquisitionCost)} • {asset.custodyDays ?? 0} dia(s) em custódia</span><small>{asset.brand || '-'} {asset.model || ''} • {asset.mac || 'sem MAC'}</small></>} />
          <DetailList title="Materiais consumíveis na caixa" items={details.stock?.balances || []} render={(balance) => <><b>{balance.Material?.name}</b><span>Quantidade: {formatQuantity(balance.quantity, balance.Material?.unit)} • valor previsto {brl(Number(balance.quantity || 0) * Number(balance.Material?.unitCost || 0))}</span></>} />
          {canViewTools && (
            <section className="detail-section">
              <div className="toolbar" style={{ marginBottom: '0.5rem' }}>
                <h4 style={{ margin: 0 }}>Ferramentas sob custódia (fora da caixa técnica)</h4>
                <div className="action-toolbar">
                  {details.technician && <Link className="ghost" to={`/ferramentas-tecnico/${details.technician.id}`} target="_blank" rel="noreferrer">Gerar termo (imprimir)</Link>}
                  {canEditTools && <button className="ghost" onClick={openDocumentUpload}>Anexar termo assinado</button>}
                  {canEditTools && <button onClick={openAddTool}>Adicionar ferramenta</button>}
                </div>
              </div>
              <p><small>Ferramentas registradas aqui ficam na ficha patrimonial do técnico, com valor, data de entrega, tempo de custódia e histórico de baixa. Elas não alteram o saldo de materiais da caixa técnica.</small></p>
              {toolError && <div className="alert danger">{toolError}</div>}
              {toolsLoading && <div className="empty-state">Carregando ferramentas em custódia...</div>}
              {!toolsLoading && tools.length === 0 && <div className="empty-state">Nenhuma ferramenta registrada na ficha deste técnico.</div>}
              {tools.map((tool) => (
                <div className="detail-row" key={tool.id}>
                  <b>{tool.name}</b>
                  <span>Série/patrimônio: {tool.serialNumber} • {tool.brand || 'sem marca/modelo'} • {brl(tool.referenceValue)} • entregue em {dt(tool.deliveredAt)} • {tool.custodyDays ?? 0} dia(s) em custódia</span>
                  <small>
                    Status: {TOOL_STATUS_LABELS[tool.status] || tool.status}
                    {tool.status !== 'com_tecnico' && ` • baixada em ${dt(tool.removedAt)} • motivo: ${tool.removalReason || '-'}`}
                  </small>
                  {canEditTools && tool.status === 'com_tecnico' && (
                    <div className="action-toolbar"><button className="ghost danger-outline" onClick={() => openRemoveTool(tool)}>Baixar / substituir / perda</button></div>
                  )}
                </div>
              ))}
            </section>
          )}
          {canViewTools && (
            <section className="detail-section">
              <div className="toolbar" style={{ marginBottom: '0.5rem' }}>
                <div><h4 style={{ margin: 0 }}>Termos assinados de ferramentas</h4><small>{toolDocuments.length} documento(s) anexado(s) à ficha.</small></div>
                {canEditTools && <button className="ghost" onClick={openDocumentUpload}>Anexar documento</button>}
              </div>
              {documentError && <div className="alert danger">{documentError}</div>}
              {toolDocuments.length === 0 && <div className="empty-state">Nenhum termo assinado foi anexado para este técnico.</div>}
              {toolDocuments.map((document) => (
                <div className="detail-row tool-document-row" key={document.id}>
                  <b>{document.documentName}</b>
                  <span>Assinado em {dt(document.signedAt)} • anexado por {document.createdBy?.name || 'usuário'} • {formatQuantity(document.toolCount || 0)} ferramenta(s) • {brl(document.totalValue)}</span>
                  {document.notes && <small>{document.notes}</small>}
                  <AttachmentPreview compact name={document.documentName} data={document.documentData} label="Termo assinado" />
                  {canEditTools && <div className="action-toolbar"><button className="ghost danger-outline" onClick={() => deleteToolDocument(document)}>Remover documento</button></div>}
                </div>
              ))}
            </section>
          )}
          <DetailList title="Guias recentes" items={details.stock?.transfers || []} render={(tr) => <><b>{tr.transferNumber}</b><span>{tr.status} • {dt(tr.deliveredAt)} • {brl(tr.totalValue)} • {tr.TransferItems?.length || 0} item(ns)</span></>} />
          <DetailList title="Ordens de serviço" items={details.stock?.orders || []} render={(os) => <><b>{os.osNumber} • {os.customerName}</b><span>{os.status} • {os.serviceType} • {dt(os.createdAt)}</span><small>{os.customerCpf} • {os.city}</small></>} />
          <DetailList title="Histórico recente do técnico" items={details.stock?.movements || []} render={(m) => <><b>{m.type} • {m.reference || '-'}</b><span>{m.Material?.name || '-'} • qtd. {formatQuantity(m.quantity)} • {m.serialNumber || 'sem serial'} • {dt(m.movementAt)}</span><small>{m.fromTechnician?.name || m.fromOwnerType || '-'} → {m.toTechnician?.name || m.toOwnerType || '-'}</small></>} />
        </div>}
      </DetailsModal>

      <Modal open={toolModal} title={`Adicionar ferramenta: ${details.technician?.name || ''}`} onClose={() => setToolModal(false)} footer={<><button className="ghost" onClick={() => setToolModal(false)}>Cancelar</button><button disabled={toolSaving} onClick={saveTool}>{toolSaving ? 'Salvando...' : 'Registrar ferramenta'}</button></>}>
        <div className="form-stack">
          {toolError && <div className="alert danger">{toolError}</div>}
          <div className="form-grid">
            <label>Nome/descrição<input value={toolForm.name} onChange={(e) => setToolForm({ ...toolForm, name: e.target.value })} placeholder="Ex.: Furadeira Bosch, Escada 5m" /></label>
            <label>Nº de patrimônio/série<input value={toolForm.serialNumber} onChange={(e) => setToolForm({ ...toolForm, serialNumber: e.target.value })} /></label>
            <label>Marca/modelo<input value={toolForm.brand} onChange={(e) => setToolForm({ ...toolForm, brand: e.target.value })} /></label>
            <label>Valor de referência<input type="number" min="0" step="0.01" value={toolForm.referenceValue} onChange={(e) => setToolForm({ ...toolForm, referenceValue: e.target.value })} /></label>
          </div>
          <label>Observações<textarea rows={2} value={toolForm.notes} onChange={(e) => setToolForm({ ...toolForm, notes: e.target.value })} /></label>
          <small>Este item ficará na ficha do técnico até que seja devolvido, substituído ou baixado por perda/desgaste. Não entra na caixa técnica nem na movimentação de material.</small>
        </div>
      </Modal>

      <Modal open={documentModal} title={`Anexar termo assinado: ${details.technician?.name || ''}`} onClose={() => !documentSaving && setDocumentModal(false)} footer={<><button className="ghost" disabled={documentSaving} onClick={() => setDocumentModal(false)}>Cancelar</button><button disabled={documentSaving} onClick={saveToolDocument}>{documentSaving ? 'Anexando...' : 'Anexar termo assinado'}</button></>}>
        <div className="form-stack">
          {documentError && <div className="alert danger">{documentError}</div>}
          <label>Documento assinado<input type="file" accept=".pdf,image/jpeg,image/png,image/webp" onChange={(e) => setDocumentForm({ ...documentForm, file: e.target.files?.[0] || null })} /><small>Formatos permitidos: PDF, JPG, PNG ou WEBP. Tamanho máximo: 12 MB.</small></label>
          <label>Data da assinatura<input type="date" value={documentForm.signedAt || ''} onChange={(e) => setDocumentForm({ ...documentForm, signedAt: e.target.value })} /></label>
          <label>Observações<textarea rows={3} value={documentForm.notes || ''} onChange={(e) => setDocumentForm({ ...documentForm, notes: e.target.value })} placeholder="Ex.: termo conferido e assinado na entrega das ferramentas." /></label>
          <div className="viz-callout">O sistema registrará no documento a quantidade e o valor das ferramentas ativas na ficha no momento do anexo.</div>
        </div>
      </Modal>

      <Modal open={removeModal.open} title={`Baixar ferramenta: ${removeModal.tool?.name || ''}`} onClose={() => setRemoveModal({ open: false, tool: null })} footer={<><button className="ghost" onClick={() => setRemoveModal({ open: false, tool: null })}>Cancelar</button><button disabled={removeSaving} onClick={saveRemoveTool}>{removeSaving ? 'Salvando...' : 'Confirmar baixa'}</button></>}>
        <div className="form-stack">
          {removeError && <div className="alert danger">{removeError}</div>}
          <p><small>Série/patrimônio: <b>{removeModal.tool?.serialNumber}</b> • Valor de referência: {brl(removeModal.tool?.referenceValue)}</small></p>
          <label>Motivo da baixa<select value={removeForm.status} onChange={(e) => setRemoveForm({ ...removeForm, status: e.target.value })}>
            <option value="devolvida">Devolução</option>
            <option value="perdida">Perda/extravio</option>
            <option value="desgaste">Desgaste/quebra</option>
            <option value="substituida">Substituição por outra ferramenta</option>
          </select></label>
          <label>Descrição do motivo<textarea rows={2} value={removeForm.removalReason} onChange={(e) => setRemoveForm({ ...removeForm, removalReason: e.target.value })} placeholder="Ex.: devolvida na saída de férias, perdida em campo em 12/07, cabo rompido..." /></label>
          {removeForm.status === 'substituida' && (
            <section className="panel-soft">
              <h4>Ferramenta nova (opcional)</h4>
              <div className="form-grid">
                <label>Nome/descrição<input value={removeForm.replacementName} onChange={(e) => setRemoveForm({ ...removeForm, replacementName: e.target.value })} placeholder={removeModal.tool?.name} /></label>
                <label>Nº de patrimônio/série<input value={removeForm.replacementSerial} onChange={(e) => setRemoveForm({ ...removeForm, replacementSerial: e.target.value })} /></label>
                <label>Marca/modelo<input value={removeForm.replacementBrand} onChange={(e) => setRemoveForm({ ...removeForm, replacementBrand: e.target.value })} /></label>
                <label>Valor de referência<input type="number" min="0" step="0.01" value={removeForm.replacementValue} onChange={(e) => setRemoveForm({ ...removeForm, replacementValue: e.target.value })} placeholder={removeModal.tool?.referenceValue} /></label>
              </div>
              <small>Se preencher o número de série da ferramenta nova, ela já entra automaticamente na ficha como item ativo.</small>
            </section>
          )}
        </div>
      </Modal>
    </div>
  );
}
