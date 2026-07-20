import { useEffect, useMemo, useState } from 'react';
import api from '../services/api';
import KpiCard from '../components/KpiCard';
import SimpleBar from '../components/SimpleBar';
import ChartPanel from '../components/ChartPanel';
import BIFilters, { EMPTY_FILTERS, toParams } from '../components/BIFilters';

function brl(value) { return Number(value || 0).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' }); }
function countBy(rows = [], key) { return rows.reduce((acc, row) => { const value = row[key] || 'sem_informacao'; acc[value] = (acc[value] || 0) + 1; return acc; }, {}); }
function objChart(obj) { return { labels: Object.keys(obj), datasets: [{ label: 'Total', data: Object.values(obj) }] }; }
function monthLabel(value) { const d = new Date(value); return `${String(d.getMonth() + 1).padStart(2, '0')}/${String(d.getFullYear()).slice(-2)}`; }
function groupByMonth(rows = [], field = 'createdAt') { const acc = {}; rows.forEach((row) => { if (!row[field]) return; const label = monthLabel(row[field]); acc[label] = (acc[label] || 0) + 1; }); return acc; }

export default function BIExecutive() {
  const [data, setData] = useState(null);
  const [filters, setFilters] = useState(EMPTY_FILTERS);
  const [appliedFilters, setAppliedFilters] = useState(EMPTY_FILTERS);
  const [loading, setLoading] = useState(true);

  function load(nextFilters = appliedFilters) {
    setLoading(true);
    api.get('/bi/executive', { params: toParams(nextFilters) })
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
    const materials = data.materials || [];
    const top = (data.topTechnicians || []).slice(0, 8);
    const transfers = data.transfers || [];
    const orders = data.orders || [];
    const movementMonths = groupByMonth(data.movements || [], 'movementAt');
    return {
      stockVsTechnician: {
        labels: materials.slice(0, 8).map((m) => m.name),
        datasets: [
          { label: 'Estoque', data: materials.slice(0, 8).map((m) => Number(m.estoque || 0)) },
          { label: 'Com técnicos', data: materials.slice(0, 8).map((m) => Number(m.tecnico || 0)) },
          { label: 'Instalado', data: materials.slice(0, 8).map((m) => Number(m.instalado || 0)) },
        ],
      },
      topTechnicians: { labels: top.map((t) => t.name), datasets: [{ label: 'Valor em carga', data: top.map((t) => Number(t.assetValue || 0)) }] },
      assetsByOwner: { labels: (data.assetsByOwner || []).map((i) => i.ownerType), datasets: [{ label: 'Equipamentos', data: (data.assetsByOwner || []).map((i) => Number(i.total || 0)) }] },
      transferStatus: objChart(countBy(transfers, 'status')),
      osStatus: objChart(countBy(orders, 'status')),
      movementTrend: { labels: Object.keys(movementMonths), datasets: [{ label: 'Movimentações', data: Object.values(movementMonths), fill: true }] },
    };
  }, [data]);

  if (!data || !charts) return <div className="panel">Carregando BI...</div>;
  const c = data.cards;
  const maxMat = Math.max(...data.materials.map((m) => Number(m.tecnico || 0)), 1);
  return (
    <div className="page-grid bi-page">
      <div className="toolbar"><div><h2>BI Executivo</h2><p>Visão consolidada do estoque, patrimônio, OS, transferências, assinaturas e carga em campo.</p></div><div className="row-actions"><button className="ghost" onClick={() => load(appliedFilters)}>🔄 Atualizar</button><button onClick={() => window.print()}>🖨️ Imprimir</button></div></div>
      <BIFilters value={filters} onChange={setFilters} onApply={applyFilters} onReset={resetFilters} loading={loading} />
      <div className="kpi-grid"><KpiCard label="Patrimônio total" value={brl(c.patrimonyTotal)} /><KpiCard label="Valor com técnicos" value={brl(c.patrimonyInTechnicians)} tone="warning" /><KpiCard label="Equip. em estoque" value={c.assetsInStock} /><KpiCard label="Equip. instalados" value={c.installedAssets} /><KpiCard label="Equip. perdidos" value={c.lostAssets || 0} tone="danger" /><KpiCard label="Valor perdido" value={brl(c.lostValue)} tone="danger" /><KpiCard label="Guias pendentes" value={c.pendingSignatures} tone="danger" /><KpiCard label="Custódia +60 dias" value={c.custody60} tone="danger" /></div>
      <section className="bi-charts-grid">
        <ChartPanel title="Estoque x carga x instalado" subtitle="Comparativo dos principais materiais por posição operacional." data={charts.stockVsTechnician} />
        <ChartPanel title="Ranking patrimonial por técnico" subtitle="Valor em responsabilidade dos técnicos." data={charts.topTechnicians} />
        <ChartPanel title="Distribuição patrimonial" subtitle="Onde os equipamentos serializados estão alocados." type="doughnut" data={charts.assetsByOwner} />
        <ChartPanel title="Status das guias" subtitle="Assinaturas e entregas por status." type="pie" data={charts.transferStatus} />
        <ChartPanel title="Status das OS" subtitle="Ordens abertas, pendentes e concluídas." data={charts.osStatus} />
        <ChartPanel title="Evolução das movimentações" subtitle="Entradas, transferências e baixas registradas por mês." type="line" data={charts.movementTrend} />
      </section>
      <section className="panel two-col"><div><h3>Materiais em carga de técnicos</h3>{data.materials.map((m) => <SimpleBar key={m.id} label={m.name} value={m.tecnico} max={maxMat} />)}</div><div><h3>Top técnicos por valor</h3>{data.topTechnicians.map((t) => <SimpleBar key={t.id} label={t.name} value={t.assetValue} max={data.topTechnicians[0]?.assetValue || 1} money />)}</div></section>
    </div>
  );
}
