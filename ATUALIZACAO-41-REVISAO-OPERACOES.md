# Atualização 41 — revisão de operações

## Alterações implementadas

- Materiais já selecionados deixam de aparecer nas demais listas da mesma operação.
- O backend também bloqueia materiais e seriais repetidos, mesmo em chamadas diretas à API.
- Revisão final antes de confirmar:
  - transferência para técnico;
  - transferência entre estoques;
  - entrada de materiais;
  - retorno do técnico ao estoque;
  - baixa para cliente/OS;
  - perda/desconto;
  - solicitações de material.
- O resumo apresenta origem, destino, técnico, documento, itens, quantidades, seriais e valores aplicáveis.
- Os indicadores exibem uma legenda curta explicando o que medem.

## Validações realizadas

- Frontend: `npm run build` — compilado com sucesso.
- Backend: `npm run check` — sintaxe validada em 90 arquivos JavaScript.
