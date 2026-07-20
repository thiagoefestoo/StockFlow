import { useEffect, useState } from 'react';
import { useParams } from 'react-router-dom';
import api from '../services/api';
import AttachmentPreview from '../components/AttachmentPreview';

function brl(value) { return Number(value || 0).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' }); }

export default function LossPrint() {
  const { id } = useParams();
  const [loss, setLoss] = useState(null);

  useEffect(() => { api.get(`/transfers/${id}`).then((r) => setLoss(r.data.data)); }, [id]);

  if (!loss) return <div className="panel">Carregando guia de perda...</div>;

  return (
    <div className="page-grid print-page">
      <div className="toolbar no-print">
        <div><h2>Guia de perda/desconto {loss.transferNumber}</h2><p>Imprima para assinatura e reconhecimento do técnico.</p></div>
        <button onClick={() => window.print()}>Imprimir guia</button>
      </div>
      <section className="paper">
        <div className="paper-brand-row">
          <img className="paper-logo" src={`${process.env.PUBLIC_URL}/imagem/superinfra.png`} alt="Super Infra" />
          <div className="paper-brand-meta"><strong>Super Infra</strong><span>Registro de perda, desconto e baixa de material técnico</span></div>
        </div>
        <div className="paper-head"><div><h1>GUIA DE PERDA/DESCONTO DE MATERIAL</h1><p>Documento para reconhecimento do técnico responsável pela guarda do material.</p></div><strong>{loss.transferNumber}</strong></div>
        <div className="paper-grid">
          <p><b>Técnico:</b> {loss.Technician?.name}</p>
          <p><b>CPF:</b> {loss.Technician?.document || '-'}</p>
          <p><b>Data do registro:</b> {new Date(loss.deliveredAt || loss.createdAt).toLocaleString('pt-BR')}</p>
          <p><b>Status do documento:</b> {loss.status}</p>
          <p><b>Valor para desconto:</b> {brl(loss.totalValue)}</p>
          <p><b>Responsável pelo lançamento:</b> {loss.createdBy?.name || '-'}</p>
        </div>
        <table><thead><tr><th>Material</th><th>Serial</th><th>Qtd</th><th>Valor</th></tr></thead><tbody>{loss.TransferItems?.map((item) => <tr key={item.id}><td>{item.Material?.name}</td><td>{item.serialNumber || '-'}</td><td>{item.quantity}</td><td>{brl(item.totalCost)}</td></tr>)}</tbody></table>
        <div className="stamp-box"><strong>RECONHECIMENTO DE PERDA/DESCONTO</strong><p>{loss.stampText || 'Reconheço a perda do(s) material(is) listado(s), autorizo a conferência/desconto conforme política interna e declaro ciência da baixa em minha caixa técnica.'}</p><div className="stamp-grid"><span>Data: ____/____/______</span><span>Hora: ____:____</span><span>Matrícula: __________</span></div></div>
        <div className="signature-area"><div><span></span><p>Assinatura do Técnico</p></div><div><span></span><p>Responsável pelo Estoque/Administração</p></div></div>
        <p className="paper-note">Este documento registra a baixa do material da caixa do técnico por perda/extravio/avaria, gerando histórico, auditoria e reflexo nos indicadores operacionais e financeiros.</p>
      </section>
      {loss.attachmentData && <section className="panel no-print"><h3>Documento anexado</h3><AttachmentPreview name={loss.attachmentName} data={loss.attachmentData} label="Documento de reconhecimento" /></section>}
    </div>
  );
}
