# Atualização 67 — excluir item de solicitação antes da transferência

## Objetivo

Permitir que a equipe de logística continue entregando uma solicitação aprovada, mas retire da entrega um material que deixou de ser necessário.

A alteração foi aplicada sobre o arquivo enviado `StockFlow-main(5).zip`.

## Onde o botão aparece

O botão **Excluir da entrega** aparece em dois pontos:

1. em cada cartão de material da solicitação aprovada;
2. na revisão final da transferência, na coluna **Ação**.

A revisão final corresponde à janela mostrada na imagem enviada pelo usuário.

## Fluxo de exclusão

Ao clicar em **Excluir da entrega**:

1. o sistema mostra uma confirmação com o nome do material;
2. o item sai da lista que será transferida;
3. os totais de quantidade e valor são recalculados;
4. o item aparece na seção **Itens excluídos desta entrega**;
5. o usuário pode clicar em **Restaurar** antes de confirmar;
6. os demais materiais continuam normalmente no mesmo pedido.

## Comportamento no estoque

O item excluído:

- não gera `TransferItem`;
- não gera movimentação de estoque;
- não sai do estoque de origem;
- não entra na caixa do técnico;
- não aparece na guia de transferência;
- não altera o saldo de materiais serializados ou não serializados.

Somente os itens mantidos e com quantidade positiva são movimentados.

## Preservação do histórico

O registro original da solicitação não é apagado.

Na conclusão:

- a quantidade originalmente solicitada permanece preservada;
- a quantidade entregue do item excluído fica igual a zero;
- o item permanece disponível para auditoria;
- a exclusão é registrada nos dados de auditoria da solicitação e da transferência;
- o técnico recebe uma notificação informando quantos itens não foram incluídos.

Essa abordagem evita apagar evidências de que o técnico havia solicitado o material.

## Proteções do backend

O frontend envia `excludedRequestItemIds` com os identificadores removidos.

O backend valida que:

- cada identificador pertence à solicitação aprovada;
- o mesmo item não pode ser enviado e excluído simultaneamente;
- nenhum item pode desaparecer sem ser enviado ou explicitamente excluído;
- não é possível excluir todos os itens da solicitação;
- a quantidade dos itens mantidos continua limitada ao total aprovado;
- requisições antigas sem o novo campo continuam compatíveis.

A regra é aplicada na API, não apenas na tela.

## Compatibilidade de redeploy

A atualização é compatível com deploy sequencial:

- backend novo com frontend antigo: continua funcionando;
- frontend novo com backend antigo: itens omitidos continuam tratados como entrega zero;
- após ambos os redeploys: validação explícita e auditoria completa ficam ativas.

## Banco de dados

- nenhuma migration;
- nenhuma coluna adicionada;
- nenhuma tabela alterada;
- nenhum saldo atualizado automaticamente;
- nenhuma solicitação antiga modificada;
- nenhuma transferência antiga modificada.

A atualização modifica apenas o fluxo de uma nova entrega confirmada.
