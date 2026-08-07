# Atualização 83 — Filtros e seleção obrigatória de técnico

## Objetivo
Adicionar filtros de consulta às páginas solicitadas e padronizar a seleção obrigatória de técnico para iniciar em “Selecione”, com destaque visual vermelho enquanto estiver vazia.

## Alterações

### Perdas e descontos do técnico
- Pesquisa por guia, técnico, material, serial e observação.
- Filtro por técnico.
- Filtro por tipo: Material/Ferramenta.
- Filtro por status.
- Botão para limpar filtros.
- Campo “Técnico responsável” destacado em vermelho enquanto não houver seleção.

### Ordens de serviço
- Pesquisa por OS, cliente ou contrato.
- Filtro por cidade.
- Filtro por técnico.
- Filtro por tipo de serviço.
- Filtro por status.
- Botões “Aplicar filtros” e “Limpar”.
- Os novos filtros são aplicados no backend antes da paginação.
- A regra de acesso foi preservada: usuário técnico continua limitado às próprias OS.

### Solicitações de material
- Pesquisa por número ou justificativa.
- Filtro por status.
- Filtro por técnico para usuários não técnicos.
- Filtro por tipo de solicitação.
- Filtro por prioridade.
- Botões “Aplicar filtros” e “Limpar”.
- Pesquisa/prioridade são aplicadas no backend antes da paginação.
- Nova solicitação não seleciona mais automaticamente o primeiro técnico.
- Campo de técnico inicia em “Selecione” e fica destacado em vermelho enquanto vazio.

### Retorno técnico
- Removida a seleção automática do primeiro técnico ao abrir a página.
- Campo inicia em “Selecione”.
- Campo de técnico destacado em vermelho até a seleção.

### Padronização em outras operações com técnico obrigatório
- Transferência direta para técnico: destaque vermelho quando vazio.
- Transferência de ferramentas: técnico de origem e destino destacados enquanto vazios.
- Portal do técnico em modo supervisor: seleção segue o padrão vermelho da Central da Caixa.
- Central da Caixa e Caixa Técnico já mantinham o comportamento solicitado.

### Versão
- Cockpit atualizado para `StockFlow • Versão 83`.

## Backend
Foram alterados apenas filtros das listagens:
- `GET /api/service-orders`
- `GET /api/material-requests`

Não houve alteração de banco, migrations, tabelas, saldos, baixas, transferências ou cálculos financeiros.
