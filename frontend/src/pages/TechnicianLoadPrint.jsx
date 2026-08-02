import { useEffect, useMemo, useState } from 'react';
import { useParams } from 'react-router-dom';
import api from '../services/api';
import { sortRecentFirst } from '../utils/recentFirst';
import { formatQuantity } from '../utils/formatQuantity';

function brl(value) {
  return Number(value || 0).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
}

function dateTime(value) {
  return value ? new Date(value).toLocaleString('pt-BR') : '-';
}

export default function TechnicianLoadPrint() {
  const { id } = useParams();
  const [stock, setStock] = useState(null);
  const [loadError, setLoadError] = useState('');
  const issuedAt = useMemo(() => new Date(), []);

  useEffect(() => {
    setLoadError('');
    api.get(`/technicians/${id}/stock`)
      .then((response) => setStock(response.data.data))
      .catch((error) => setLoadError(error.response?.data?.message || error.message || 'Não foi possível carregar a carga do técnico.'));
  }, [id]);

  const rows = useMemo(() => {
    if (!stock) return [];
    const serialized = (stock.assets || []).map((asset) => ({
      id: asset.id,
      key: `asset-${asset.id}`,
      material: asset.Material?.name || 'Equipamento',
      category: asset.Material?.category || '-',
      type: 'Serializado',
      serial: asset.serialNumber || '-',
      mac: asset.mac || '-',
      quantity: 1,
      unit: asset.Material?.unit || 'un',
      value: Number(asset.acquisitionCost || asset.Material?.unitCost || 0),
      custodySince: asset.custodyStartedAt,
    }));
    const consumables = (stock.balances || [])
      .filter((balance) => Number(balance.quantity || 0) > 0)
      .map((balance) => ({
        id: balance.id || balance.materialId,
        key: `balance-${balance.id || balance.materialId}`,
        material: balance.Material?.name || 'Material',
        category: balance.Material?.category || '-',
        type: 'Consumível',
        serial: '-',
        mac: '-',
        quantity: Number(balance.quantity || 0),
        unit: balance.Material?.unit || 'un',
        value: Number(balance.quantity || 0) * Number(balance.Material?.unitCost || 0),
        custodySince: balance.updatedAt || balance.createdAt,
      }));
    return sortRecentFirst([...serialized, ...consumables], ['custodySince']);
  }, [stock]);

  if (loadError) return <div className="panel"><strong>Não foi possível carregar a carga do técnico.</strong><p>{loadError}</p></div>;
  if (!stock) return <div className="panel">Carregando carga atual...</div>;

  const technician = stock.technician || {};
  const totalQuantity = rows.reduce((sum, row) => sum + Number(row.quantity || 0), 0);
  const totalValue = rows.reduce((sum, row) => sum + Number(row.value || 0), 0);

  return (
    <div className="page-grid print-page">
      <div className="toolbar no-print">
        <div><h2>Carga atual de {technician.name || 'técnico'}</h2><p>Documento para conferência física, desligamento ou troca de responsabilidade.</p></div>
        <button onClick={() => window.print()}>🖨️ Imprimir carga atual</button>
      </div>

      <section className="paper">
        <div className="paper-brand-row">
          <img className="paper-logo" src={`${process.env.PUBLIC_URL}/imagem/superinfra.png`} alt="Super Infra" />
          <div className="paper-brand-meta"><strong>Super Infra</strong><span>Controle de estoque, patrimônio e caixa técnica</span></div>
        </div>

        <div className="paper-head">
          <div><h1>RELATÓRIO DE CARGA ATUAL DO TÉCNICO</h1><p>Relação dos materiais registrados no sistema na data da emissão.</p></div>
          <strong>{issuedAt.toLocaleDateString('pt-BR')}</strong>
        </div>

        <div className="guide-total-highlight">
          <span>Total registrado na carga</span>
          <strong>{formatQuantity(totalQuantity)} item(ns)</strong>
          <small>Valor estimado: {brl(totalValue)}</small>
        </div>

        <div className="paper-grid">
          <p><b>Técnico:</b> {technician.name || '-'}</p>
          <p><b>Documento:</b> {technician.document || '-'}</p>
          <p><b>Empresa:</b> {technician.ContractorCompany?.name || technician.type || '-'}</p>
          <p><b>Estoque vinculado:</b> {technician.defaultWarehouse?.name || '-'}</p>
          <p><b>Cidade vinculada:</b> {technician.defaultWarehouse?.city || '-'}</p>
          <p><b>Emitido em:</b> {issuedAt.toLocaleString('pt-BR')}</p>
        </div>

        <table>
          <thead><tr><th>Material</th><th>Tipo</th><th>Serial / MAC</th><th>Qtd. sistema</th><th>Qtd. conferida</th><th>Valor</th></tr></thead>
          <tbody>
            {rows.map((row) => (
              <tr key={row.key}>
                <td><strong>{row.material}</strong><br /><small>{row.category} • carga desde {dateTime(row.custodySince)}</small></td>
                <td>{row.type}</td>
                <td>{row.serial}{row.mac !== '-' ? <><br /><small>MAC: {row.mac}</small></> : null}</td>
                <td>{formatQuantity(row.quantity)} {row.unit}</td>
                <td>__________</td>
                <td>{brl(row.value)}</td>
              </tr>
            ))}
            {!rows.length && <tr><td colSpan="6">Nenhum material registrado na carga deste técnico.</td></tr>}
            <tr className="guide-total-row"><td colSpan="3"><strong>Total</strong></td><td><strong>{formatQuantity(totalQuantity)}</strong></td><td></td><td><strong>{brl(totalValue)}</strong></td></tr>
          </tbody>
        </table>

        <div className="stamp-box">
          <strong>CONFERÊNCIA DA CARGA</strong>
          <p>Declaro que os itens acima foram conferidos fisicamente. Divergências, faltas, sobras ou avarias devem ser descritas abaixo antes da assinatura.</p>
          <p><b>Observações:</b> __________________________________________________________________________________________</p>
          <p>______________________________________________________________________________________________________</p>
        </div>

        <div className="signature-area">
          <div><span></span><p>Técnico / colaborador</p></div>
          <div><span></span><p>Responsável pela conferência</p></div>
        </div>
      </section>
    </div>
  );
}
