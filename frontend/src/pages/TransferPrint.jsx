import { useEffect, useState } from 'react';
import { useParams } from 'react-router-dom';
import api from '../services/api';
import AttachmentPreview from '../components/AttachmentPreview';
import { getTransferAttachments } from '../utils/transferAttachments';
import { formatQuantity } from '../utils/formatQuantity';

export default function TransferPrint() {
  const { id } = useParams();
  const [transfer, setTransfer] = useState(null);
  const [loadError, setLoadError] = useState('');

  useEffect(() => {
    setLoadError('');
    api.get(`/transfers/${id}`)
      .then((r) => setTransfer(r.data.data))
      .catch((error) => setLoadError(error.response?.data?.message || error.message || 'Não foi possível carregar a guia.'));
  }, [id]);

  if (loadError) return <div className="panel"><strong>Não foi possível carregar a guia.</strong><p>{loadError}</p></div>;
  if (!transfer) return <div className="panel">Carregando guia...</div>;

  const number = String(transfer.transferNumber || '').toUpperCase();
  const isReturn = number.startsWith('RETORNO-');
  const isToolTransfer = transfer.transferType === 'ferramenta' || number.startsWith('FERRAMENTA-');
  const items = transfer.TransferItems || [];
  const totalQuantity = items.reduce((sum, item) => sum + Number(item.quantity || 0), 0);
  const calculatedTotalValue = items.reduce((sum, item) => sum + Number(item.totalCost || 0), 0);
  const totalValue = calculatedTotalValue > 0 ? calculatedTotalValue : Number(transfer.totalValue || 0);
  const brl = (value) => Number(value || 0).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });

  const guideTitle = isToolTransfer
    ? 'GUIA DE TRANSFERÊNCIA DE FERRAMENTAS'
    : isReturn
      ? 'GUIA DE RETORNO DE MATERIAL'
      : 'GUIA DE ENTREGA DE MATERIAL';
  const pageTitle = isToolTransfer ? 'Guia de ferramentas' : isReturn ? 'Guia de retorno' : 'Guia de entrega';
  const guideDescription = isToolTransfer
    ? 'Documento para conferência e mudança de responsabilidade das ferramentas entre técnicos.'
    : isReturn
      ? 'Documento para conferência do retorno do técnico para o estoque.'
      : 'Documento para conferência e assinatura do técnico responsável.';

  return (
    <div className="page-grid print-page">
      <div className="toolbar no-print"><div><h2>{pageTitle} {transfer.transferNumber}</h2><p>Imprima esta página para assinatura/conferência.</p></div><button onClick={() => window.print()}>Imprimir guia</button></div>
      <section className="paper">
        <div className="paper-brand-row">
          <img className="paper-logo" src={`${process.env.PUBLIC_URL}/imagem/superinfra.png`} alt="Super Infra" />
          <div className="paper-brand-meta"><strong>Super Infra</strong><span>Controle de estoque, patrimônio e caixa técnica</span></div>
        </div>
        <div className="paper-head"><div><h1>{guideTitle}</h1><p>{guideDescription}</p></div><strong>{transfer.transferNumber}</strong></div>
        <div className="guide-total-highlight"><span>Valor total da guia</span><strong>{brl(totalValue)}</strong><small>{formatQuantity(totalQuantity)} item(ns) relacionado(s)</small></div>
        <div className="paper-grid">
          {isToolTransfer && <p><b>Técnico de origem:</b> {transfer.fromTechnician?.name || '-'}</p>}
          <p><b>{isToolTransfer ? 'Técnico de destino' : 'Técnico'}:</b> {transfer.Technician?.name || '-'}</p>
          <p><b>CPF do destino:</b> {transfer.Technician?.document || '-'}</p>
          {!isToolTransfer && <p><b>{isReturn ? 'Estoque destino:' : 'Estoque origem:'}</b> {transfer.Warehouse?.name || '-'}</p>}
          <p><b>Data:</b> {new Date(transfer.deliveredAt).toLocaleString('pt-BR')}</p>
          <p><b>Status:</b> {transfer.status}</p>
          <p><b>Valor total:</b> {brl(totalValue)}</p>
        </div>
        <table><thead><tr><th>{isToolTransfer ? 'Ferramenta' : 'Material'}</th><th>Patrimônio/Serial</th><th>Qtd</th><th>Valor</th></tr></thead><tbody>{items.map((item) => <tr key={item.id}><td>{item.TechnicianTool?.name || item.itemDescription || item.Material?.name || 'Item'}</td><td>{item.serialNumber || '-'}</td><td>{formatQuantity(item.quantity)}</td><td>{brl(item.totalCost)}</td></tr>)}<tr className="guide-total-row"><td colSpan="2"><strong>Total da guia</strong></td><td><strong>{formatQuantity(totalQuantity)}</strong></td><td><strong>{brl(totalValue)}</strong></td></tr></tbody></table>
        <div className="stamp-box"><strong>CARIMBO DE CONFERÊNCIA SUPER INFRA</strong><p>{transfer.stampText || (isToolTransfer ? 'Ferramentas conferidas e transferidas para a responsabilidade do técnico de destino.' : isReturn ? 'Recebido do técnico, conferido e retornado ao estoque informado.' : 'Recebido, conferido e assumida responsabilidade de guarda até baixa por OS ou devolução ao estoque.')}</p><div className="stamp-grid"><span>Data: ____/____/______</span><span>Hora: ____:____</span><span>Matrícula: __________</span></div></div>
        <div className="signature-area"><div><span></span><p>{isToolTransfer ? 'Técnico de origem' : 'Assinatura do Técnico'}</p></div><div><span></span><p>{isToolTransfer ? 'Técnico de destino' : 'Responsável pelo Estoque'}</p></div></div>
        <p className="paper-note no-print">{isToolTransfer ? 'Declaro que as ferramentas acima foram conferidas e que a responsabilidade passou do técnico de origem para o técnico de destino.' : isReturn ? 'Declaro que os materiais listados acima foram devolvidos pelo técnico e conferidos para retorno ao estoque.' : 'Declaro que recebi os materiais listados acima, com os números de série discriminados, ficando responsável pela guarda, utilização em OS ou devolução formal ao estoque.'}</p>
      </section>
      {getTransferAttachments(transfer).length > 0 && <section className="panel no-print"><h3>Anexos assinados</h3>{getTransferAttachments(transfer).map((attachment, index) => <AttachmentPreview key={`${attachment.name}-${index}`} name={attachment.name} data={attachment.data} loadData={async () => { const response = await api.get(`/transfers/${transfer.id}/attachments/${index}`); return response.data?.data?.data || ''; }} label={`Anexo ${index + 1}`} />)}</section>}
    </div>
  );
}
