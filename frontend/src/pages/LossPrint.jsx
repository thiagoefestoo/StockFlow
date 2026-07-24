import { useEffect, useMemo, useState } from 'react';
import { useParams } from 'react-router-dom';
import api from '../services/api';
import AttachmentPreview from '../components/AttachmentPreview';
import { formatQuantity } from '../utils/formatQuantity';

function brl(value) { return Number(value || 0).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' }); }
function itemName(item) { return item?.itemDescription || item?.TechnicianTool?.name || item?.Material?.name || 'Item'; }
function itemType(item) { return item?.itemType === 'ferramenta' || item?.TechnicianTool ? 'Ferramenta' : 'Material'; }

export default function LossPrint() {
  const { id } = useParams();
  const [loss, setLoss] = useState(null);

  useEffect(() => { api.get(`/transfers/${id}`).then((r) => setLoss(r.data.data)); }, [id]);

  const isToolLoss = useMemo(() => (loss?.TransferItems || []).some((item) => itemType(item) === 'Ferramenta'), [loss]);

  if (!loss) return <div className="panel">Carregando guia de perda...</div>;

  const items = loss.TransferItems || [];
  const totalQuantity = items.reduce((sum, item) => sum + Number(item.quantity || 0), 0);
  const calculatedTotalValue = items.reduce((sum, item) => sum + Number(item.totalCost || 0), 0);
  const totalValue = calculatedTotalValue > 0 ? calculatedTotalValue : Number(loss.totalValue || 0);

  return (
    <div className="page-grid print-page">
      <div className="toolbar no-print">
        <div><h2>Guia de perda/desconto {loss.transferNumber}</h2><p>Imprima para assinatura e reconhecimento do técnico.</p></div>
        <button onClick={() => window.print()}>Imprimir guia</button>
      </div>
      <section className="paper print-document">
        <div className="paper-brand-row">
          <img className="paper-logo" src={`${process.env.PUBLIC_URL}/imagem/superinfra.png`} alt="Super Infra" />
          <div className="paper-brand-meta"><strong>Super Infra</strong><span>Registro de perda, desconto e baixa de item sob responsabilidade técnica</span></div>
        </div>
        <div className="paper-head"><div><h1>GUIA DE PERDA/DESCONTO</h1><p>Documento para reconhecimento do técnico responsável pela guarda do item.</p></div><strong>{loss.transferNumber}</strong></div>
        <div className="guide-total-highlight"><span>Valor total da guia</span><strong>{brl(totalValue)}</strong><small>{formatQuantity(totalQuantity)} item(ns) relacionado(s)</small></div>
        <div className="paper-grid">
          <p><b>Técnico:</b> {loss.Technician?.name}</p>
          <p><b>CPF:</b> {loss.Technician?.document || '-'}</p>
          <p><b>Tipo de baixa:</b> {isToolLoss ? 'Ferramenta' : 'Material'}</p>
          <p><b>Data do registro:</b> {new Date(loss.deliveredAt || loss.createdAt).toLocaleString('pt-BR')}</p>
          <p><b>Status do documento:</b> {loss.status}</p>
          <p><b>Valor para desconto:</b> {brl(totalValue)}</p>
          <p><b>Responsável pelo lançamento:</b> {loss.createdBy?.name || '-'}</p>
        </div>
        <table>
          <thead><tr><th>Item</th><th>Tipo</th><th>Patrimônio/serial</th><th>Qtd.</th><th>Valor</th></tr></thead>
          <tbody>
            {items.map((item) => <tr key={item.id}><td>{itemName(item)}</td><td>{itemType(item)}</td><td>{item.serialNumber || '-'}</td><td>{formatQuantity(item.quantity)}</td><td>{brl(item.totalCost)}</td></tr>)}
            <tr className="guide-total-row"><td colSpan="3"><strong>Total da guia</strong></td><td><strong>{formatQuantity(totalQuantity)}</strong></td><td><strong>{brl(totalValue)}</strong></td></tr>
          </tbody>
        </table>
        <div className="stamp-box"><strong>RECONHECIMENTO DE PERDA/DESCONTO</strong><p>{loss.stampText || 'Reconheço a perda do(s) item(ns) listado(s), autorizo a conferência/desconto conforme política interna e declaro ciência da baixa em minha ficha de responsabilidade.'}</p><div className="stamp-grid"><span>Data: ____/____/______</span><span>Hora: ____:____</span><span>Matrícula: __________</span></div></div>
        <div className="signature-area"><div><span></span><p>Assinatura do Técnico</p></div><div><span></span><p>Responsável pelo Estoque/Administração</p></div></div>
        <p className="paper-note no-print">Este documento registra a baixa do item por perda, extravio ou avaria, gerando histórico, auditoria e reflexo nos indicadores operacionais e financeiros.</p>
      </section>
      {loss.attachmentData && <section className="panel no-print"><h3>Documento anexado</h3><AttachmentPreview name={loss.attachmentName} data={loss.attachmentData} label="Documento de reconhecimento" /></section>}
    </div>
  );
}
