import { useEffect, useMemo, useState } from 'react';
import api from '../services/api';
import KpiCard from '../components/KpiCard';
import ChartPanel from '../components/ChartPanel';
import SimpleBar from '../components/SimpleBar';
import BIFilters, { EMPTY_FILTERS, toParams } from '../components/BIFilters';

function brl(value) {
  return Number(value || 0).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
}

function pct(value) {
  return `${Number(value || 0).toLocaleString('pt-BR', { maximumFractionDigits: 1 })}%`;
}

function mapChart(obj = {}, label = 'Valor') {
  return {
    labels: Object.keys(obj),
    datasets: [{ label, data: Object.values(obj).map((value) => Number(value || 0)) }],
  };
}

function rowsToCsv(rows = []) {
  if (!rows.length) return '';
  const keys = Object.keys(rows[0]);
  const escape = (value) => `"${String(value ?? '').replace(/"/g, '""')}"`;
  return [keys.join(';'), ...rows.map((row) => keys.map((key) => escape(row[key])).join(';'))].join('\n');
}

function downloadFile(filename, content, type = 'text/csv;charset=utf-8;') {
  const blob = new Blob([content], { type });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = filename;
  link.click();
  URL.revokeObjectURL(url);
}

function exportExcelLike(filename, sheets) {
  const html = Object.entries(sheets).map(([title, rows]) => {
    const keys = rows?.[0] ? Object.keys(rows[0]) : [];
    const head = keys.map((key) => `<th>${key}</th>`).join('');
    const body = (rows || []).map((row) => `<tr>${keys.map((key) => `<td>${row[key] ?? ''}</td>`).join('')}</tr>`).join('');
    return `<h2>${title}</h2><table border="1"><thead><tr>${head}</tr></thead><tbody>${body}</tbody></table>`;
  }).join('<br/>');
  downloadFile(filename, `\uFEFF<html><meta charset="utf-8"/><body>${html}</body></html>`, 'application/vnd.ms-excel;charset=utf-8;');
}

function safeRows(rows = [], limit = 1000) {
  return rows.slice(0, limit).map((row) => ({ ...row }));
}

