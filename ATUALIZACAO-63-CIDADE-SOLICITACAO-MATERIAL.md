# Atualização 63 — cidade na solicitação de material

## Objetivo

Exibir na página **Solicitações de material** a cidade relacionada a cada solicitação.

## Origem da cidade

A cidade principal é obtida do estoque salvo na própria solicitação:

- `MaterialRequest.warehouseId`;
- associação `MaterialRequest -> Warehouse`;
- campos exibidos: `Warehouse.city` e `Warehouse.state`.

Essa é a referência correta para solicitações atuais, pois o backend vincula a solicitação ao estoque da cidade do técnico antes de gravá-la.

Para registros antigos sem `warehouseId`, foi adicionada compatibilidade por meio do estoque padrão atual do técnico. Quando nem esse dado estiver disponível, será exibido `-`.

## Alterações visuais

A cidade passa a aparecer em:

1. nova coluna **Cidade** na tabela de solicitações;
2. campo **Cidade da solicitação** no modal de detalhes;
3. resumo de confirmação antes de enviar uma solicitação;
4. cabeçalho das janelas de aprovação, reprovação e entrega.

Exemplo:

`Vila Velha/ES`

## Backend

A consulta completa de solicitações agora inclui também o `defaultWarehouse` do técnico, exclusivamente como fallback para registros antigos.

A segregação por cidade e as permissões existentes não foram alteradas.

## Banco de dados

- nenhuma migration;
- nenhuma coluna adicionada;
- nenhum registro atualizado;
- nenhum saldo alterado;
- nenhuma solicitação recriada;
- nenhum status modificado.

A alteração é somente de consulta e apresentação.
