# Transferência com quantidade e caixa em tempo real

Este ajuste reforça o fluxo de transferência de material do estoque para o técnico.

## Ajustes aplicados

- Material comum/consumível mantém campo de quantidade editável.
- Material serializado agora mostra campo "Quantidade a transferir".
- Para ONU/roteador, a quantidade precisa bater exatamente com a quantidade de seriais selecionados.
- Botão "Selecionar quantidade informada" seleciona automaticamente os primeiros seriais filtrados até atingir a quantidade digitada.
- Backend continua baixando diretamente do estoque de origem e colocando na caixa do técnico.
- A transferência gera movimento, auditoria, BI e notificação para o técnico.
- Caixa do técnico atualiza ao focar a janela, a cada 15 segundos e após uma transferência feita em outra aba.

## Deploy

Como altera frontend e backend, publicar Render e Vercel.
