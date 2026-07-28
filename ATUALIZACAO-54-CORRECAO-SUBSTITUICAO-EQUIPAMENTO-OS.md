# Atualização 54 — Correção da substituição de equipamento em OS

## Problema corrigido

O PostgreSQL retornava o erro:

`FOR UPDATE cannot be applied to the nullable side of an outer join`

A operação bloqueava a OS e os equipamentos com `FOR UPDATE` ao mesmo tempo em que utilizava associações opcionais (`include`), o que gerava `OUTER JOIN` no SQL.

## Ajuste

- A OS é bloqueada sem associações.
- Os dois equipamentos são bloqueados juntos, sem `JOIN` e em ordem fixa.
- Técnico e materiais são consultados separadamente dentro da mesma transação.
- Mantidas todas as validações, movimentações, histórico e auditoria.
- Reduzido o risco de deadlock em substituições simultâneas.

## Implantação

A alteração afeta somente o backend. Não exige migração nem alteração no banco.
