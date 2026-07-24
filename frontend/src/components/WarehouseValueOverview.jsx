import { useEffect, useMemo, useState } from 'react';
import api from '../services/api';
import { formatQuantity } from '../utils/formatQuantity';

function brl(value) {
  return Number(value || 0).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
}

export default function WarehouseValueOverview() {
  const [materials, setMaterials] = useState([]);
  const [warehouses, setWarehouses] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  useEffect(() => {
    let active = true;
    setLoading(true);
    Promise.all([
      api.get('/materials'),
      api.get('/warehouses'),
    ])
      .then(([materialsResponse, warehousesResponse]) => {
        if (!active) return;
        setMaterials(materialsResponse.data.data || []);
        setWarehouses(warehousesResponse.data.data || []);
        setError('');
      })
      .catch((requestError) => {
        if (!active) return;
        setError(requestError.response?.data?.message || 'Não foi possível calcular os valores por estoque.');
      })
      .finally(() => {
        if (active) setLoading(false);
      });
    return () => { active = false; };
  }, []);

  const summary = useMemo(() => {
    const rows = warehouses.map((warehouse) => {
      let quantity = 0;
      let value = 0;
      let activeMaterials = 0;

      materials.forEach((material) => {
        const stock = (material.warehouseStocks || []).find((item) => Number(item.warehouseId) === Number(warehouse.id));
        const stockQuantity = Number(stock?.quantity || 0);
        quantity += stockQuantity;
        value += stockQuantity * Number(material.unitCost || 0);
        if (stockQuantity > 0) activeMaterials += 1;
      });

      return {
        id: warehouse.id,
        name: warehouse.name,
        city: warehouse.city || warehouse.region || warehouse.code || '',
        quantity,
        value,
        activeMaterials,
      };
    });

    const totalQuantity = rows.reduce((sum, row) => sum + row.quantity, 0);
    const totalValue = rows.reduce((sum, row) => sum + row.value, 0);
    const maxValue = Math.max(...rows.map((row) => row.value), 1);

    return { rows, totalQuantity, totalValue, maxValue };
  }, [materials, warehouses]);

  if (loading) {
    return <section className="panel warehouse-bi-overview"><div className="warehouse-bi-loading">Calculando posição financeira por estoque...</div></section>;
  }

  if (error) {
    return <section className="panel warehouse-bi-overview"><div className="alert warning">{error}</div></section>;
  }

  return (
    <section className="panel warehouse-bi-overview">
      <div className="warehouse-bi-header">
        <div>
          <span className="eyebrow">Posição atual por estoque</span>
          <h3>Quantidade e valor separados por unidade</h3>
          <p>Os números consideram somente os estoques liberados para o usuário conectado.</p>
        </div>
        <div className="warehouse-bi-total">
          <small>Total consolidado</small>
          <strong>{brl(summary.totalValue)}</strong>
          <span>{formatQuantity(summary.totalQuantity)} item(ns) em todos os estoques</span>
        </div>
      </div>

      <div className="warehouse-bi-grid">
        {summary.rows.map((warehouse) => {
          const share = summary.totalValue > 0 ? (warehouse.value / summary.totalValue) * 100 : 0;
          const width = summary.maxValue > 0 ? (warehouse.value / summary.maxValue) * 100 : 0;
          return (
            <article className="warehouse-bi-card" key={warehouse.id}>
              <div className="warehouse-bi-card-title">
                <div>
                  <small>Estoque regional</small>
                  <strong>{warehouse.name}</strong>
                  {warehouse.city && <span>{warehouse.city}</span>}
                </div>
                <b>{share.toLocaleString('pt-BR', { maximumFractionDigits: 1 })}%</b>
              </div>
              <div className="warehouse-bi-value">{brl(warehouse.value)}</div>
              <div className="warehouse-bi-metrics">
                <div><small>Quantidade</small><strong>{formatQuantity(warehouse.quantity)}</strong></div>
                <div><small>Materiais com saldo</small><strong>{formatQuantity(warehouse.activeMaterials)}</strong></div>
              </div>
              <div className="warehouse-bi-progress"><span style={{ width: `${Math.max(width, warehouse.value > 0 ? 4 : 0)}%` }} /></div>
            </article>
          );
        })}
        {summary.rows.length === 0 && <div className="empty-state">Nenhum estoque foi liberado para este usuário.</div>}
      </div>

      {summary.rows.length > 0 && (
        <div className="warehouse-bi-equation">
          <span>Conferência do total</span>
          <strong>{summary.rows.map((row) => `${row.name}: ${brl(row.value)}`).join(' + ')} = {brl(summary.totalValue)}</strong>
        </div>
      )}
    </section>
  );
}
