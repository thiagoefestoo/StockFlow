# Atualização 61 — listas das mais recentes para as mais antigas

## Objetivo

Padronizar as listas cronológicas do StockFlow para exibir primeiro os registros mais recentes, sem modificar saldos, documentos, movimentações ou registros existentes.

A alteração foi aplicada sobre o projeto enviado em `StockFlow-main.zip`.

## Regra de ordenação

As listagens de registros usam:

1. data principal da operação em ordem decrescente;
2. data de criação em ordem decrescente, quando aplicável;
3. ID em ordem decrescente como critério de desempate.

O ID evita que registros com a mesma data troquem de posição entre páginas ou atualizações da tela.

Exemplos:

- transferências: `deliveredAt DESC`, `createdAt DESC`, `id DESC`;
- entradas: `receivedAt DESC`, `createdAt DESC`, `id DESC`;
- movimentações: `movementAt DESC`, `createdAt DESC`, `id DESC`;
- ferramentas: `updatedAt DESC`, `deliveredAt DESC`, `id DESC`;
- registros gerais, OS e solicitações: `createdAt DESC`, `id DESC`.

## Áreas ajustadas

- Transferências e guias;
- Ordens de serviço;
- Solicitações de material;
- Entradas e recebimentos;
- Movimentações;
- Materiais e estoque;
- Patrimônio e equipamentos serializados;
- Técnicos e caixa do técnico;
- Ferramentas e documentos;
- Perdas e avaliações;
- Aprovações;
- Auditoria;
- Notificações;
- Usuários;
- Estoques;
- Logística reversa;
- históricos internos exibidos nos detalhes;
- conjuntos cronológicos usados nos painéis de BI.

## Proteção no frontend

Foi adicionada a função compartilhada `frontend/src/utils/recentFirst.js`.

Ela clona o array recebido e ordena por data e ID, sem modificar diretamente o estado original. Essa camada mantém a ordem correta mesmo quando alguma resposta antiga da API chegar sem ordenação consistente.

## Ordenações preservadas de propósito

Listas usadas para escolha operacional continuam alfabéticas ou em ordem própria:

- opções de materiais, cidades, estoques e status;
- seleção de seriais disponíveis;
- rankings e métricas de BI;
- saída FIFO da logística reversa;
- rotinas internas de consolidação e correção.

Essas listas não representam histórico cronológico. Mudar sua ordem poderia prejudicar a seleção do usuário ou alterar uma regra operacional.

## Banco de dados

- nenhuma migration;
- nenhuma tabela alterada;
- nenhum registro atualizado em massa;
- nenhum saldo movimentado;
- nenhum documento excluído;
- nenhum histórico recriado.

A atualização altera somente a forma de consultar e apresentar os registros.
