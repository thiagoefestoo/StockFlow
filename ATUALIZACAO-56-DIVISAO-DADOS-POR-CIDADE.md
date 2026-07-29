# Atualização 56 — Divisão dinâmica por cidade

## Objetivo
Separar Cockpit, Dashboard legado e BIs por cidade operacional, usando os estoques regionais ativos que não sejam de logística reversa.

## Regras
- As cidades são geradas automaticamente a partir do campo `city` dos estoques operacionais ativos.
- Estoques de logística reversa não participam da lista nem dos cálculos.
- A opção "Todas as cidades" mantém a visão consolidada.
- Estoque e patrimônio em estoque usam o estoque regional da cidade.
- Caixa e responsabilidade técnica usam o estoque padrão do técnico.
- Ordens de serviço e itens instalados usam a cidade/estoque da OS.
- Solicitações e transferências usam o estoque relacionado e, como apoio, o estoque padrão do técnico.
- Movimentações usam origem/destino de estoque, técnico ou referência de OS da cidade.

## Telas alteradas
- Cockpit operacional
- Dashboard legado
- BI Executivo
- BI Financeiro
- BI Técnicos
- BI Auditoria
- Filtros inteligentes dos BIs

## Banco de dados
Nenhuma migração ou alteração estrutural é necessária.
