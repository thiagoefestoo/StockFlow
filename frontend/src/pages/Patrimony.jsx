/* eslint-disable react-hooks/exhaustive-deps */
import { useEffect, useState } from 'react';
import api from '../services/api';
import KpiCard from '../components/KpiCard';
import Modal from '../components/Modal';
import DetailsModal, { DetailGrid } from '../components/DetailsModal';
import Pagination from '../components/Pagination';

function brl(value) { return Number(value || 0).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' }); }

const EMPTY_SEARCH_FIELDS = Array.from({ length: 10 }, () => '');
const PAGE_SIZE = 15;

export default function Patrimony() {
  const [assets, setAssets] = useState([]);
  const [serial, setSerial] = useState('');
  const [searchModal, setSearchModal] = useState(false);
  const [searchFields, setSearchFields] = useState(EMPTY_SEARCH_FIELDS);
  const [searching, setSearching] = useState(false);
  const [details, setDetails] = useState(null);
  const [page, setPage] = useState(1);
  const [pagination, setPagination] = useState({ page: 1, pageSize: PAGE_SIZE, total: 0, totalPages: 1 });
  const [loading, setLoading] = useState(false);
  const [multiSearchActive, setMultiSearchActive] = useState(false);

  async function load(targetPage = page) {
    setLoading(true);
    try {
      const response = await api.get('/stock/assets', { params: { page: targetPage, pageSize: PAGE_SIZE } });
      setAssets(response.data.data || []);
      setPagination(response.data.pagination || { page: targetPage, pageSize: PAGE_SIZE, total: response.data.data?.length || 0, totalPages: 1 });
      setPage(targetPage);
      setMultiSearchActive(false);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => { load(1); }, []);

  function updateSearchField(index, value) {
    const next = [...searchFields];
    next[index] = value;
    setSearchFields(next);
  }

  function getSearchTerms() {
    const terms = searchFields
      .flatMap((value) => String(value || '').split(/\n|,|;/))
      .map((value) => value.trim())
      .filter(Boolean);
    return Array.from(new Set(terms)).slice(0, 10);
  }

  async function runMultiSearch() {
    const terms = getSearchTerms();
    setSearching(true);
    try {
      if (!terms.length) {
        setSerial('');
        setSearchModal(false);
        await load(1);
        return;
      }

      const responses = await Promise.all(
        terms.map((term) => api.get('/stock/assets', { params: { serial: term, limit: 100 } }).catch(() => ({ data: { data: [] } })))
      );

      const byId = new Map();
      for (const response of responses) {
        for (const asset of response.data.data || []) {
          byId.set(asset.id || asset.serialNumber, asset);
        }
      }

      const found = Array.from(byId.values());
      setAssets(found);
      setSerial(terms.join(', '));
      setDetails(null);
      setSearchModal(false);
      setMultiSearchActive(true);
      setPage(1);
      setPagination({ page: 1, pageSize: Math.max(found.length, 1), total: found.length, totalPages: 1 });

      if (!found.length) window.alert('Nenhum patrimônio encontrado para os seriais informados.');
    } finally {
      setSearching(false);
    }
  }

  function clearSearch() {
    setSearchFields(EMPTY_SEARCH_FIELDS);
    setSerial('');
    setDetails(null);
    load(1);
  }

  const totalValueOnPage = assets.reduce((sum, asset) => sum + Number(asset.acquisitionCost || 0), 0);
  const activeSearchCount = getSearchTerms().length;
  const listedCount = multiSearchActive ? assets.length : Number(pagination.total || 0);

  return (
    <div className="page-grid">
      <div className="toolbar">
        <div>
          <h2>Consulta patrimonial</h2>
          <p>Rastreie ONUs e equipamentos por serial, técnico, cliente e status.</p>
          {serial && <small className="muted">Filtro aplicado: {serial}</small>}
        </div>
        <div className="row-actions">
          <button onClick={() => setSearchModal(true)}>🔎 Buscar</button>
          {serial && <button className="ghost" onClick={clearSearch}>Limpar busca</button>}
        </div>
      </div>

      <div className="kpi-grid small">
        <KpiCard label={multiSearchActive ? 'Equipamentos encontrados' : 'Equipamentos cadastrados'} value={listedCount} />
        <KpiCard label="Valor da página" value={brl(totalValueOnPage)} />
        <KpiCard label="Com técnicos na página" value={assets.filter((asset) => asset.ownerType === 'tecnico').length} />
      </div>

      <section className="panel">
        {loading && <div className="loading-state">Carregando patrimônios...</div>}
        <div className="table-wrap">
          <table>
            <thead><tr><th>Serial</th><th>Material</th><th>MAC</th><th>Status</th><th>Responsável</th><th>Cliente</th><th>Dias carga</th><th>Valor</th><th className="action-cell">Opções</th></tr></thead>
            <tbody>
              {!loading && !assets.length && <tr><td colSpan="9"><div className="empty-state">Nenhum patrimônio encontrado.</div></td></tr>}
              {assets.map((asset) => <tr key={asset.id}><td>{asset.serialNumber}</td><td>{asset.Material?.name}</td><td>{asset.mac || '-'}</td><td>{asset.status}</td><td>{asset.Technician?.name || asset.Warehouse?.name || asset.ownerType}</td><td>{asset.customerName || '-'}</td><td>{asset.custodyDays}</td><td>{brl(asset.acquisitionCost)}</td><td><div className="action-toolbar"><button className="info" onClick={() => setDetails(asset)}>Detalhes</button></div></td></tr>)}
            </tbody>
          </table>
        </div>
        {!multiSearchActive && <Pagination {...pagination} page={page} loading={loading} onPageChange={load} />}
      </section>

      <Modal open={searchModal} title="🔎 Buscar patrimônios" onClose={() => setSearchModal(false)} footer={<><button className="ghost" onClick={() => setSearchModal(false)}>Cancelar</button><button className="ghost" onClick={() => setSearchFields(EMPTY_SEARCH_FIELDS)}>Limpar campos</button><button onClick={runMultiSearch} disabled={searching}>{searching ? 'Buscando...' : `Buscar ${activeSearchCount || ''}`}</button></>}>
        <p className="muted">Digite até 10 seriais para consultar vários patrimônios de uma vez. O sistema ignora campos vazios e não repete resultados.</p>
        <div className="patrimony-search-grid">
          {searchFields.map((value, index) => (
            <label key={index}>Serial {index + 1}<input value={value} onChange={(event) => updateSearchField(index, event.target.value)} placeholder={`Ex.: ONU-${String(index + 1).padStart(3, '0')}`} /></label>
          ))}
        </div>
      </Modal>

      <DetailsModal open={!!details} title={`Detalhes do patrimônio ${details?.serialNumber || ''}`} onClose={() => setDetails(null)}>
        {details && <><DetailGrid fields={[["Serial", details.serialNumber], ["Material", details.Material?.name], ["MAC", details.mac], ["Marca", details.brand], ["Modelo", details.model], ["Status", details.status], ["Local atual", details.Warehouse?.name || details.ownerType], ["Técnico", details.Technician?.name], ["Cliente", details.customerName], ["Nº contrato", details.customerCpf], ["Data custódia", details.custodyStartedAt], ["Dias em carga", details.custodyDays], ["Instalado em", details.installedAt], ["Último movimento", details.lastMovementAt], ["Valor", brl(details.acquisitionCost)], ["Observações", details.notes]]} /><div className="viz-callout">Use esta janela para conferência de inventário, auditoria de serial e consulta rápida de responsabilidade patrimonial.</div></>}
      </DetailsModal>
    </div>
  );
}