export default function BIFinancial() {
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [tab, setTab] = useState('visao');
  const [filters, setFilters] = useState(EMPTY_FILTERS);
  const [appliedFilters, setAppliedFilters] = useState(EMPTY_FILTERS);

  function load(nextFilters = appliedFilters) {
    setLoading(true);
    api.get('/bi/financial', { params: toParams(nextFilters) })
      .then((response) => setData(response.data.data))
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
    const flow = data.flowByMonth || [];
    const category = data.byCategory || [];
    const techs = (data.technicianFinance || []).slice(0, 10);
    const materials = (data.materialFinance || []).slice(0, 10);
    const position = data.stockTotals || {};
    const lowStock = data.lowStockRows || [];

    return {
      monthlyFlow: {
        labels: flow.map((item) => item.month),
        datasets: [
          { label: 'Entradas', data: flow.map((item) => Number(item.entrada || 0)) },
          { label: 'Transf. para técnicos', data: flow.map((item) => Number(item.transferencia || 0)) },
          { label: 'Baixas por OS', data: flow.map((item) => Number(item.baixa || 0)) },
          { label: 'Perdas', data: flow.map((item) => Number(item.perda || 0)) },
        ],
      },
      currentPosition: {
        labels: ['Estoque', 'Técnicos', 'Clientes', 'Manutenção', 'Perdido/baixado'],
        datasets: [{ label: 'Valor atual', data: [position.estoque, position.tecnico, position.cliente, position.manutencao, position.perdido].map((value) => Number(value || 0)) }],
      },
      categoryEntry: {
        labels: category.map((item) => item.label),
        datasets: [
          { label: 'Entradas', data: category.map((item) => Number(item.entrada || 0)) },
          { label: 'Baixa OS', data: category.map((item) => Number(item.baixa || 0)) },
        ],
      },
      categoryPosition: {
        labels: category.map((item) => item.label),
        datasets: [
          { label: 'Estoque', data: category.map((item) => Number(item.estoque || 0)) },
          { label: 'Técnico', data: category.map((item) => Number(item.tecnico || 0)) },
          { label: 'Cliente', data: category.map((item) => Number(item.cliente || 0)) },
        ],
      },
      technicians: {
        labels: techs.map((tech) => tech.name),
        datasets: [
          { label: 'Caixa atual', data: techs.map((tech) => Number(tech.custodyValue || 0)) },
          { label: 'Consumido em OS', data: techs.map((tech) => Number(tech.consumedValue || 0)) },
          { label: 'Risco aberto', data: techs.map((tech) => Number(tech.openFinancialRisk || 0)) },
        ],
      },
      materials: {
        labels: materials.map((mat) => mat.name),
        datasets: [
          { label: 'Entrada', data: materials.map((mat) => Number(mat.entryValue || 0)) },
          { label: 'Atual', data: materials.map((mat) => Number(mat.totalValue || 0)) },
          { label: 'Consumido', data: materials.map((mat) => Number(mat.consumedValue || 0)) },
        ],
      },
      transferStatus: mapChart(data.transferStatusValue, 'Valor das guias'),
      orderStatus: mapChart(data.orderStatusCost, 'Custo das OS'),
      movementValue: mapChart(data.movementTypeValue, 'Valor movimentado'),
      supplierValue: mapChart(data.sourceCompanyValue, 'Valor recebido'),
      replenishment: {
        labels: lowStock.map((item) => item.name),
        datasets: [{ label: 'Reposição estimada', data: lowStock.map((item) => Number(item.replenishmentValue || 0)) }],
      },
    };
  }, [data]);

  if (loading && !data) return <div className="panel">Carregando BI financeiro...</div>;
  if (!data || !charts) return <div className="panel">Não foi possível carregar o BI financeiro.</div>;

  const cards = data.cards || {};
  const maxTech = Math.max(...(data.technicianFinance || []).map((item) => Number(item.custodyValue || 0)), 1);
  const maxMaterial = Math.max(...(data.materialFinance || []).map((item) => Number(item.totalValue || 0)), 1);
  const maxRisk = Math.max(...(data.technicianFinance || []).map((item) => Number(item.openFinancialRisk || 0)), 1);

  function exportCsv() {
    const rows = [
      ...(data.recentEntries || []).map((row) => ({ tipo: 'entrada', ...row })),
      ...(data.recentTransfers || []).map((row) => ({ tipo: 'transferencia', ...row })),
      ...(data.recentConsumption || []).map((row) => ({ tipo: 'baixa_os', ...row })),
    ];
    downloadFile('stockflow-bi-financeiro.csv', rowsToCsv(rows));
  }

  function exportExcel() {
    exportExcelLike('stockflow-bi-financeiro.xls', {
      'Resumo financeiro': [cards],
      'Materiais': safeRows(data.materialFinance),
      'Técnicos': safeRows(data.technicianFinance),
      'Entradas': safeRows(data.recentEntries),
      'Transferências': safeRows(data.recentTransfers),
      'Baixas OS': safeRows(data.recentConsumption),
      'Riscos custódia': safeRows(data.custodyRiskAssets),
      'Reposição': safeRows(data.lowStockRows),
    });
  }

  return (
    <div className="page-grid bi-page financial-bi-page">
      <section className="finance-hero">
        <div>
          <span className="eyebrow">💰 BI financeiro</span>
          <h2>Financeiro patrimonial completo</h2>
          <p>Entradas, saídas, transferências, baixas por OS, capital em campo, risco financeiro, reposição sugerida e rastreabilidade de valor por técnico, material e categoria.</p>
        </div>
        <div className="row-actions">
          <button className="ghost" onClick={() => load(appliedFilters)}>🔄 Atualizar</button>
          <button className="ghost" onClick={exportCsv}>⬇️ CSV</button>
          <button onClick={exportExcel}>📗 Excel</button>
          <button onClick={() => window.print()}>🖨️ Imprimir</button>
        </div>
      </section>

      <BIFilters value={filters} onChange={setFilters} onApply={applyFilters} onReset={resetFilters} loading={loading} />

      <section className="kpi-grid finance-kpis">
        <KpiCard label="Entradas fiscais" value={brl(cards.totalEntries)} hint="Tudo que entrou via recebimento." />
        <KpiCard label="Transferido a técnicos" value={brl(cards.totalTransfers)} hint="Guias de carga geradas." tone="warning" />
        <KpiCard label="Baixado em OS" value={brl(cards.totalConsumed)} hint="Consumo total registrado." tone="success" />
        <KpiCard label="Estoque atual" value={brl(cards.currentStockValue)} hint="Valor ainda em almoxarifado." />
        <KpiCard label="Caixa dos técnicos" value={brl(cards.technicianBoxValue)} hint="Valor em responsabilidade dos técnicos." tone="warning" />
        <KpiCard label="Instalado no cliente" value={brl(cards.installedCustomerValue)} hint="Valor já transferido ao cliente." />
        <KpiCard label="Guias sem assinatura" value={brl(cards.pendingSignatureValue)} hint="Risco documental." tone="danger" />
        <KpiCard label="Custódia +60 dias" value={brl(cards.custodyRiskValue)} hint="Capital parado em campo." tone="danger" />
        <KpiCard label="Reposição sugerida" value={brl(cards.replenishmentNeed)} hint="Itens abaixo do mínimo." tone="warning" />
        <KpiCard label="Cobertura rastreada" value={pct(cards.financialCoverage)} hint="Valor atual x entradas." tone="success" />
      </section>

      <section className="finance-insights">
        {(data.insights || []).map((insight, index) => (
          <article className={`finance-insight ${insight.tone || 'info'}`} key={`${insight.title}-${index}`}>
            <strong>{insight.title}</strong>
            <span>{insight.text}</span>
          </article>
        ))}
      </section>

      <section className="bi-tabs">
        {[
          ['visao', '📊 Visão geral'],
          ['operacao', '🔁 Entradas e saídas'],
          ['tecnicos', '👷 Técnicos e riscos'],
          ['materiais', '📦 Materiais e reposição'],
        ].map(([value, label]) => <button key={value} className={tab === value ? '' : 'ghost'} onClick={() => setTab(value)}>{label}</button>)}
      </section>

      {tab === 'visao' && (
        <>
          <section className="bi-charts-grid finance-chart-grid">
            <ChartPanel title="Fluxo financeiro mensal" subtitle="Entradas, transferências, baixas e perdas por mês." type="line" data={charts.monthlyFlow} tone="success" />
            <ChartPanel title="Composição do valor atual" subtitle="Onde o patrimônio está financeiramente alocado." type="doughnut" data={charts.currentPosition} tone="info" />
            <ChartPanel title="Entrada x consumo por categoria" subtitle="Valor recebido e valor aplicado em OS por família." data={charts.categoryEntry} tone="warning" />
            <ChartPanel title="Valor atual por categoria" subtitle="Estoque, técnico e cliente por tipo de material." data={charts.categoryPosition} tone="success" />
          </section>
          <section className="panel two-col">
            <div><h3>💸 Barras de valor por técnico</h3>{(data.technicianFinance || []).slice(0, 12).map((tech) => <SimpleBar key={tech.id} label={tech.name} value={tech.custodyValue} max={maxTech} money />)}</div>
            <div><h3>📦 Barras de valor por material</h3>{(data.materialFinance || []).slice(0, 12).map((mat) => <SimpleBar key={mat.id} label={mat.name} value={mat.totalValue} max={maxMaterial} money />)}</div>
          </section>
        </>
      )}

      {tab === 'operacao' && (
        <>
          <section className="bi-charts-grid finance-chart-grid">
            <ChartPanel title="Valor por status de guia" subtitle="Impacto financeiro por assinatura, cancelamento e pendência." type="pie" data={charts.transferStatus} tone="warning" />
            <ChartPanel title="Custo das OS por status" subtitle="Custos consumidos por ordens abertas, pendentes, concluídas e canceladas." type="doughnut" data={charts.orderStatus} tone="success" />
            <ChartPanel title="Valor movimentado por tipo" subtitle="Entrada, transferência, retorno, baixa, ajuste e perda." data={charts.movementValue} tone="danger" />
            <ChartPanel title="Recebimento por fornecedor" subtitle="Valor recebido por origem/companhia." data={charts.supplierValue} tone="info" />
          </section>
          <section className="panel three-col finance-lists">
            <div><h3>📥 Últimas entradas</h3>{(data.recentEntries || []).map((row) => <div className="event compact" key={row.id}><strong>{row.receiptNumber}</strong><span>{row.sourceCompany} • {row.status}</span><small>{brl(row.totalValue)} • doc. {row.fiscalDocumentNumber || '-'}</small></div>)}</div>
            <div><h3>🔁 Últimas transferências</h3>{(data.recentTransfers || []).map((row) => <div className="event compact" key={row.id}><strong>{row.transferNumber}</strong><span>{row.technician} • {row.status}</span><small>{brl(row.totalValue)} • {row.totalQuantity} itens</small></div>)}</div>
            <div><h3>📲 Últimas baixas por OS</h3>{(data.recentConsumption || []).map((row) => <div className="event compact" key={row.id}><strong>{row.osNumber}</strong><span>{row.technician} • {row.serviceType}</span><small>{brl(row.totalCost)} • {row.customerName}</small></div>)}</div>
          </section>
        </>
      )}

      {tab === 'tecnicos' && (
        <>
          <section className="bi-charts-grid finance-chart-grid">
            <ChartPanel title="Caixa, consumo e risco por técnico" subtitle="Comparativo financeiro de responsabilidade operacional." data={charts.technicians} tone="danger" />
            <ChartPanel title="Valor por status de guia" subtitle="Quanto ainda depende de assinatura/regularização." type="doughnut" data={charts.transferStatus} tone="warning" />
            <ChartPanel title="Fluxo mensal financeiro" subtitle="Entrada e saída de valor por período." type="line" data={charts.monthlyFlow} tone="success" />
            <ChartPanel title="Valor movimentado por tipo" subtitle="Peso financeiro de cada movimento." data={charts.movementValue} tone="info" />
          </section>
          <section className="panel two-col">
            <div><h3>🚨 Risco financeiro por técnico</h3>{(data.technicianFinance || []).slice(0, 15).map((tech) => <SimpleBar key={tech.id} label={`${tech.name} • ${tech.company}`} value={tech.openFinancialRisk} max={maxRisk} money />)}</div>
            <div><h3>📌 Custódias críticas</h3>{(data.custodyRiskAssets || []).slice(0, 30).map((asset) => <div className="event compact" key={asset.id}><strong>{asset.serialNumber}</strong><span>{asset.material} • {asset.technician}</span><small>{asset.custodyDays} dias • {brl(asset.acquisitionCost)}</small></div>)}</div>
          </section>
        </>
      )}

      {tab === 'materiais' && (
        <>
          <section className="bi-charts-grid finance-chart-grid">
            <ChartPanel title="Top materiais por valor" subtitle="Entrada, posição atual e consumo por material." data={charts.materials} tone="success" />
            <ChartPanel title="Reposição financeira sugerida" subtitle="Itens abaixo do mínimo e impacto estimado." data={charts.replenishment} tone="warning" />
            <ChartPanel title="Composição do valor atual" subtitle="Estoque, técnico, cliente, manutenção e perda." type="pie" data={charts.currentPosition} tone="info" />
            <ChartPanel title="Valor atual por categoria" subtitle="Distribuição financeira dos grupos de materiais." data={charts.categoryPosition} tone="danger" />
          </section>
          <section className="panel table-wrap">
            <div className="panel-title"><div><h3>📦 Detalhamento financeiro por material</h3><p>Valor de entrada, posição atual, consumo e responsabilidade em campo.</p></div></div>
            <table>
              <thead><tr><th>Material</th><th>Categoria</th><th>Entrada</th><th>Estoque</th><th>Técnicos</th><th>Clientes</th><th>Consumido</th><th>Total atual</th></tr></thead>
              <tbody>{(data.materialFinance || []).map((mat) => <tr key={mat.id}><td><strong>{mat.name}</strong><small>{mat.sku}</small></td><td>{mat.category}</td><td>{brl(mat.entryValue)}</td><td>{brl(mat.estoqueValue)}</td><td>{brl(mat.tecnicoValue)}</td><td>{brl(mat.clienteValue)}</td><td>{brl(mat.consumedValue)}</td><td><strong>{brl(mat.totalValue)}</strong></td></tr>)}</tbody>
            </table>
          </section>
        </>
      )}

      <section className="finance-footer panel">
        <strong>🧮 Leitura financeira do StockFlow</strong>
        <span>Os valores são calculados a partir de custo unitário, documentos de entrada, guias, baixas por OS, materiais em estoque, materiais em carga de técnico e patrimônio serializado. Atualizado em {new Date(data.generatedAt).toLocaleString('pt-BR')}.</span>
      </section>
    </div>
  );
}
