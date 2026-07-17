import { useEffect, useMemo, useState } from 'react';
import api from '../services/api';
import Modal from '../components/Modal';
import DetailsModal, { DetailGrid, DetailList } from '../components/DetailsModal';
import KpiCard from '../components/KpiCard';
import { useAuth } from '../contexts/AuthContext';

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
};

function brl(value) { return Number(value || 0).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' }); }
function dt(value) { return value ? new Date(value).toLocaleString('pt-BR') : '-'; }
function citiesToText(value) { return Array.isArray(value) ? value.join(', ') : ''; }
function textToCities(value) { return String(value || '').split(',').map((item) => item.trim()).filter(Boolean); }

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
  const { isAdmin } = useAuth();
  const [technicians, setTechnicians] = useState([]);
  const [companies, setCompanies] = useState([]);
  const [warehouses, setWarehouses] = useState([]);
  const [modal, setModal] = useState(false);
  const [details, setDetails] = useState({ open: false, technician: null, stock: null });
  const [form, setForm] = useState(empty);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

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
      };
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

  async function openDetails(technician) {
    const stock = (await api.get(`/technicians/${technician.id}/stock`)).data.data;
    setDetails({ open: true, technician, stock });
  }

  async function refreshDetails() {
    if (details.technician) openDetails(details.technician);
  }

  const totalValue = useMemo(() => technicians.reduce((s, t) => s + Number(t.totalCustodyValue ?? t.assetValue ?? 0), 0), [technicians]);

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
        <KpiCard label="Patrimônio em campo" value={brl(totalValue)} />
      </div>

      <section className="panel">
        <div className="table-wrap">
          <table>
            <thead>
              <tr><th>Técnico</th><th>E-mail</th><th>Empresa</th><th>Cidades</th><th>Estoque padrão</th><th>Acesso</th><th>Status</th><th className="action-cell">Opções</th></tr>
            </thead>
            <tbody>
              {technicians.map((t) => (
                <tr key={t.id}>
                  <td><button className="link-button" onClick={() => openDetails(t)}>{t.name}</button></td>
                  <td>{t.email || '-'}</td>
                  <td>{t.ContractorCompany?.name || '-'}</td>
                  <td>{citiesToText(t.serviceCities) || '-'}</td>
                  <td>{t.defaultWarehouse?.name || '-'}</td>
                  <td>{t.portalUser ? <span className="badge ativo">Liberado</span> : <span className="badge pendente">Sem login</span>}</td>
                  <td>{t.status}</td>
                  <td>
                    <div className="action-toolbar">
                      <button className="info" onClick={() => openDetails(t)}>Detalhes</button>
                      {isAdmin && <button className="ghost" onClick={() => openEdit(t)}>Editar</button>}
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
            <label>Status<select value={form.status} onChange={(e) => setForm({ ...form, status: e.target.value })}><option value="ativo">Ativo</option><option value="inativo">Inativo</option><option value="bloqueado">Bloqueado</option></select></label>
            <label>Estoque padrão<select value={form.defaultWarehouseId || ''} onChange={(e) => setForm({ ...form, defaultWarehouseId: e.target.value })}><option value="">Sem estoque padrão</option>{warehouses.map((w) => <option key={w.id} value={w.id}>{w.name} {w.city ? `- ${w.city}` : ''}</option>)}</select></label>
          </div>
          <label>Cidades atendidas<input value={form.serviceCitiesText || ''} onChange={(e) => setForm({ ...form, serviceCitiesText: e.target.value })} placeholder="Ex.: Joinville, Araquari, São Francisco do Sul" /></label>

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

      <DetailsModal open={details.open} title={`Central do técnico: ${details.technician?.name || ''}`} onClose={() => setDetails({ open: false, technician: null, stock: null })} footer={<><button className="ghost" onClick={() => setDetails({ open: false, technician: null, stock: null })}>Fechar</button><button className="ghost" onClick={refreshDetails}>Atualizar</button>{isAdmin && details.technician && <button onClick={() => { openEdit(details.technician); setDetails({ open: false, technician: null, stock: null }); }}>Editar técnico</button>}</>}>
        {details.technician && <div className="technician-command-center"><DetailGrid fields={[["Nome", details.technician.name], ["Documento", details.technician.document], ["Telefone", details.technician.phone], ["E-mail", details.technician.email], ["Empresa", details.technician.ContractorCompany?.name], ["Tipo", details.technician.type], ["Status", details.technician.status], ["Cidades atendidas", citiesToText(details.technician.serviceCities)], ["Estoque padrão", details.technician.defaultWarehouse?.name], ["Acesso de login", details.technician.portalUser ? 'Liberado' : 'Sem login'], ["Equipamentos", details.stock?.summary?.assetsCount ?? details.technician.assetCount], ["Valor equipamentos", brl(details.stock?.summary?.assetsValue ?? details.technician.assetValue)], ["Valor consumíveis", brl(details.stock?.summary?.consumableValue)], ["Valor total em nome", brl(details.stock?.summary?.totalValue ?? details.technician.totalCustodyValue)], ["OS abertas", details.stock?.summary?.openOrders], ["Custódia +60 dias", details.stock?.summary?.oldCustody], ["Criado em", dt(details.technician.createdAt)]]} />
          <section className="panel-soft"><h4>Resumo por material</h4><div className="table-wrap compact"><table><thead><tr><th>Material</th><th>Qtd.</th><th>Valor</th><th>Seriais</th></tr></thead><tbody>{(details.stock?.groupedMaterials || []).map((row) => <tr key={row.material}><td>{row.material}</td><td>{row.quantity}</td><td>{brl(row.value)}</td><td>{(row.serials || []).slice(0, 6).join(', ')}{(row.serials || []).length > 6 ? '...' : ''}</td></tr>)}</tbody></table></div></section>
          <DetailList title="Equipamentos serializados na caixa" items={details.stock?.assets || []} render={(asset) => <><b>{asset.serialNumber}</b><span>{asset.Material?.name} • {asset.status} • {brl(asset.acquisitionCost)} • {asset.custodyDays ?? 0} dia(s) em custódia</span><small>{asset.brand || '-'} {asset.model || ''} • {asset.mac || 'sem MAC'}</small></>} />
          <DetailList title="Materiais consumíveis na caixa" items={details.stock?.balances || []} render={(balance) => <><b>{balance.Material?.name}</b><span>Quantidade: {balance.quantity} {balance.Material?.unit} • valor previsto {brl(Number(balance.quantity || 0) * Number(balance.Material?.unitCost || 0))}</span></>} />
          <DetailList title="Guias recentes" items={details.stock?.transfers || []} render={(tr) => <><b>{tr.transferNumber}</b><span>{tr.status} • {dt(tr.deliveredAt)} • {brl(tr.totalValue)} • {tr.TransferItems?.length || 0} item(ns)</span></>} />
          <DetailList title="Ordens de serviço" items={details.stock?.orders || []} render={(os) => <><b>{os.osNumber} • {os.customerName}</b><span>{os.status} • {os.serviceType} • {dt(os.createdAt)}</span><small>{os.customerCpf} • {os.city}</small></>} />
          <DetailList title="Histórico recente do técnico" items={details.stock?.movements || []} render={(m) => <><b>{m.type} • {m.reference || '-'}</b><span>{m.Material?.name || '-'} • qtd. {m.quantity} • {m.serialNumber || 'sem serial'} • {dt(m.movementAt)}</span><small>{m.fromTechnician?.name || m.fromOwnerType || '-'} → {m.toTechnician?.name || m.toOwnerType || '-'}</small></>} />
        </div>}
      </DetailsModal>
    </div>
  );
}
