/* eslint-disable react-hooks/exhaustive-deps */
import { useEffect, useMemo, useState } from 'react';
import api from '../services/api';
import Modal from '../components/Modal';
import Pagination from '../components/Pagination';
import DetailsModal, { DetailGrid, DetailList } from '../components/DetailsModal';
import FloatingAlert from '../components/FloatingAlert';
import { useAuth } from '../contexts/AuthContext';
import { formatQuantity } from '../utils/formatQuantity';
import { SERVICE_TYPE_OPTIONS, serviceTypeLabel } from '../utils/serviceOrderRules';

function brl(value) { return Number(value || 0).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' }); }
function dt(value) { return value ? new Date(value).toLocaleString('pt-BR') : '-'; }
function emptyReplacement() { return { open: false, loading: false, saving: false, order: null, data: null, oldAssetId: '', newAssetId: '', search: '', reason: 'Correção de equipamento baixado na OS', notes: '' }; }

export default function ServiceOrders() {
  const { isAdmin, canAccessModule } = useAuth();
  const canReplaceEquipment = canAccessModule('serviceOrderEquipmentReplace');
  const [orders, setOrders] = useState([]);
  const [search, setSearch] = useState('');
  const [page, setPage] = useState(1);
  const [pagination, setPagination] = useState({ page: 1, pageSize: 15, total: 0, totalPages: 1 });
  const [loading, setLoading] = useState(false);
  const [details, setDetails] = useState(null);
  const [edit, setEdit] = useState({ open: false, item: null, form: {} });
  const [replacement, setReplacement] = useState(emptyReplacement());
  const [message, setMessage] = useState('');

  async function load(targetPage = page) {
    setLoading(true);
    try {
      const response = await api.get('/service-orders', { params: { search, page: targetPage, pageSize: 15 } });
      setOrders(response.data.data || []);
      setPagination(response.data.pagination || { page: targetPage, pageSize: 15, total: response.data.data?.length || 0, totalPages: 1 });
      setPage(targetPage);
    } catch (error) {
      setMessage(error.response?.data?.message || 'Não foi possível carregar as ordens de serviço.');
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => { load(1); }, []);

  async function saveEdit() {
    try {
      await api.put(`/service-orders/${edit.item.id}`, edit.form);
      setEdit({ open: false, item: null, form: {} });
      setMessage('OS atualizada com sucesso.');
      load(page);
    } catch (error) {
      setMessage(error.response?.data?.message || 'Não foi possível atualizar a OS.');
    }
  }

  function openEdit(order) {
    setEdit({
      open: true,
      item: order,
      form: {
        osNumber: order.osNumber || '',
        customerName: order.customerName || '',
        customerCpf: order.customerCpf || '',
        customerAddress: order.customerAddress || '',
        city: order.city || '',
        serviceType: order.serviceType || '',
        status: order.status || 'concluida',
        completedAt: order.completedAt ? String(order.completedAt).slice(0, 16) : '',
        notes: order.notes || '',
      },
    });
  }

  function orderHasInstalledEquipment(order) {
    return (order?.ServiceOrderMaterials || []).some((item) => item.serialNumber && item.SerializedAsset?.status === 'instalado');
  }

  async function openReplacement(order) {
    setReplacement({ ...emptyReplacement(), open: true, loading: true, order });
    setMessage('');
    try {
      const response = await api.get(`/service-orders/${order.id}/replacement-options`);
      const data = response.data.data;
      setReplacement({
        ...emptyReplacement(),
        open: true,
        order,
        data,
        oldAssetId: data.installedItems?.[0]?.assetId || '',
      });
    } catch (error) {
      setReplacement(emptyReplacement());
      setMessage(error.response?.data?.message || 'Não foi possível carregar os equipamentos para substituição.');
    }
  }

  const filteredReplacementAssets = useMemo(() => {
    const query = String(replacement.search || '').trim().toLowerCase();
    return (replacement.data?.availableAssets || []).filter((asset) => {
      if (!query) return true;
      return [asset.serialNumber, asset.mac, asset.brand, asset.model, asset.Material?.name, asset.Material?.sku]
        .filter(Boolean)
        .join(' ')
        .toLowerCase()
        .includes(query);
    });
  }, [replacement.data, replacement.search]);

  async function submitReplacement() {
    if (replacement.saving) return;
    if (!replacement.oldAssetId || !replacement.newAssetId) {
      setMessage('Selecione o equipamento atualmente instalado e o novo equipamento.');
      return;
    }
    try {
      setReplacement((current) => ({ ...current, saving: true }));
      await api.post(`/service-orders/${replacement.order.id}/replace-equipment`, {
        oldAssetId: Number(replacement.oldAssetId),
        newAssetId: Number(replacement.newAssetId),
        reason: replacement.reason,
        notes: replacement.notes,
      });
      setReplacement(emptyReplacement());
      setDetails(null);
      setMessage('Equipamento substituído. O equipamento anterior voltou para a caixa do técnico e o novo ficou instalado no cliente.');
      await load(page);
    } catch (error) {
      setMessage(error.response?.data?.message || 'Não foi possível substituir o equipamento.');
      setReplacement((current) => ({ ...current, saving: false }));
    }
  }

  const selectedOldEquipment = replacement.data?.installedItems?.find((item) => Number(item.assetId) === Number(replacement.oldAssetId));
  const selectedNewEquipment = replacement.data?.availableAssets?.find((item) => Number(item.id) === Number(replacement.newAssetId));

  return (
    <div className="page-grid">
      <FloatingAlert message={message} type={message.includes('sucesso') || message.includes('substituído') ? 'success' : 'danger'} onClose={() => setMessage('')} />
      <div className="toolbar">
        <div><h2>Ordens de serviço</h2><p>Consulta de baixas feitas pelos técnicos com número do contrato e cliente.</p></div>
        <div className="inline"><input placeholder="Buscar OS/cliente/contrato" value={search} onChange={(e) => setSearch(e.target.value)} onKeyDown={(e) => { if (e.key === 'Enter') load(1); }} /><button onClick={() => load(1)} disabled={loading}>{loading ? 'Buscando...' : 'Buscar'}</button></div>
      </div>

      <section className="panel">
        <div className="table-wrap"><table><thead><tr><th>OS</th><th>Cliente</th><th>Nº Contrato</th><th>Técnico</th><th>Tipo</th><th>Status</th><th>Data da baixa</th><th>Materiais</th><th className="action-cell">Opções</th></tr></thead><tbody>{orders.map((o) => <tr key={o.id}><td>{o.osNumber}</td><td>{o.customerName}</td><td>{o.customerCpf}</td><td>{o.Technician?.name}</td><td>{serviceTypeLabel(o.serviceType)}</td><td>{o.status}</td><td>{dt(o.completedAt)}</td><td>{o.ServiceOrderMaterials?.map((m) => m.serialNumber || `${m.Material?.name} (${formatQuantity(m.quantity)})`).join(', ')}</td><td><div className="action-toolbar"><button className="info" onClick={() => setDetails(o)}>Detalhes</button>{canReplaceEquipment && orderHasInstalledEquipment(o) && <button className="warning" onClick={() => openReplacement(o)}>Trocar equipamento</button>}{isAdmin && <button className="ghost" onClick={() => openEdit(o)}>Editar</button>}</div></td></tr>)}</tbody></table></div>
        <Pagination {...pagination} page={page} loading={loading} onPageChange={load} />
      </section>

      <Modal open={edit.open} title={`Editar OS ${edit.item?.osNumber || ''}`} onClose={() => setEdit({ open: false, item: null, form: {} })} footer={<><button className="ghost" onClick={() => setEdit({ open: false, item: null, form: {} })}>Cancelar</button><button onClick={saveEdit}>Salvar alteração</button></>}>
        <div className="form-grid"><label>Número OS<input value={edit.form.osNumber || ''} onChange={(e) => setEdit({ ...edit, form: { ...edit.form, osNumber: e.target.value } })} /></label><label>Cliente<input value={edit.form.customerName || ''} onChange={(e) => setEdit({ ...edit, form: { ...edit.form, customerName: e.target.value } })} /></label><label>Número do contrato<input value={edit.form.customerCpf || ''} onChange={(e) => setEdit({ ...edit, form: { ...edit.form, customerCpf: e.target.value } })} /></label><label>Endereço<input value={edit.form.customerAddress || ''} onChange={(e) => setEdit({ ...edit, form: { ...edit.form, customerAddress: e.target.value } })} /></label><label>Cidade<input value={edit.form.city || ''} onChange={(e) => setEdit({ ...edit, form: { ...edit.form, city: e.target.value } })} /></label><label>Tipo<select value={edit.form.serviceType || ''} onChange={(e) => setEdit({ ...edit, form: { ...edit.form, serviceType: e.target.value } })}>{SERVICE_TYPE_OPTIONS.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}</select></label><label>Status<select value={edit.form.status || ''} onChange={(e) => setEdit({ ...edit, form: { ...edit.form, status: e.target.value } })}><option value="aberta">Aberta</option><option value="pendente">Pendente</option><option value="concluida">Concluída</option><option value="cancelada">Cancelada</option></select></label><label>Concluída em<input type="datetime-local" value={edit.form.completedAt || ''} onChange={(e) => setEdit({ ...edit, form: { ...edit.form, completedAt: e.target.value } })} /></label></div><label>Observações<textarea rows="4" value={edit.form.notes || ''} onChange={(e) => setEdit({ ...edit, form: { ...edit.form, notes: e.target.value } })} /></label>
      </Modal>

      <Modal open={replacement.open} title={`Substituir equipamento da OS ${replacement.order?.osNumber || ''}`} onClose={() => !replacement.saving && setReplacement(emptyReplacement())} footer={<><button className="ghost" disabled={replacement.saving} onClick={() => setReplacement(emptyReplacement())}>Cancelar</button><button disabled={replacement.loading || replacement.saving || !replacement.oldAssetId || !replacement.newAssetId} onClick={submitReplacement}>{replacement.saving ? 'Substituindo...' : 'Confirmar substituição'}</button></>}>
        {replacement.loading ? <div className="empty-state">Carregando equipamentos...</div> : <div className="form-stack">
          <div className="alert warning">A substituição devolve o equipamento escolhido para a caixa do técnico da OS e instala o novo equipamento no mesmo cliente. A operação fica registrada no histórico e na auditoria.</div>
          <div className="form-grid">
            <label>Equipamento atualmente instalado<select value={replacement.oldAssetId} onChange={(e) => setReplacement({ ...replacement, oldAssetId: e.target.value, newAssetId: '' })}><option value="">Selecione</option>{(replacement.data?.installedItems || []).map((item) => <option key={item.assetId} value={item.assetId}>{item.materialName} • {item.serialNumber}{item.mac ? ` • ${item.mac}` : ''}</option>)}</select></label>
            <label>Buscar novo equipamento<input value={replacement.search} onChange={(e) => setReplacement({ ...replacement, search: e.target.value })} placeholder="Serial, patrimônio, MAC, modelo ou material" /></label>
          </div>
          <div className="replacement-equipment-list">
            {filteredReplacementAssets.map((asset) => {
              const selected = Number(asset.id) === Number(replacement.newAssetId);
              return <button type="button" key={asset.id} className={`serial-chip ${selected ? 'selected' : ''}`} onClick={() => setReplacement({ ...replacement, newAssetId: asset.id })}><span><b>{asset.serialNumber}</b><small>{asset.Material?.name || 'Equipamento'}{asset.mac ? ` • MAC ${asset.mac}` : ''} • {asset.brand || ''} {asset.model || ''}</small></span><em>{selected ? 'Selecionado' : 'Selecionar'}</em></button>;
            })}
            {!filteredReplacementAssets.length && <div className="empty-state small">Nenhum equipamento compatível disponível na caixa do técnico.</div>}
          </div>
          <label>Motivo<input value={replacement.reason} onChange={(e) => setReplacement({ ...replacement, reason: e.target.value })} /></label>
          <label>Observações<textarea rows="3" value={replacement.notes} onChange={(e) => setReplacement({ ...replacement, notes: e.target.value })} placeholder="Explique a correção realizada." /></label>
          {(selectedOldEquipment || selectedNewEquipment) && <div className="viz-callout"><b>Resumo:</b> {selectedOldEquipment?.serialNumber || 'Selecione o atual'} → {selectedNewEquipment?.serialNumber || 'Selecione o novo'}.</div>}
        </div>}
      </Modal>

      <DetailsModal open={!!details} title={`Detalhes da OS ${details?.osNumber || ''}`} onClose={() => setDetails(null)} footer={<><button className="ghost" onClick={() => setDetails(null)}>Fechar</button>{canReplaceEquipment && details && orderHasInstalledEquipment(details) && <button className="warning" onClick={() => openReplacement(details)}>Trocar equipamento</button>}{isAdmin && details && <button onClick={() => { openEdit(details); setDetails(null); }}>Editar OS</button>}</>}>
        {details && <><DetailGrid fields={[["OS", details.osNumber], ["Cliente", details.customerName], ["Nº Contrato", details.customerCpf], ["Endereço", details.customerAddress], ["Cidade", details.city], ["Técnico", details.Technician?.name], ["Tipo", serviceTypeLabel(details.serviceType)], ["Status", details.status], ["Concluída em", details.completedAt], ["Criada em", details.createdAt], ["Observações", details.notes]]} /><DetailList title="Materiais baixados" items={details.ServiceOrderMaterials || []} render={(item) => <><b>{item.Material?.name || 'Material'}</b><span>Qtd. {formatQuantity(item.quantity)} • {item.serialNumber || 'sem serial'} • {brl(item.totalCost)}</span></>} /><DetailList title="Histórico de substituições" items={details.equipmentReplacements || []} render={(item) => <><b>{item.oldSerialNumber} → {item.newSerialNumber}</b><span>{item.reason || 'Substituição de equipamento'} • {dt(item.createdAt)}</span><small>Operador: {item.performedBy?.name || 'Sistema'}{item.notes ? ` • ${item.notes}` : ''}</small></>} /><div className="viz-callout">Baixas e substituições por OS alimentam automaticamente caixa do técnico, patrimônio, histórico, auditoria e BI.</div></>}
      </DetailsModal>
    </div>
  );
}
