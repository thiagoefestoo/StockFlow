import { useEffect, useMemo, useState } from 'react';
import api from '../services/api';

const EMPTY_FILTERS = {
  periodPreset: '90d',
  startDate: '',
  endDate: '',
  calculationMode: 'competencia',
  technicianId: '',
  companyId: '',
  materialId: '',
  category: '',
  requiresSerial: '',
  ownerType: '',
  assetStatus: '',
  movementType: '',
  transferStatus: '',
  orderStatus: '',
  serviceType: '',
  sourceCompany: '',
  fiscalDocumentType: '',
  conferenceStatus: '',
  minValue: '',
  maxValue: '',
  search: '',
};

const FILTER_STORAGE_KEY = 'superinfra.bi.filters.collapsed';

const FIELD_LABELS = {
  periodPreset: 'Período',
  startDate: 'Data inicial',
  endDate: 'Data final',
  calculationMode: 'Cálculo',
  technicianId: 'Técnico',
  companyId: 'Empresa',
  materialId: 'Material',
  category: 'Categoria',
  requiresSerial: 'Tipo de item',
  ownerType: 'Local',
  assetStatus: 'Status patrimônio',
  movementType: 'Movimento',
  transferStatus: 'Status guia',
  orderStatus: 'Status OS',
  serviceType: 'Tipo OS',
  sourceCompany: 'Fornecedor',
  fiscalDocumentType: 'Documento',
  conferenceStatus: 'Conferência',
  minValue: 'Valor mín.',
  maxValue: 'Valor máx.',
  search: 'Busca',
};

const STATIC_LABELS = {
  periodPreset: {
    all: 'Todo histórico',
    today: 'Hoje',
    '7d': 'Últimos 7 dias',
    '15d': 'Últimos 15 dias',
    '30d': 'Últimos 30 dias',
    '60d': 'Últimos 60 dias',
    '90d': 'Últimos 90 dias',
    '180d': 'Últimos 180 dias',
    month: 'Mês atual',
    lastMonth: 'Mês anterior',
    year: 'Ano atual',
    custom: 'Datas personalizadas',
  },
  calculationMode: {
    competencia: 'Competência',
    movimento: 'Data da movimentação',
    responsabilidade: 'Responsabilidade atual',
    caixa: 'Caixa de técnico',
    cliente: 'Cliente/instalado',
  },
  requiresSerial: {
    true: 'Serializados',
    false: 'Consumíveis',
  },
};

function optionList(rows = [], labelKey = 'name', valueKey = 'id') {
  return rows.map((row) => ({ value: String(row[valueKey] ?? ''), label: row[labelKey] || row.name || row.label || row.value || '-' }));
}

function uniqueOptions(rows = []) {
  return rows.filter(Boolean).map((value) => ({ value: String(value), label: String(value) }));
}

function toParams(filters) {
  const params = {};
  Object.entries(filters || {}).forEach(([key, value]) => {
    if (value !== '' && value !== null && value !== undefined) params[key] = value;
  });
  return params;
}

function readInitialCollapsed() {
  try {
    return window.localStorage.getItem(FILTER_STORAGE_KEY) === 'true';
  } catch (_) {
    return false;
  }
}

export { EMPTY_FILTERS, toParams };

