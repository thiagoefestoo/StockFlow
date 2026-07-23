export const TRANSFER_REASON_OPTIONS = [
  'Reposição de estoque do técnico',
  'Material para ativação',
  'Material para reparo',
  'Material para upgrade',
  'Substituição de equipamento',
  'Atendimento emergencial',
  'Ajuste de carga do técnico',
];

export const RETURN_REFERENCE_OPTIONS = [
  'Devolução de material',
  'Conferência de caixa',
  'Troca de técnico ou equipe',
  'Encerramento de contrato',
  'Ajuste de inventário',
  'Recolhimento preventivo',
];

export const RETURN_REASON_OPTIONS = [
  'Material não utilizado',
  'Material excedente na caixa',
  'Troca de técnico ou equipe',
  'Material avariado',
  'Conferência periódica',
  'Encerramento de vínculo',
  'Correção de saldo',
];

export const LOSS_REASON_OPTIONS = [
  'Extravio de material',
  'Material avariado',
  'Quebra durante atendimento',
  'Furto ou roubo',
  'Perda em campo',
  'Desconto autorizado',
  'Item não localizado na conferência',
];

export const MATERIAL_REQUEST_JUSTIFICATION_OPTIONS = {
  reposicao_carga: [
    'Reposição para instalações programadas',
    'Reposição para reparos e manutenções',
    'Reposição para upgrades',
    'Reposição por estoque mínimo da caixa',
    'Atendimento emergencial',
    'Ajuste de carga do técnico',
    'Substituição de material avariado ou extraviado',
  ],
  recarga_estoque: [
    'Reposição do estoque regional',
    'Reposição por estoque mínimo',
    'Atendimento de demanda programada',
    'Atendimento emergencial',
    'Inventário e regularização de saldo',
    'Expansão de operação ou equipe',
    'Redistribuição de materiais entre estoques',
  ],
};

