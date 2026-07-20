import { useEffect, useMemo, useState } from 'react';
import api from '../services/api';
import Modal from '../components/Modal';
import DetailsModal, { DetailGrid } from '../components/DetailsModal';
import KpiCard from '../components/KpiCard';
import { useAuth } from '../contexts/AuthContext';
import { formatQuantity, formatQuantityInput, formatQuantityLabel } from '../utils/formatQuantity';

const empty = {
  sku: '',
  name: '',
  commercialName: '',
  category: 'onu',
  unit: 'un',
  requiresSerial: true,
  unitCost: 0,
  minStock: 0,
  maxStock: 0,
  reorderPoint: 0,
  active: true,
  defaultSupplier: '',
  ncm: '',
  fiscalCode: '',
  accountingCode: '',
  costCenter: '',
  patrimonyPrefix: '',
  storageLocation: '',
  shelf: '',
  packageQuantity: 1,
  leadTimeDays: 0,
  warrantyDays: 0,
  usefulLifeMonths: 0,
  weightKg: 0,
  dimensions: '',
  criticality: 'media',
  movementPolicy: 'livre',
  qualityInspection: 'visual',
  allowTechnicianTransfer: true,
  allowCustomerInstall: true,
  requiresReturnOnRemoval: false,
  autoLowStockAlert: true,
  notes: '',
  initialWarehouseId: '',
  initialQuantity: 0,
  initialSerialsText: '',
};

const categories = [
  ['onu', 'ONU'],
  ['drop', 'Drop'],
  ['esticador', 'Esticador'],
  ['conector', 'Conector'],
  ['cabo', 'Cabo'],
  ['roteador', 'Roteador'],
  ['ferragem', 'Ferragem'],
  ['epi', 'EPI'],
  ['outro', 'Outro'],
];

const units = ['un', 'm', 'cx', 'rolo', 'kit', 'par', 'kg', 'pc'];

function brl(value) {
  return Number(value || 0).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
}

function asNumber(value) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : 0;
}
function splitSerials(value) { return String(value || '').split(/\n|,|;/).map((item) => item.trim()).filter(Boolean); }

function MaterialField({ label, children, hint, className = '' }) {
  return (
    <label className={className}>
      <span>{label}</span>
      {children}
      {hint && <small className="form-hint">{hint}</small>}
    </label>
  );
}

