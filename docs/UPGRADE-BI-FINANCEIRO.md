# StockFlow - BI Financeiro

Esta atualização adiciona o módulo **BI Financeiro** ao StockFlow.

## Acesso

Menu lateral:

**BI e auditoria → BI Financeiro**

Rota:

```text
/bi/financeiro
```

Permissões:

- admin
- supervisor

## Backend

Novo endpoint:

```http
GET /api/bi/financial
```

O endpoint consolida dados de:

- entradas fiscais/quinzenais;
- itens das entradas;
- materiais e custos unitários;
- patrimônio serializado;
- saldos em estoque;
- saldos em caixa de técnicos;
- guias de transferência;
- baixas por OS;
- movimentações de estoque;
- solicitações de material;
- aprovações;
- riscos de custódia acima de 60 dias.

## Indicadores financeiros

A página mostra:

- valor total de entradas fiscais;
- valor transferido para técnicos;
- valor baixado em OS;
- valor atual em estoque;
- valor em caixa de técnicos;
- valor instalado em clientes;
- valor de guias sem assinatura;
- valor em custódia crítica;
- reposição financeira sugerida;
- cobertura financeira rastreada;
- percentual de consumo;
- capital bloqueado em campo.

## Gráficos adicionados

A página possui abas com diversos gráficos:

- fluxo financeiro mensal;
- composição do valor atual;
- entrada x consumo por categoria;
- valor atual por categoria;
- valor por status de guia;
- custo das OS por status;
- valor movimentado por tipo;
- recebimento por fornecedor;
- caixa, consumo e risco por técnico;
- top materiais por valor;
- reposição financeira sugerida.

## Listas e barras

A página também exibe:

- barras de valor por técnico;
- barras de valor por material;
- últimas entradas;
- últimas transferências;
- últimas baixas por OS;
- custódias críticas;
- tabela financeira por material.

## Exportação

Inclui exportação:

- CSV;
- Excel compatível com planilha.

## Banco de dados

Esta atualização não cria novas tabelas e não exige alteração estrutural no banco.

Se o projeto já estiver atualizado, não é necessário mudar `DB_SYNC` por causa deste BI.
