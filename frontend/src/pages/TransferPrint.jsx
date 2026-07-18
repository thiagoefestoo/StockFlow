import { useEffect, useState } from 'react';
import { useParams } from 'react-router-dom';
import api from '../services/api';

export default function TransferPrint() {
  const { id } = useParams();
  const [transfer, setTransfer] = useState(null);
  useEffect(() => { api.get(`/transfers/${id}`).then((r) => setTransfer(r.data.data)); }, [id]);
  if (!transfer) return <div className="panel">Carregando guia...</div>;
  return (
    <div className="page-grid print-page">
      <div className="toolbar no-print"><div><h2>Guia de entrega {transfer.transferNumber}</h2><p>Imprima esta página para assinatura do técnico.</p></div><button onClick={() => window.print()}>Imprimir guia</button></div>
      <section className="paper">
        <div className="paper-brand-row">
          <img className="paper-logo" src={`${process.env.PUBLIC_URL}/imagem/superinfra.png`} alt="Super Infra" />
          <div className="paper-brand-meta"><strong>Super Infra</strong><span>Controle de estoque, patrimônio e caixa técnica</span></div>
        </div>
        <div className="paper-head"><div><h1>GUIA DE ENTREGA DE MATERIAL</h1><p>Documento para conferência e assinatura do técnico responsável.</p></div><strong>{transfer.transferNumber}</strong></div>
        <div className="paper-grid"><p><b>Técnico:</b> {transfer.Technician?.name}</p><p><b>CPF:</b> {transfer.Technician?.document || '-'}</p><p><b>Estoque origem:</b> {transfer.Warehouse?.name || '-'}</p><p><b>Data:</b> {new Date(transfer.deliveredAt).toLocaleString('pt-BR')}</p><p><b>Status:</b> {transfer.status}</p></div>
        <table><thead><tr><th>Material</th><th>Serial</th><th>Qtd</th><th>Valor</th></tr></thead><tbody>{transfer.TransferItems?.map((item) => <tr key={item.id}><td>{item.Material?.name}</td><td>{item.serialNumber || '-'}</td><td>{item.quantity}</td><td>{Number(item.totalCost).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })}</td></tr>)}</tbody></table>
        <div className="stamp-box"><strong>CARIMBO DE CONFERÊNCIA SUPER INFRA</strong><p>{transfer.stampText || 'Recebido, conferido e assumida responsabilidade de guarda até baixa por OS ou devolução ao estoque.'}</p><div className="stamp-grid"><span>Data: ____/____/______</span><span>Hora: ____:____</span><span>Matrícula: __________</span></div></div><div className="signature-area"><div><span></span><p>Assinatura do Técnico</p></div><div><span></span><p>Responsável pelo Estoque</p></div></div>
        <p className="paper-note">Declaro que recebi os materiais listados acima, com os números de série discriminados, ficando responsável pela guarda, utilização em OS ou devolução formal ao estoque.</p>
      </section>
      {transfer.attachmentData && <section className="panel"><h3>Anexo assinado</h3>{transfer.attachmentData.startsWith('data:image') ? <img className="signed-img" src={transfer.attachmentData} alt="Guia assinada" /> : <a href={transfer.attachmentData} download={transfer.attachmentName}>Baixar anexo</a>}</section>}
    </div>
  );
}
