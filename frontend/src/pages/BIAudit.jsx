import { useEffect, useMemo, useState } from 'react';
import api from '../services/api';
import KpiCard from '../components/KpiCard';
import SimpleBar from '../components/SimpleBar';
import ChartPanel from '../components/ChartPanel';
import BIFilters, { EMPTY_FILTERS, toParams } from '../components/BIFilters';

function objChartFromRows(rows = [], labelKey, valueKey = 'total') { return { labels: rows.map((r) => r[labelKey]), datasets: [{ label: 'Total', data: rows.map((r) => Number(r[valueKey] || 0)) }] }; }
function countBy(rows = [], key) { return rows.reduce((acc, row) => { const value = row[key] || 'sem_informacao'; acc[value] = (acc[value] || 0) + 1; return acc; }, {}); }
function objChart(obj) { return { labels: Object.keys(obj || {}), datasets: [{ label: 'Total', data: Object.values(obj || {}) }] }; }
function custodyBucket(days) { if (days >= 90) return '+90 dias'; if (days >= 60) return '60 a 89 dias'; if (days >= 30) return '30 a 59 dias'; return 'Até 29 dias'; }

export default function BIAudit() {
  const [data, setData] = useState(null);
  const [filters, setFilters] = useState(EMPTY_FILTERS);
  const [appliedFilters, setAppliedFilters] = useState(EMPTY_FILTERS);
  const [loading, setLoading] = useState(true);

  function load(nextFilters = appliedFilters) {
    setLoading(true);
    api.get('/bi/audit', { params: toParams(nextFilters) })
      .then((r) => setData(r.data.data))
      .finally(() => setLoading(false));
  }

  useEffect(() => { load(appliedFilters); }, []);

  function applyFilters() {
    setAppliedFilters(filters);
    load(filters);
  }

  function resetFilters() {
    setFilters(EMPTY_FILTERS);
    setAppliedFilters(EMPTY_FILTERS);
    load(EMPTY_FILTERS);
  }
  const charts = useMemo(() => {
    if (!data) return null;
    const transferStatus = countBy(data.recentTransfers || [], 'status');
    const custodyBuckets = (data.oldestCustody || []).reduce((acc, a) => { const label = custodyBucket(Number(a.custodyDays || 0)); acc[label] = (acc[label] || 0) + 1; return acc; }, {});
    const transferValues = (data.recentTransfers || []).slice(0, 10);
    return {
      movementsByType: objChartFromRows(data.movementsByType || [], 'type'),
      auditByAction: objChartFromRows(data.auditByAction || [], 'action'),
      transferStatus: objChart(transferStatus),
      custodyBuckets: objChart(custodyBuckets),
      assetsByStatus: objChartFromRows(data.assetsByStatus || [], 'status'),
      transferValues: { labels: transferValues.map((t) => t.transferNumber), datasets: [{ label: 'Valor da guia', data: transferValues.map((t) => Number(t.totalValue || 0)) }] },
    };
  }, [data]);

  if (!data || !charts) return <div className="panel">Carregando BI de auditoria...</div>;
  const maxMove = Math.max(...data.movementsByType.map((m) => Number(m.total)), 1);
  return (
    <div className="page-grid bi-page">
      <div className="toolbar"><div><h2>BI Auditoria e Patrimônio</h2><p>Controle de risco: movimentações, guias, auditoria, assinaturas e equipamentos antigos na carga.</p></div><div className="row-actions"><button className="ghost" onClick={() => load(appliedFilters)}>🔄 Atualizar</button><button onClick={() => window.print()}>🖨️ Imprimir</button></div></div>
      <BIFilters value={filters} onChange={setFilters} onApply={applyFilters} onReset={resetFilters} loading={loading} />
      <div className="kpi-grid"><KpiCard label="Tipos de movimento" value={data.movementsByType.length} /><KpiCard label="Eventos de auditoria" value={data.auditByAction.reduce((s, a) => s + Number(a.total), 0)} /><KpiCard label="Guias recentes" value={data.recentTransfers.length} /><KpiCard label="Custódias críticas" value={data.oldestCustody.filter((a) => a.custodyDays >= 60).length} tone="danger" /></div>
      <section className="bi-charts-grid">
        <ChartPanel title="Movimentações por tipo" subtitle="Entradas, transferências, baixas e ajustes." data={charts.movementsByType} />
        <ChartPanel title="Auditoria por ação" subtitle="Eventos auditáveis gravados pelo sistema." data={charts.auditByAction} />
        <ChartPanel title="Status das guias" subtitle="Controle de assinatura e entrega." type="doughnut" data={charts.transferStatus} />
        <ChartPanel title="Faixas de custódia" subtitle="Risco por tempo de material em campo." type="pie" data={charts.custodyBuckets} />
        <ChartPanel title="Status patrimonial" subtitle="Situação atual dos equipamentos serializados." type="doughnut" data={charts.assetsByStatus} />
        <ChartPanel title="Valor das guias recentes" subtitle="Últimas guias e seu valor movimentado." data={charts.transferValues} />
      </section>
      <section className="panel two-col"><div><h3>Movimentações por tipo</h3>{data.movementsByType.map((m) => <SimpleBar key={m.type} label={m.type} value={m.total} max={maxMove} />)}</div><div><h3>Equipamentos mais antigos em campo</h3>{data.oldestCustody.slice(0, 30).map((a) => <div className="event compact" key={a.id}><strong>{a.serialNumber}</strong><span>{a.Material?.name} • {a.Technician?.name}</span><small>{a.custodyDays} dias em custódia</small></div>)}</div></section>
    </div>
  );
}
