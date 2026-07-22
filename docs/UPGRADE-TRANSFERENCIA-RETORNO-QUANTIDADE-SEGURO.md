# Ajuste seguro de transferência, retorno e quantidade

## Correções incluídas

1. Quantidades DECIMAL vindas como `1.000`, `3.000`, `20.000` são normalizadas na API e no frontend para `1`, `3`, `20`.
2. A tela de Transferências sempre mostra o campo **Quantidade a transferir** depois que o material é escolhido.
3. Para material serializado, a quantidade informada precisa ser igual à quantidade de seriais selecionados.
4. O retorno da caixa do técnico para estoque passa a gerar uma guia na página de **Transferências** com prefixo `RETORNO-`.
5. A guia de retorno aceita anexo/assinatura pelo mesmo fluxo da guia de entrega.
6. Histórico, auditoria, BI e movimentações continuam sendo registrados.

## Deploy

Como altera backend e frontend, publicar no Render e na Vercel.
