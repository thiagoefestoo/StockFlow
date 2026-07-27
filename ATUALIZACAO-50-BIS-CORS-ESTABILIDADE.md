# Atualização 50 — BIs, CORS e estabilidade

## Correções principais

- O frontend publicado na Vercel passou a usar `/api` no mesmo domínio, com encaminhamento para o backend do Render. Isso elimina a dependência do CORS nas consultas comuns do navegador.
- O backend continua aceitando acesso direto pelo domínio oficial da Vercel e pelos previews autorizados.
- O endpoint de saúde agora informa se a origem recebida foi reconhecida pelo CORS.
- Requisições grandes de documentos continuam sendo enviadas diretamente ao Render, evitando limite de corpo do proxy da Vercel.

## Revisão dos BIs

- BI Executivo, Financeiro, Técnicos e Auditoria agora tratam falha de rede sem deixar a tela presa em "Carregando".
- Adicionada nova tentativa manual com mensagem clara de erro.
- Consultas idênticas são deduplicadas e mantidas em cache curto.
- Removidos anexos Base64 e campos pesados das consultas dos BIs.
- Removidas consultas repetidas por técnico; equipamentos, consumíveis e ferramentas são carregados em lote.
- Os relatórios solicitam apenas os conjuntos de dados realmente usados por cada página.
- Perdas e itens baixados não são mais somados novamente ao patrimônio atual ou à caixa do técnico.
- Quantidades e valores de estoque, técnico, cliente, manutenção e perda passaram a usar posições mutuamente exclusivas.
- O resumo por estoque passou a usar um endpoint agregado, sem baixar o catálogo inteiro nem executar uma consulta por unidade.
- Estoques de logística reversa permanecem fora dos indicadores operacionais gerais.

## Validação

- Sintaxe validada em 92 arquivos JavaScript do backend.
- Frontend compilado em modo de produção com sucesso.
- ESLint executado nos arquivos alterados sem erros ou avisos.
- Preflight CORS validado para o domínio oficial e para preview da Vercel.
- Endpoints dos quatro BIs e do resumo por estoque executados em teste de fumaça com banco simulado.
