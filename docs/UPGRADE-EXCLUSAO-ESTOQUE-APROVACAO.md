# Exclusão de estoque com aprovação

Esta atualização adiciona solicitação de exclusão para estoques regionais.

## Regra operacional

- Um estoque só pode ser excluído se estiver vazio.
- São considerados itens impeditivos:
  - saldos consumíveis com quantidade maior que zero;
  - equipamentos serializados ainda vinculados ao estoque.
- Se houver itens, o sistema bloqueia a solicitação e orienta transferir os materiais para outro estoque.
- Mesmo vazio, a exclusão não é imediata: é criada uma solicitação na Central de Aprovações.
- Na aprovação, o backend valida novamente se o estoque continua vazio antes de excluir.

## Fluxo

1. Admin ou supervisor acessa Estoques regionais.
2. Clica em Solicitar exclusão.
3. Se o estoque estiver vazio, a solicitação entra como pendente.
4. Admin acessa Central de aprovações.
5. Ao aprovar, o estoque é excluído e a auditoria registra a operação.
6. Se o estoque recebeu itens depois da solicitação, a aprovação é bloqueada.

## Deploy

Não há tabela nova. Mantenha `DB_SYNC=false`.
