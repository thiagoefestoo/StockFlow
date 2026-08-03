# Atualização 66 — histórico na página Retorno Técnico

## Objetivo

Exibir na própria página **Retorno Técnico** o histórico dos retornos já realizados, sem obrigar o usuário a abrir o Histórico de movimentações.

## Nova área

Foi adicionada a seção:

**Histórico de retornos do técnico**

A lista mostra:

- data do retorno;
- número da guia;
- técnico de origem;
- estoque e cidade de destino;
- materiais;
- quantidade total;
- valor total;
- status da guia;
- situação da assinatura;
- operador responsável;
- detalhes completos dos itens retornados.

## Filtros

A seção possui filtros por:

- guia, referência ou observação;
- técnico;
- estoque de destino;
- status da guia.

## Ordenação

Os retornos são exibidos sempre nesta ordem:

1. data do retorno mais recente;
2. data de criação mais recente;
3. maior ID como desempate.

## Detalhes

O botão **Detalhes** abre:

- identificação da guia;
- técnico;
- estoque e cidade;
- quantidade e valor;
- status;
- documento anexado;
- responsável pela assinatura;
- observações;
- relação completa dos materiais;
- quantidade, serial, custo unitário e total por item.

## Atualização automática

Depois de registrar um novo retorno:

- a caixa do técnico é atualizada;
- o histórico volta para a primeira página;
- o novo retorno aparece no topo.

## Segurança de acesso

Foi criado um endpoint somente de leitura:

`GET /api/stock/technician-box/returns-history`

O endpoint exige o módulo `technicianReturns` e respeita:

- estoques vinculados ao usuário;
- cidades autorizadas;
- técnicos visíveis para a conta;
- acesso próprio quando o usuário é técnico.

O usuário não consegue consultar retornos de outra cidade alterando parâmetros manualmente.

## Banco de dados

- nenhuma migration;
- nenhuma coluna adicionada;
- nenhum saldo alterado;
- nenhum retorno recriado;
- nenhuma transferência modificada;
- nenhum documento excluído;
- nenhum status alterado.

A atualização apenas consulta e apresenta dados existentes.
