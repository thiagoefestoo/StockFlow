import { useEffect, useState } from 'react';
import api from '../services/api';
import KpiCard from '../components/KpiCard';
import EmptyState from '../components/EmptyState';

export default function Dashboard() {
  const [bi, setBi] = useState(null);
  const [loading, setLoading] = useState(true);
  const [city, setCity] = useState('');
  const [cities, setCities] = useState([]);
  async function load() {
    setLoading(true);
    try {
      const [biResponse, optionsResponse] = await Promise.all([
        api.get('/bi/executive', { params: city ? { city } : {} }),
        api.getCached('/bi/filter-options', {}, 300000),
      ]);
      setBi(biResponse.data.data);
      setCities(optionsResponse.data.data?.cities || []);
    } finally { setLoading(false); }
  }
  async function runIntelligence() {
    await api.post('/notifications/generate');
    load();
    alert('Inteligência executada. Confira o sino de notificações.');
  }
  useEffect(() => { load(); }, [city]);
  if (loading) return <div className="panel">Carregando painel...</div>;
  const c = bi?.cards || {};
  return (
    <div className="page-grid">
      <section className="hero-panel">
        <div>
          <span className="pill">Sistema vivo</span>
          <h2>Radar operacional da prestadora</h2>
          <p>Monitore estoque, carga dos técnicos, guias pendentes de assinatura, patrimônio em campo e baixas por OS.</p>
        </div>
        <div className="row-actions">
          <label className="city-selector"><span>Cidade</span><select value={city} onChange={(event) => setCity(event.target.value)}><option value="">Todas as cidades</option>{cities.map((item) => <option key={item} value={item}>{item}</option>)}</select></label>
          <button onClick={runIntelligence}>Gerar alertas agora</button>
        </div>
      </section>
      <div className="kpi-grid">
        <KpiCard label="Equipamentos serializados" value={c.totalAssets || 0} hint="ONUs e ativos com serial" />
        <KpiCard label="Com técnicos" value={c.assetsWithTechnicians || 0} hint="carga ativa em campo" tone="warning" />
        <KpiCard label="Valor com técnicos" value={(c.patrimonyInTechnicians || 0).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })} hint="responsabilidade patrimonial" tone="danger" />
        <KpiCard label="Guias sem assinatura" value={c.pendingSignatures || 0} hint="precisam de anexo assinado" tone="warning" />
        <KpiCard label="OS no mês" value={c.osMonth || 0} hint="baixas realizadas" />
        <KpiCard label="Custódia +60 dias" value={c.custody60 || 0} hint="prioridade de auditoria" tone="danger" />
      </div>
      <section className="panel two-col">
        <div>
          <h3>Materiais por situação</h3>
          <div className="table-wrap"><table><thead><tr><th>Material</th><th>Estoque</th><th>Técnicos</th><th>Instalado</th></tr></thead><tbody>{bi?.materials?.map((m) => <tr key={m.id}><td>{m.name}</td><td>{m.estoque}</td><td>{m.tecnico}</td><td>{m.instalado}</td></tr>)}</tbody></table></div>
        </div>
        <div>
          <h3>Ranking de responsabilidade</h3>
          {bi?.topTechnicians?.length ? bi.topTechnicians.map((t) => <div className="rank" key={t.id}><b>{t.name}</b><span>{t.assetValue.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })}</span><small>{t.assetCount} equipamentos • {t.osCount} OS</small></div>) : <EmptyState />}
        </div>
      </section>
    </div>
  );
}
