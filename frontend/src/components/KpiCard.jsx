function automaticHint(label) {
  const text = String(label || '').trim().toLowerCase();
  if (!text) return 'Resumo calculado a partir dos dados disponíveis para o usuário.';
  if (text.includes('valor') || text.includes('patrimônio') || text.includes('custo')) return 'Mede o valor financeiro calculado com os registros e saldos disponíveis.';
  if (text.includes('quant') || text.includes('itens') || text.includes('equipamentos') || text.includes('materiais')) return 'Mede a quantidade total de itens considerados neste contexto.';
  if (text.includes('alert') || text.includes('pendente')) return 'Mede ocorrências que exigem atenção ou alguma ação do usuário.';
  if (text.includes('entrada') || text.includes('recebid')) return 'Mede registros de recebimento e entrada já confirmados no sistema.';
  if (text.includes('saída') || text.includes('transfer')) return 'Mede movimentações de saída ou transferência registradas.';
  if (text.includes('técnico')) return 'Identifica ou resume o técnico relacionado aos dados exibidos.';
  if (text.includes('estoque') || text.includes('ativo')) return 'Mede unidades ou saldos de estoque disponíveis dentro do acesso atual.';
  if (text.includes('comprovante')) return 'Mede operações que possuem documento comprobatório anexado.';
  if (text.includes('solicita')) return 'Mede solicitações registradas no fluxo operacional.';
  return `Mede o indicador “${label}” conforme os filtros e permissões atuais.`;
}

export default function KpiCard({ label, value, hint, tone = 'default' }) {
  const explanation = hint || automaticHint(label);
  return (
    <div className={`kpi-card tone-${tone}`} title={explanation}>
      <span className="kpi-card-label">{label}<em aria-label="Explicação do indicador">i</em></span>
      <strong>{value}</strong>
      <small className="kpi-card-hint">{explanation}</small>
    </div>
  );
}
