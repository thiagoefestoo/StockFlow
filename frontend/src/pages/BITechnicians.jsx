import { useEffect, useMemo, useState } from 'react';
import api from '../services/api';
import KpiCard from '../components/KpiCard';
import SimpleBar from '../components/SimpleBar';
import ChartPanel from '../components/ChartPanel';
import BIFilters, { EMPTY_FILTERS, toParams } from '../components/BIFilters';

function brl(value) { return Number(value || 0).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' }); }
function objChart(obj) { return { labels: Object.keys(obj || {}), datasets: [{ label: 'Total', data: Object.values(obj || {}) }] }; }
function bucket(rows, fn) { return rows.reduce((acc, row) => { const label = fn(row); acc[label] = (acc[label] || 0) + 1; return acc; }, {}); }

export default function BITechnicians() {
  const [data, setData] = useState(null);
  const [filters, setFilters] = useState(EMPTY_FILTERS);
  const [appliedFilters, setAppliedFilters] = useState(EMPTY_FILTERS);
  const [loading, setLoading] = useState(true);

  function load(nextFilters = appliedFilters) {
    setLoading(true);
    api.get('/bi/technicians', { params: toParams(nextFilters) })
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
    const rows = data.technicians || [];
    const top = rows.slice(0, 10);
    const custodyBuckets = bucket(rows, (r) => Number(r.oldAssets || 0) > 0 ? 'Com item +60 dias' : 'Sem item crítico');
    const valueBuckets = bucket(rows, (r) => Number(r.assetValue || 0) >= 1000 ? 'Acima de R$ 1 mil' : Number(r.assetValue || 0) > 0 ? 'Até R$ 1 mil' : 'Sem patrimônio');
    return {
      score: { labels: top.map((r) => r.name), datasets: [{ label: 'Score', data: top.map((r) => Number(r.score || 0)) }] },
      value: { labels: top.map((r) => r.name), datasets: [{ label: 'Valor em carga', data: top.map((r) => Number(r.assetValue || 0)) }] },
      os: { labels: top.map((r) => r.name), datasets: [{ label: 'OS no mês', data: top.map((r) => Number(r.osMonth || 0)) }, { label: 'OS total', data: top.map((r) => Number(r.osTotal || 0)) }] },
      oldAssets: { labels: top.map((r) => r.name), datasets: [{ label: 'Equip. +60 dias', data: top.map((r) => Number(r.oldAssets || 0)) }] },
      typeDistribution: objChart(data.typeDistribution),
      statusDistribution: objChart(data.statusDistribution),
      custodyBuckets: objChart(custodyBuckets),
      valueBuckets: objChart(valueBuckets),
    };
  }, [data]);

  if (!data || !charts) return <div className="panel">Carregando BI de técnicos...</div>;
  const rows = data.technicians;
  const maxScore = Math.max(...rows.map((r) => r.score), 1);
  return (
    <div className="page-grid bi-page">
      <div className="toolbar"><div><h2>BI por Técnico</h2><p>Produtividade, patrimônio, carga individual, equipamentos parados e ranking operacional.</p></div><div className="row-actions"><button className="ghost" onClick={() => load(appliedFilters)}>🔄 Atualizar</button><button onClick={() => window.print()}>🖨️ Imprimir</button></div></div>
      <BIFilters value={filters} onChange={setFilters} onApply={applyFilters} onReset={resetFilters} loading={loading} />
      <div className="kpi-grid"><KpiCard label="Técnicos analisados" value={rows.length} /><KpiCard label="Média patrimonial" value={brl(data.averageValue)} /><KpiCard label="OS no mês" value={rows.reduce((s, r) => s + r.osMonth, 0)} /><KpiCard label="Equip. +60 dias" value={rows.reduce((s, r) => s + r.oldAssets, 0)} tone="danger" /></div>
      <section className="bi-charts-grid">
        <ChartPanel title="Score operacional" subtitle="Ranking ponderado por OS, patrimônio e riscos." data={charts.score} />
        <ChartPanel title="Valor em carga" subtitle="Patrimônio em responsabilidade individual." data={charts.value} />
        <ChartPanel title="OS por técnico" subtitle="Produção total e do mês." data={charts.os} />
        <ChartPanel title="Equipamentos parados" subtitle="Itens com mais de 60 dias em carga." data={charts.oldAssets} />
        <ChartPanel title="Tipo de técnico" subtitle="Interno, terceirizado e outros vínculos." type="doughnut" data={charts.typeDistribution} />
        <ChartPanel title="Status dos técnicos" subtitle="Ativos, inativos e bloqueados." type="pie" data={charts.statusDistribution} />
        <ChartPanel title="Risco de custódia" subtitle="Técnicos com ou sem equipamento crítico." type="doughnut" data={charts.custodyBuckets} />
        <ChartPanel title="Faixa patrimonial" subtitle="Distribuição por valor em carga." type="pie" data={charts.valueBuckets} />
      </section>
      <section className="panel"><h3>Ranking vivo</h3>{rows.map((r, index) => <div className="rank-row" key={r.id}><span className="rank-index">#{index + 1}</span><div><b>{r.name}</b><small>{r.company} • {r.assetCount} equipamentos • {r.osMonth} OS no mês • {r.oldAssets} antigos</small><SimpleBar label="Score" value={r.score} max={maxScore} /></div><strong>{brl(r.assetValue)}</strong></div>)}</section>
    </div>
  );
}
