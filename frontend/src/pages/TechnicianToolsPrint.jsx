import { useEffect, useState } from 'react';
import { useParams } from 'react-router-dom';
import api from '../services/api';

function brl(value) { return Number(value || 0).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' }); }
function dt(value) { return value ? new Date(value).toLocaleString('pt-BR') : '-'; }

export default function TechnicianToolsPrint() {
  const { id } = useParams();
  const [term, setTerm] = useState(null);

  useEffect(() => { api.get(`/technicians/${id}/tools/term`).then((r) => setTerm(r.data.data)); }, [id]);

  if (!term) return <div className="panel">Carregando termo de responsabilidade...</div>;

  const { technician, activeTools, generatedAt, totalValue } = term;

  return (
    <div className="page-grid print-page">
      <div className="toolbar no-print">
        <div><h2>Termo de responsabilidade de ferramentas</h2><p>Imprima para assinatura e ciência do técnico.</p></div>
        <button onClick={() => window.print()}>Imprimir termo</button>
      </div>
      <section className="paper">
        <div className="paper-brand-row">
          <img className="paper-logo" src={`${process.env.PUBLIC_URL}/imagem/superinfra.png`} alt="Super Infra" />
          <div className="paper-brand-meta"><strong>Super Infra</strong><span>Termo de responsabilidade e custódia de ferramentas</span></div>
        </div>
        <div className="paper-head">
          <div><h1>TERMO DE RESPONSABILIDADE DE FERRAMENTAS</h1><p>Documento de custódia das ferramentas registradas em nome do técnico.</p></div>
          <strong>{dt(generatedAt)}</strong>
        </div>
        <div className="paper-grid">
          <p><b>Técnico:</b> {technician?.name}</p>
          <p><b>CPF/documento:</b> {technician?.document || '-'}</p>
          <p><b>Telefone:</b> {technician?.phone || '-'}</p>
          <p><b>Empresa:</b> {technician?.ContractorCompany?.name || '-'}</p>
          <p><b>Data de emissão:</b> {dt(generatedAt)}</p>
          <p><b>Valor total sob custódia:</b> {brl(totalValue)}</p>
        </div>
        <table>
          <thead><tr><th>Ferramenta</th><th>Marca/modelo</th><th>Nº patrimônio/série</th><th>Entrega</th><th>Valor de referência</th></tr></thead>
          <tbody>
            {(activeTools || []).map((tool) => (
              <tr key={tool.id}>
                <td>{tool.name}</td>
                <td>{tool.brand || '-'}</td>
                <td>{tool.serialNumber}</td>
                <td>{dt(tool.deliveredAt)}</td>
                <td>{brl(tool.referenceValue)}</td>
              </tr>
            ))}
            {(!activeTools || activeTools.length === 0) && <tr><td colSpan={5}>Nenhuma ferramenta ativa registrada nesta ficha.</td></tr>}
          </tbody>
        </table>
        <div className="stamp-box">
          <strong>DECLARAÇÃO DE RECEBIMENTO E RESPONSABILIDADE</strong>
          <p>Declaro que recebi as ferramentas acima relacionadas, em bom estado de uso e funcionamento, e assumo integral responsabilidade pela sua guarda e conservação. Em caso de perda, dano por mau uso ou não devolução, autorizo o desconto do valor de referência correspondente, conforme política interna da empresa. Comprometo-me a comunicar imediatamente qualquer perda, furto, roubo ou dano, e a devolver os itens ao término do vínculo, substituição do equipamento ou quando solicitado.</p>
          <div className="stamp-grid"><span>Data: ____/____/______</span><span>Hora: ____:____</span><span>Matrícula: __________</span></div>
        </div>
        <div className="signature-area">
          <div><span></span><p>Assinatura do Técnico</p></div>
          <div><span></span><p>Responsável pelo Estoque/Administração</p></div>
        </div>
        <p className="paper-note">Este termo reflete apenas as ferramentas ativas na ficha do técnico na data de emissão. Itens baixados por perda, desgaste, substituição ou devolução não constam nesta lista, mas permanecem no histórico da ficha para fins de auditoria.</p>
      </section>
    </div>
  );
}
