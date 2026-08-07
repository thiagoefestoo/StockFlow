# Atualização 84 — Redução segura de tráfego Neon

Base utilizada: **StockFlow Versão 83 em produção**, recebida em 07/08/2026 (`StockFlow-main(20260807-153658).zip`).

## Objetivo

Reduzir leituras e bytes transferidos pelo PostgreSQL/Neon sem alterar regras de estoque, saldos, seriais, movimentações, permissões, schema ou migrations.

A atualização é **aditiva e retrocompatível**: as respostas completas antigas continuam sendo o padrão. Os modos leves só são usados pelas telas que realmente não precisam dos dados pesados.

## Ajustes realizados

### 1. Lista compacta de técnicos

A rota `/technicians` ganhou o modo `?compact=true`.

No modo normal, a listagem completa continua calculando patrimônio, valor, consumíveis, ferramentas, documentos e usuário de portal.

No modo compacto, usado apenas para filtros e caixas de seleção, a API retorna o cadastro do técnico e seus vínculos, sem executar o bloco de consultas N+1 de métricas.

Foram migradas para o modo compacto as telas de:

- Central da Caixa;
- Minha Caixa / Portal Técnico;
- Retorno Técnico;
- Perdas e Descontos;
- Solicitações;
- Ordens de Serviço;
- Transferências;
- Histórico de Movimentações;
- Avaliação de Perdas.

A página administrativa **Técnicos** continua usando a resposta completa.

### 2. Carga operacional do técnico

A rota `/technicians/:id/stock` ganhou `?view=operational`.

Minha Caixa, Portal Técnico e impressão da carga usam esse modo, que mantém:

- técnico;
- equipamentos/seriais atuais;
- consumíveis atuais;
- materiais agrupados;
- resumo necessário para operação.

Nesse modo não são consultados nem transmitidos em cada atualização:

- histórico de movimentações;
- últimas guias;
- últimas OS;
- ficha de ferramentas.

A chamada completa antiga continua disponível sem o parâmetro.

### 3. Retorno Técnico com leitura leve

`/stock/technician-box/:id` também ganhou `?view=operational`.

A tela Retorno Técnico usa o modo leve porque precisa somente da carga atual, saldos e seriais. A Central da Caixa continua com o modo completo, preservando seu histórico.

### 4. Atualização automática menos agressiva

Central da Caixa e Minha Caixa passaram de atualização passiva a cada **60 segundos** para **5 minutos**.

Também foi adicionado controle de atualização por foco: retornar à janela não força uma nova leitura pesada se os dados foram atualizados há menos de 5 minutos.

Atualizações explícitas provocadas por operações continuam sendo executadas imediatamente, e o botão **Atualizar agora** da Central continua disponível.

Redução teórica somente nos disparos passivos dessas telas: **80%**.

### 5. Menu, notificações e LivePulse

Os componentes globais passaram de ciclo passivo de 2 minutos para 5 minutos e usam cache compartilhado de 5 minutos.

Após POST/PUT/PATCH/DELETE concluído com sucesso, o cliente dispara `superinfra:data-changed`. Menu, sino e LivePulse reagem imediatamente; como o cache foi limpo antes da mutação, a primeira chamada atualiza os dados e as demais reutilizam/deduplicam a mesma consulta.

Ao abrir manualmente o sino, o cache de notificações é invalidado e os dados são consultados novamente. Assim, a economia passiva não impede uma consulta atual quando o usuário solicita.

Redução teórica dos disparos passivos globais: **60%**.

### 6. Catálogo compacto de materiais

`/materials` ganhou `?compact=true` para telas que precisam somente do catálogo.

Minha Caixa e Entrada de Estoque não precisam calcular saldo de todos os depósitos para preencher o seletor de material. Nessas telas, o modo compacto evita varrer saldos, patrimônios e estoques regionais.

Quando `warehouseId`, `availableOnly`, `city` ou `stockStatus` são usados, o backend mantém automaticamente o fluxo completo com cálculo de estoque.

### 7. Binários Base64 removidos de leituras desnecessárias

Foram removidas leituras de `attachmentData` onde o documento não é necessário:

- guias retornadas dentro da carga completa do técnico;
- guia vinculada a Solicitações de Material;
- resposta do serviço de aprovação de Solicitações;
- detalhe comum de Perdas/Descontos;
- guias usadas na Vida do Serial.

O conteúdo do arquivo continua disponível pelas rotas específicas de anexo, sob demanda.

Isto é especialmente importante porque anexos PDF/imagem em Base64 podem ser muito maiores que todos os demais campos do registro somados.

## O que NÃO foi alterado

- nenhuma migration;
- nenhuma tabela/coluna;
- nenhum model Sequelize;
- nenhum saldo;
- nenhuma regra de entrada, transferência, retorno, perda ou baixa de OS;
- nenhuma regra financeira;
- nenhum serial existente;
- nenhum anexo foi removido do banco;
- nenhum dado existente foi convertido ou migrado.

## Compatibilidade de deploy

Backend e frontend são compatíveis durante a transição:

- frontend 84 com backend 83: os parâmetros novos são ignorados e a tela recebe a resposta completa antiga;
- backend 84 com frontend 83: sem os parâmetros, as rotas continuam respondendo no formato completo antigo.

Mesmo assim, recomenda-se publicar **backend primeiro** e depois frontend.

## Pós-deploy recomendado

Acompanhar no Neon por 24 a 48 horas:

- Network transfer;
- Compute;
- erros da API;
- comportamento de Minha Caixa/Central da Caixa;
- abertura de anexos de transferências e perdas.

O ganho real em GB dependerá do número de usuários conectados, quantidade de técnicos, volume de materiais e principalmente tamanho/frequência dos anexos existentes.
