/* eslint-disable react-hooks/exhaustive-deps */
import { useEffect, useState } from 'react';
import api from '../services/api';
import KpiCard from '../components/KpiCard';
import Modal from '../components/Modal';
import DetailsModal, { DetailGrid } from '../components/DetailsModal';

function brl(value) { return Number(value || 0).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' }); }

const EMPTY_SEARCH_FIELDS = Array.from({ length: 10 }, () => '');

export default function Patrimony() {
  const [assets, setAssets] = useState([]);
  const [serial, setSerial] = useState('');
  const [searchModal, setSearchModal] = useState(false);
  const [searchFields, setSearchFields] = useState(EMPTY_SEARCH_FIELDS);
  const [searching, setSearching] = useState(false);
  const [details, setDetails] = useState(null);

  async function load(params = {}) {
    setAssets((await api.get('/stock/assets', { params })).data.data || []);
  }

  useEffect(() => { load(); }, []);

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
        await load();
        setSerial('');
        setSearchModal(false);
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

      if (!found.length) window.alert('Nenhum patrimônio encontrado para os seriais informados.');
    } finally {
      setSearching(false);
    }
  }

  function clearSearch() {
    setSearchFields(EMPTY_SEARCH_FIELDS);
    setSerial('');
    load();
  }

  const total = assets.reduce((s, a) => s + Number(a.acquisitionCost || 0), 0);
  const activeSearchCount = getSearchTerms().length;

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

      <div className="kpi-grid small"><KpiCard label="Equipamentos listados" value={assets.length} /><KpiCard label="Valor patrimonial" value={brl(total)} /><KpiCard label="Com técnicos" value={assets.filter((a) => a.ownerType === 'tecnico').length} /></div>
      <section className="panel"><div className="table-wrap"><table><thead><tr><th>Serial</th><th>Material</th><th>MAC</th><th>Status</th><th>Responsável</th><th>Cliente</th><th>Dias carga</th><th>Valor</th><th className="action-cell">Opções</th></tr></thead><tbody>{assets.map((a) => <tr key={a.id}><td>{a.serialNumber}</td><td>{a.Material?.name}</td><td>{a.mac || '-'}</td><td>{a.status}</td><td>{a.Technician?.name || a.Warehouse?.name || a.ownerType}</td><td>{a.customerName || '-'}</td><td>{a.custodyDays}</td><td>{brl(a.acquisitionCost)}</td><td><div className="action-toolbar"><button className="info" onClick={() => setDetails(a)}>Detalhes</button></div></td></tr>)}</tbody></table></div></section>

      <Modal open={searchModal} title="🔎 Buscar patrimônios" onClose={() => setSearchModal(false)} footer={<><button className="ghost" onClick={() => setSearchModal(false)}>Cancelar</button><button className="ghost" onClick={() => setSearchFields(EMPTY_SEARCH_FIELDS)}>Limpar campos</button><button onClick={runMultiSearch} disabled={searching}>{searching ? 'Buscando...' : `Buscar ${activeSearchCount || ''}`}</button></>}>
        <p className="muted">Digite até 10 seriais para consultar vários patrimônios de uma vez. O sistema ignora campos vazios e não repete resultados.</p>
        <div className="patrimony-search-grid">
          {searchFields.map((value, index) => (
            <label key={index}>Serial {index + 1}<input value={value} onChange={(e) => updateSearchField(index, e.target.value)} placeholder={`Ex.: ONU-${String(index + 1).padStart(3, '0')}`} /></label>
          ))}
        </div>
      </Modal>

      <DetailsModal open={!!details} title={`Detalhes do patrimônio ${details?.serialNumber || ''}`} onClose={() => setDetails(null)}>
        {details && <><DetailGrid fields={[["Serial", details.serialNumber], ["Material", details.Material?.name], ["MAC", details.mac], ["Marca", details.brand], ["Modelo", details.model], ["Status", details.status], ["Local atual", details.Warehouse?.name || details.ownerType], ["Técnico", details.Technician?.name], ["Cliente", details.customerName], ["Nº contrato", details.customerCpf], ["Data custódia", details.custodyStartedAt], ["Dias em carga", details.custodyDays], ["Instalado em", details.installedAt], ["Último movimento", details.lastMovementAt], ["Valor", brl(details.acquisitionCost)], ["Observações", details.notes]]} /><div className="viz-callout">Use esta janela para conferência de inventário, auditoria de serial e consulta rápida de responsabilidade patrimonial.</div></>}
      </DetailsModal>
    </div>
  );
}