export default function BIFilters({ value, onChange, onApply, onReset, loading, compact = false }) {
  const [options, setOptions] = useState(null);
  const [collapsed, setCollapsed] = useState(readInitialCollapsed);
  const filters = { ...EMPTY_FILTERS, ...(value || {}) };

  useEffect(() => {
    api.get('/bi/filter-options').then((response) => setOptions(response.data.data)).catch(() => setOptions({}));
  }, []);

  const lists = useMemo(() => {
    const data = options || {};
    return {
      technicians: optionList(data.technicians),
      companies: optionList(data.companies),
      materials: optionList(data.materials),
      categories: uniqueOptions(data.categories),
      sourceCompanies: uniqueOptions(data.sourceCompanies),
      ownerTypes: uniqueOptions(data.ownerTypes),
      assetStatuses: uniqueOptions(data.assetStatuses),
      movementTypes: uniqueOptions(data.movementTypes),
      transferStatuses: uniqueOptions(data.transferStatuses),
      orderStatuses: uniqueOptions(data.orderStatuses),
      serviceTypes: uniqueOptions(data.serviceTypes),
      fiscalDocumentTypes: uniqueOptions(data.fiscalDocumentTypes),
      conferenceStatuses: uniqueOptions(data.conferenceStatuses),
    };
  }, [options]);

  const optionMaps = useMemo(() => {
    const build = (items = []) => Object.fromEntries(items.map((item) => [String(item.value), item.label]));
    return {
      technicianId: build(lists.technicians),
      companyId: build(lists.companies),
      materialId: build(lists.materials),
      category: build(lists.categories),
      ownerType: build(lists.ownerTypes),
      assetStatus: build(lists.assetStatuses),
      movementType: build(lists.movementTypes),
      transferStatus: build(lists.transferStatuses),
      orderStatus: build(lists.orderStatuses),
      serviceType: build(lists.serviceTypes),
      sourceCompany: build(lists.sourceCompanies),
      fiscalDocumentType: build(lists.fiscalDocumentTypes),
      conferenceStatus: build(lists.conferenceStatuses),
    };
  }, [lists]);

  const activeFilters = useMemo(() => Object.entries(filters)
    .filter(([key, currentValue]) => {
      const baseValue = EMPTY_FILTERS[key];
      return currentValue !== '' && currentValue !== null && currentValue !== undefined && String(currentValue) !== String(baseValue || '');
    })
    .map(([key, currentValue]) => {
      const label = FIELD_LABELS[key] || key;
      const readableValue = STATIC_LABELS[key]?.[String(currentValue)] || optionMaps[key]?.[String(currentValue)] || String(currentValue);
      return { key, label, value: readableValue };
    }), [filters, optionMaps]);

  function setField(field, fieldValue) {
    onChange({ ...filters, [field]: fieldValue });
  }

  function toggleCollapsed() {
    const next = !collapsed;
    setCollapsed(next);
    try {
      window.localStorage.setItem(FILTER_STORAGE_KEY, String(next));
    } catch (_) {}
  }

  function SelectField({ label, field, children, options: fieldOptions = [] }) {
    return (
      <label>
        <span>{label}</span>
        <select value={filters[field] || ''} onChange={(event) => setField(field, event.target.value)}>
          <option value="">Todos</option>
          {children || fieldOptions.map((item) => <option key={`${field}-${item.value}`} value={item.value}>{item.label}</option>)}
        </select>
      </label>
    );
  }

  return (
    <section className={`panel bi-filter-panel ${compact ? 'compact' : ''} ${collapsed ? 'is-collapsed' : 'is-expanded'}`}>
      <div className="panel-title bi-filter-head">
        <div>
          <h3>🎛️ Filtros inteligentes do BI</h3>
          <p>{collapsed ? 'Filtros recolhidos para ampliar a área dos gráficos. Clique em Mostrar filtros para alterar a análise.' : 'Filtre por período, técnico, empresa, material, status, tipo de movimento, valor, documento e busca livre. Os KPIs, gráficos e listas são recalculados ao aplicar.'}</p>
        </div>
        <div className="row-actions">
          <button className="ghost bi-filter-toggle" type="button" onClick={toggleCollapsed} aria-expanded={!collapsed}>
            {collapsed ? '👁️ Mostrar filtros' : '🙈 Ocultar filtros'}
          </button>
          <button className="ghost" type="button" onClick={onReset}>🧹 Limpar</button>
          <button type="button" onClick={onApply} disabled={loading}>{loading ? 'Calculando...' : '🔎 Aplicar filtros'}</button>
        </div>
      </div>

      <div className="bi-filter-summary" aria-live="polite">
        <span className="bi-filter-chip primary">{activeFilters.length ? `${activeFilters.length} filtros ativos` : 'Filtro padrão: últimos 90 dias'}</span>
        {activeFilters.slice(0, collapsed ? 10 : 6).map((item) => (
          <span className="bi-filter-chip" key={`${item.key}-${item.value}`}>{item.label}: {item.value}</span>
        ))}
        {activeFilters.length > (collapsed ? 10 : 6) && <span className="bi-filter-chip">+{activeFilters.length - (collapsed ? 10 : 6)} filtros</span>}
      </div>

      {!collapsed && (
        <div className="filter-grid advanced-filter-grid">
          <SelectField label="Período rápido" field="periodPreset">
            <option value="all">Todo histórico</option>
            <option value="today">Hoje</option>
            <option value="7d">Últimos 7 dias</option>
            <option value="15d">Últimos 15 dias</option>
            <option value="30d">Últimos 30 dias</option>
            <option value="60d">Últimos 60 dias</option>
            <option value="90d">Últimos 90 dias</option>
            <option value="180d">Últimos 180 dias</option>
            <option value="month">Mês atual</option>
            <option value="lastMonth">Mês anterior</option>
            <option value="year">Ano atual</option>
            <option value="custom">Datas personalizadas</option>
          </SelectField>
          <label><span>Data inicial</span><input type="date" value={filters.startDate || ''} onChange={(event) => setField('startDate', event.target.value)} /></label>
          <label><span>Data final</span><input type="date" value={filters.endDate || ''} onChange={(event) => setField('endDate', event.target.value)} /></label>
          <SelectField label="Modo de cálculo" field="calculationMode">
            <option value="competencia">Competência / data do documento</option>
            <option value="movimento">Data da movimentação</option>
            <option value="responsabilidade">Responsabilidade atual</option>
            <option value="caixa">Apenas caixa de técnico</option>
            <option value="cliente">Apenas cliente/instalado</option>
          </SelectField>

          <SelectField label="Técnico" field="technicianId" options={lists.technicians} />
          <SelectField label="Empresa / terceirizada" field="companyId" options={lists.companies} />
          <SelectField label="Material" field="materialId" options={lists.materials} />
          <SelectField label="Categoria" field="category" options={lists.categories} />
          <SelectField label="Tipo de item" field="requiresSerial">
            <option value="true">Somente serializados</option>
            <option value="false">Somente consumíveis</option>
          </SelectField>
          <SelectField label="Onde está o patrimônio" field="ownerType" options={lists.ownerTypes} />
          <SelectField label="Status patrimonial" field="assetStatus" options={lists.assetStatuses} />
          <SelectField label="Tipo de movimento" field="movementType" options={lists.movementTypes} />
          <SelectField label="Status da guia" field="transferStatus" options={lists.transferStatuses} />
          <SelectField label="Status da OS" field="orderStatus" options={lists.orderStatuses} />
          <SelectField label="Tipo de OS" field="serviceType" options={lists.serviceTypes} />
          <SelectField label="Fornecedor/origem" field="sourceCompany" options={lists.sourceCompanies} />
          <SelectField label="Tipo de documento" field="fiscalDocumentType" options={lists.fiscalDocumentTypes} />
          <SelectField label="Conferência" field="conferenceStatus" options={lists.conferenceStatuses} />
          <label><span>Valor mínimo</span><input type="number" step="0.01" placeholder="Ex.: 100" value={filters.minValue || ''} onChange={(event) => setField('minValue', event.target.value)} /></label>
          <label><span>Valor máximo</span><input type="number" step="0.01" placeholder="Ex.: 5000" value={filters.maxValue || ''} onChange={(event) => setField('maxValue', event.target.value)} /></label>
          <label className="wide-filter"><span>Busca livre</span><input placeholder="Serial, OS, guia, cliente, contrato, NF, material, técnico..." value={filters.search || ''} onChange={(event) => setField('search', event.target.value)} /></label>
        </div>
      )}
    </section>
  );
}
