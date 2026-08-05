# Atualização 73 — correção ao salvar edição de entrada

## Erro corrigido

Ao clicar em **Salvar correções** na edição de uma entrada, o PostgreSQL retornava:

`FOR UPDATE cannot be applied to the nullable side of an outer join`

## Causa

A consulta que bloqueava os itens da entrada utilizava simultaneamente:

- `FOR UPDATE`;
- associação opcional com Material;
- `LEFT OUTER JOIN` gerado pelo Sequelize.

O PostgreSQL não permite aplicar o bloqueio ao lado anulável dessa junção.

## Correção

O fluxo agora executa duas consultas dentro da mesma transação:

1. bloqueia somente as linhas de `StockBatchItem`, sem associação;
2. carrega os materiais relacionados em uma consulta separada.

Com isso:

- o bloqueio transacional permanece ativo;
- não existe `OUTER JOIN` na consulta bloqueada;
- as quantidades podem ser corrigidas com segurança;
- os dados documentais continuam editáveis;
- o ajuste de saldo continua ocorrendo somente pela diferença;
- a auditoria continua registrando antes e depois.

## Segurança

A correção não remove nenhuma proteção da Atualização 71:

- permissão específica para alterar quantidades;
- bloqueio para materiais serializados;
- impossibilidade de trocar, adicionar ou excluir material;
- redução somente quando houver saldo;
- recálculo automático dos totais;
- transação única com rollback em caso de erro.

## Efeito da tentativa que apresentou erro

O erro ocorreu dentro da transação antes da atualização dos itens.

A transação foi revertida automaticamente:

- nenhuma correção documental foi mantida;
- nenhuma quantidade foi alterada;
- nenhum saldo foi movimentado;
- nenhuma auditoria de alteração concluída foi criada.

## Banco de dados

- nenhuma migration;
- nenhuma coluna nova;
- nenhuma tabela alterada;
- nenhum saldo modificado pela instalação.
