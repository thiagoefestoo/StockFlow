# Atualização 55 — Data da baixa nas Ordens de Serviço

## Alteração

A listagem da página **Ordens de serviço** passa a exibir a coluna **Data da baixa**.

O valor apresentado utiliza o campo `completedAt` da própria ordem de serviço e é formatado no padrão brasileiro, com data e horário.

## Escopo

- alteração somente no frontend;
- nenhuma modificação no banco de dados;
- nenhuma alteração nas regras de baixa, substituição de equipamento, histórico, auditoria ou BI;
- ordens antigas sem data de conclusão continuam exibindo `-`.