export default function Stock() {
  const { isAdmin } = useAuth();
  const [materials, setMaterials] = useState([]);
  const [warehouses, setWarehouses] = useState([]);
  const [modal, setModal] = useState(false);
  const [details, setDetails] = useState(null);
  const [form, setForm] = useState(empty);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  async function load() {
    const [materialsResponse, warehousesResponse] = await Promise.all([
      api.get('/materials'),
      api.get('/warehouses').catch(() => ({ data: { data: [] } })),
    ]);
    setMaterials(materialsResponse.data.data || []);
    setWarehouses(warehousesResponse.data.data || []);
  }

  useEffect(() => { load(); }, []);

  const totalEstoque = materials.reduce((s, m) => s + Number(m.mainStock || 0), 0);
  const low = materials.filter((m) => Number(m.mainStock || 0) <= Number(m.minStock || 0) && Number(m.minStock || 0) > 0).length;
  const valorCatalogo = materials.reduce((s, m) => s + (Number(m.mainStock || 0) * Number(m.unitCost || 0)), 0);

  const preview = useMemo(() => {
    const estoqueMinimo = asNumber(form.minStock);
    const estoqueMaximo = asNumber(form.maxStock);
    const pontoPedido = asNumber(form.reorderPoint || form.minStock);
    const custo = asNumber(form.unitCost);
    const pacote = asNumber(form.packageQuantity || 1);
    return {
      politica: form.movementPolicy === 'aprovacao' ? 'Exige aprovação' : form.movementPolicy === 'bloqueado' ? 'Bloqueado' : form.movementPolicy === 'serial_obrigatorio' ? 'Serial obrigatório' : 'Livre',
      alerta: form.autoLowStockAlert ? 'Ativo' : 'Desligado',
      valorMinimo: estoqueMinimo * custo,
      valorMaximo: estoqueMaximo * custo,
      pontoPedido,
      pacote,
    };
  }, [form]);

  function openCreate() {
    const firstWarehouse = warehouses.find((w) => w.status === 'ativo') || warehouses[0];
    setForm({ ...empty, initialWarehouseId: firstWarehouse ? String(firstWarehouse.id) : '' });
    setError('');
    setModal(true);
  }

  function openEdit(material) {
    setForm({ ...empty, ...material });
    setError('');
    setModal(true);
  }

  function change(field, value) {
    setForm((current) => ({ ...current, [field]: value }));
  }

  function normalizePayload() {
    return {
      ...form,
      sku: String(form.sku || '').trim().toUpperCase(),
      name: String(form.name || '').trim(),
      commercialName: String(form.commercialName || '').trim(),
      unitCost: asNumber(form.unitCost),
      minStock: Math.max(0, Math.round(asNumber(form.minStock))),
      maxStock: Math.max(0, Math.round(asNumber(form.maxStock))),
      reorderPoint: Math.max(0, Math.round(asNumber(form.reorderPoint))),
      packageQuantity: Math.max(0, asNumber(form.packageQuantity || 1)),
      leadTimeDays: Math.max(0, Math.round(asNumber(form.leadTimeDays))),
      warrantyDays: Math.max(0, Math.round(asNumber(form.warrantyDays))),
      usefulLifeMonths: Math.max(0, Math.round(asNumber(form.usefulLifeMonths))),
      weightKg: Math.max(0, asNumber(form.weightKg)),
      initialWarehouseId: form.initialWarehouseId || '',
      initialQuantity: Math.max(0, asNumber(form.initialQuantity)),
      initialSerialNumbers: splitSerials(form.initialSerialsText),
      initialSerialsText: form.initialSerialsText || '',
    };
  }

  async function save(e) {
    e.preventDefault();
    const payload = normalizePayload();
    if (!payload.sku || !payload.name) {
      setError('Informe SKU e nome do material para continuar.');
      return;
    }
    if (!payload.id && !payload.initialWarehouseId) {
      setError('Selecione o estoque regional onde o material será cadastrado.');
      return;
    }
    if (!payload.id && payload.requiresSerial && payload.initialQuantity > 0 && payload.initialSerialNumbers.length !== payload.initialQuantity) {
      setError('A quantidade inicial precisa bater com a quantidade de seriais informados.');
      return;
    }
    setSaving(true);
    setError('');
    try {
      if (payload.id) await api.put(`/materials/${payload.id}`, payload);
      else await api.post('/materials', payload);
      setModal(false);
      setForm(empty);
      await load();
    } catch (err) {
      setError(err.response?.data?.message || 'Não foi possível salvar o material. Confira os dados e tente novamente.');
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="page-grid stock-page">
      <div className="toolbar">
        <div>
          <h2>Catálogo e estoque</h2>
          <p>Cadastre materiais de telecom com política de movimentação, localização, custos e regras de controle.</p>
        </div>
        {isAdmin && <button onClick={openCreate}>➕ Novo material</button>}
      </div>

      <div className="kpi-grid small">
        <KpiCard label="Itens no estoque" value={totalEstoque} />
        <KpiCard label="Alertas de mínimo" value={low} tone={low ? 'warning' : 'success'} />
        <KpiCard label="Valor estimado em estoque" value={brl(valorCatalogo)} />
      </div>

      <section className="panel">
        <div className="table-wrap">
          <table>
            <thead>
              <tr><th>SKU</th><th>Material</th><th>Categoria</th><th>Serial</th><th>Estoque</th><th>Mínimo</th><th>Valor</th><th>Política</th><th className="action-cell">Opções</th></tr>
            </thead>
            <tbody>
              {materials.map((m) => (
                <tr key={m.id}>
                  <td>{m.sku}</td>
                  <td><b>{m.name}</b><br /><small>{m.storageLocation || m.category || 'Sem dados complementares'}</small></td>
                  <td>{m.category}</td>
                  <td>{m.requiresSerial ? 'Sim' : 'Não'}</td>
                  <td>{formatQuantity(m.mainStock, m.unit)}</td>
                  <td>{m.minStock}</td>
                  <td>{brl(m.unitCost)}</td>
                  <td><span className={`badge ${m.movementPolicy || 'livre'}`}>{m.movementPolicy || 'livre'}</span></td>
                  <td><div className="action-toolbar"><button className="info" onClick={() => setDetails(m)}>Detalhes</button>{isAdmin && <button className="ghost" onClick={() => openEdit(m)}>Editar</button>}</div></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      <Modal open={modal} title={form.id ? '✏️ Editar material' : '📦 Novo material completo'} onClose={() => setModal(false)} footer={<><button className="ghost" onClick={() => setModal(false)}>Cancelar</button><button onClick={save} disabled={saving}>{saving ? 'Salvando...' : 'Salvar material'}</button></>}>
        <form className="material-form" onSubmit={save}>
          {error && <div className="alert danger span-2">{error}</div>}

          <div className="catalog-preview span-2">
            <div>
              <small>Cadastro corporativo</small>
              <strong>{form.sku || 'SKU'} · {form.name || 'Nome do material'}</strong>
              <span>{categories.find(([key]) => key === form.category)?.[1] || 'Categoria'} · {form.requiresSerial ? 'Controlado por serial' : `Controlado por quantidade em ${form.unit}`}</span>
            </div>
            <div>
              <small>Valor de referência</small>
              <strong>{brl(form.unitCost)}</strong>
              <span>Mínimo: {brl(preview.valorMinimo)} · Máximo: {brl(preview.valorMaximo)}</span>
            </div>
            <div>
              <small>Política</small>
              <strong>{preview.politica}</strong>
              <span>Alerta de estoque: {preview.alerta}</span>
            </div>
          </div>

          <section className="form-section span-2">
            <div className="section-header"><span>1</span><div><h4>Identificação do item</h4><p>Dados principais exibidos em estoque, transferências, caixa do técnico e BI.</p></div></div>
            <div className="form-grid">
              <MaterialField label="SKU *" hint="Código interno único. Ex.: ONU-GPON-HG6145."><input value={form.sku} onChange={(e) => change('sku', e.target.value)} placeholder="ONU-GPON-HG6145" /></MaterialField>
              <MaterialField label="Nome *"><input value={form.name} onChange={(e) => change('name', e.target.value)} placeholder="ONU GPON Wi-Fi AC" /></MaterialField>
              <MaterialField label="Nome comercial"><input value={form.commercialName || ''} onChange={(e) => change('commercialName', e.target.value)} placeholder="Nome usado pelo fornecedor ou telecom" /></MaterialField>
              <MaterialField label="Categoria"><select value={form.category} onChange={(e) => change('category', e.target.value)}>{categories.map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select></MaterialField>
              <MaterialField label="Unidade de medida"><select value={form.unit} onChange={(e) => change('unit', e.target.value)}>{units.map((u) => <option key={u} value={u}>{u}</option>)}</select></MaterialField>
              <MaterialField label="Unidade"><input type="number" min="0" step="0.001" value={form.packageQuantity} onChange={(e) => change('packageQuantity', e.target.value)} /></MaterialField>
            </div>
          </section>


          <section className="form-section span-2">
            <div className="section-header"><span>2</span><div><h4>Estoque, custo e reposição</h4><p>Base para alertas, BI financeiro, curva de reposição e previsão de compra.</p></div></div>
            <div className="form-grid">
              <MaterialField label="Valor unitário"><input type="number" min="0" step="0.01" value={form.unitCost} onChange={(e) => change('unitCost', e.target.value)} /></MaterialField>
              <MaterialField label="Estoque mínimo"><input type="number" min="0" value={form.minStock} onChange={(e) => change('minStock', e.target.value)} /></MaterialField>
              <MaterialField label="Estoque máximo"><input type="number" min="0" value={form.maxStock} onChange={(e) => change('maxStock', e.target.value)} /></MaterialField>
              <MaterialField label="Ponto de pedido"><input type="number" min="0" value={form.reorderPoint} onChange={(e) => change('reorderPoint', e.target.value)} /></MaterialField>
              <MaterialField label="Prazo de reposição em dias"><input type="number" min="0" value={form.leadTimeDays} onChange={(e) => change('leadTimeDays', e.target.value)} /></MaterialField>
              <MaterialField label="Criticidade"><select value={form.criticality} onChange={(e) => change('criticality', e.target.value)}><option value="baixa">Baixa</option><option value="media">Média</option><option value="alta">Alta</option><option value="critica">Crítica</option></select></MaterialField>
            </div>
          </section>

          {!form.id && <section className="form-section span-2">
            <div className="section-header"><span>3</span><div><h4>Cadastro direto no estoque regional</h4><p>Não existe mais entrada em estoque central. Todo material novo deve nascer vinculado a um estoque regional.</p></div></div>
            <div className="form-grid">
              <MaterialField label="Estoque regional obrigatório"><select value={form.initialWarehouseId || ''} onChange={(e) => change('initialWarehouseId', e.target.value)}><option value="">Selecione o estoque regional</option>{warehouses.map((w) => <option key={w.id} value={w.id}>{w.name} • {w.city || w.region || w.code}</option>)}</select></MaterialField>
              {!form.requiresSerial && <MaterialField label="Quantidade inicial"><input type="number" min="0" step="0.001" value={form.initialQuantity || 0} onChange={(e) => change('initialQuantity', e.target.value)} /></MaterialField>}
              {form.requiresSerial && <MaterialField label="Seriais iniciais" className="span-2" hint={`${splitSerials(form.initialSerialsText).length} serial(is) informado(s). Cada linha vira um equipamento em estoque.`}><textarea rows="5" value={form.initialSerialsText || ''} onChange={(e) => change('initialSerialsText', e.target.value)} placeholder="Um serial por linha" /></MaterialField>}
            </div>
          </section>}

          <section className="form-section span-2">
            <div className="section-header"><span>4</span><div><h4>Regras de movimentação</h4><p>Define como o item pode sair do estoque e aparecer na caixa do técnico.</p></div></div>
            <div className="form-grid">
              <MaterialField label="Política de movimentação"><select value={form.movementPolicy} onChange={(e) => change('movementPolicy', e.target.value)}><option value="livre">Livre</option><option value="aprovacao">Exige aprovação</option><option value="serial_obrigatorio">Serial obrigatório</option><option value="bloqueado">Bloqueado para movimentação</option></select></MaterialField>
              <MaterialField label="Tipo de inspeção"><select value={form.qualityInspection} onChange={(e) => change('qualityInspection', e.target.value)}><option value="visual">Visual</option><option value="serial">Serial/MAC</option><option value="nf">Conferência por NF</option><option value="tecnica">Técnica</option></select></MaterialField>
              <div className="check-grid span-2">
                <label className="check"><input type="checkbox" checked={!!form.requiresSerial} onChange={(e) => change('requiresSerial', e.target.checked)} /> Exige número de série</label>
                <label className="check"><input type="checkbox" checked={!!form.allowTechnicianTransfer} onChange={(e) => change('allowTechnicianTransfer', e.target.checked)} /> Pode ir para técnico</label>
                <label className="check"><input type="checkbox" checked={!!form.allowCustomerInstall} onChange={(e) => change('allowCustomerInstall', e.target.checked)} /> Pode ser baixado para cliente/OS</label>
                <label className="check"><input type="checkbox" checked={!!form.requiresReturnOnRemoval} onChange={(e) => change('requiresReturnOnRemoval', e.target.checked)} /> Exige retorno em retirada</label>
                <label className="check"><input type="checkbox" checked={!!form.autoLowStockAlert} onChange={(e) => change('autoLowStockAlert', e.target.checked)} /> Gerar alerta automático de estoque</label>
                <label className="check"><input type="checkbox" checked={!!form.active} onChange={(e) => change('active', e.target.checked)} /> Material ativo</label>
              </div>
            </div>
          </section>

          <section className="form-section span-2">
            <div className="section-header"><span>5</span><div><h4>Fiscal, localização e ciclo de vida</h4><p>Informações para conferência, auditoria e cálculo financeiro.</p></div></div>
            <div className="form-grid">
              <MaterialField label="NCM"><input value={form.ncm || ''} onChange={(e) => change('ncm', e.target.value)} /></MaterialField>
              <MaterialField label="Código fiscal"><input value={form.fiscalCode || ''} onChange={(e) => change('fiscalCode', e.target.value)} /></MaterialField>
              <MaterialField label="Código contábil"><input value={form.accountingCode || ''} onChange={(e) => change('accountingCode', e.target.value)} /></MaterialField>
              <MaterialField label="Centro de custo"><input value={form.costCenter || ''} onChange={(e) => change('costCenter', e.target.value)} /></MaterialField>
              <MaterialField label="Prefixo patrimonial"><input value={form.patrimonyPrefix || ''} onChange={(e) => change('patrimonyPrefix', e.target.value)} placeholder="ONU, ROT, DROP..." /></MaterialField>
              <MaterialField label="Local de armazenagem"><input value={form.storageLocation || ''} onChange={(e) => change('storageLocation', e.target.value)} placeholder="Almoxarifado A" /></MaterialField>
              <MaterialField label="Prateleira / Rua"><input value={form.shelf || ''} onChange={(e) => change('shelf', e.target.value)} placeholder="A-03 / Rua 2" /></MaterialField>
              <MaterialField label="Garantia em dias"><input type="number" min="0" value={form.warrantyDays} onChange={(e) => change('warrantyDays', e.target.value)} /></MaterialField>
              <MaterialField label="Vida útil em meses"><input type="number" min="0" value={form.usefulLifeMonths} onChange={(e) => change('usefulLifeMonths', e.target.value)} /></MaterialField>
              <MaterialField label="Peso em kg"><input type="number" min="0" step="0.001" value={form.weightKg} onChange={(e) => change('weightKg', e.target.value)} /></MaterialField>
              <MaterialField label="Dimensões"><input value={form.dimensions || ''} onChange={(e) => change('dimensions', e.target.value)} placeholder="20x15x5 cm" /></MaterialField>
              <MaterialField label="Observações" className="span-2"><textarea rows="4" value={form.notes || ''} onChange={(e) => change('notes', e.target.value)} placeholder="Regras internas, compatibilidade, observações de conferência, cuidados de estoque..." /></MaterialField>
            </div>
          </section>
        </form>
      </Modal>

      <DetailsModal open={!!details} title={`Detalhes do material ${details?.sku || ''}`} onClose={() => setDetails(null)} footer={<><button className="ghost" onClick={() => setDetails(null)}>Fechar</button>{isAdmin && details && <button onClick={() => { openEdit(details); setDetails(null); }}>Editar material</button>}</>}>
        {details && <>
          <DetailGrid fields={[
            ['SKU', details.sku], ['Nome', details.name], ['Nome comercial', details.commercialName], ['Categoria', details.category], ['Unidade', details.unit], ['Exige serial', details.requiresSerial],
            ['Estoque atual', formatQuantity(details.mainStock, details.unit)], ['Estoque mínimo', formatQuantity(details.minStock, details.unit)], ['Estoque máximo', formatQuantity(details.maxStock, details.unit)], ['Ponto de pedido', formatQuantity(details.reorderPoint, details.unit)], ['Valor unitário', brl(details.unitCost)], ['Prazo reposição', `${details.leadTimeDays || 0} dia(s)`],
            ['Criticidade', details.criticality], ['Política', details.movementPolicy], ['Inspeção', details.qualityInspection], ['Pode ir para técnico', details.allowTechnicianTransfer], ['Pode ir para cliente', details.allowCustomerInstall], ['Exige retorno', details.requiresReturnOnRemoval],
            ['NCM', details.ncm], ['Código fiscal', details.fiscalCode], ['Código contábil', details.accountingCode], ['Centro de custo', details.costCenter], ['Prefixo patrimonial', details.patrimonyPrefix], ['Local', details.storageLocation], ['Prateleira', details.shelf],
            ['Garantia', `${details.warrantyDays || 0} dia(s)`], ['Vida útil', `${details.usefulLifeMonths || 0} mês(es)`], ['Peso', `${details.weightKg || 0} kg`], ['Dimensões', details.dimensions], ['Status', details.active ? 'Ativo' : 'Inativo'], ['Criado em', details.createdAt],
          ]} />
          {details.notes && <div className="viz-callout">📝 {details.notes}</div>}
          <div className="viz-callout">Este material pode ser movimentado por entrada fiscal, solicitação, aprovação, transferência para técnico, baixa por OS e retorno ao estoque. Todo movimento gera histórico e auditoria.</div>
        </>}
      </DetailsModal>
    </div>
  );
}
