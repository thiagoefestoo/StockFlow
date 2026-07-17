# Transferência para técnico por estoque de origem

Atualização adicionada ao estoque-superinfra.

## O que mudou

- A tela **Transferências** agora exige selecionar o **estoque de origem** antes de montar a guia para o técnico.
- A lista de materiais passa a exibir somente itens que existem no estoque selecionado.
- Para equipamentos serializados, como ONU e roteador, aparecem somente os seriais existentes no estoque selecionado.
- Para materiais consumíveis, como cabo, conector e esticador, o sistema mostra a quantidade disponível naquele estoque e impede informar quantidade maior.
- O backend valida novamente o estoque de origem antes de concluir a transferência.
- A transferência registra:
  - estoque de origem;
  - técnico de destino;
  - material, quantidade e serial;
  - histórico em `stock_movements`;
  - auditoria com estoque de origem e itens transferidos.

## Fluxo de uso

1. Acesse **Transferências**.
2. Clique em **Nova transferência**.
3. Selecione o **Estoque de origem**.
4. Selecione o técnico.
5. Adicione os itens.
6. Se o item for serializado, selecione os seriais disponíveis no estoque escolhido.
7. Gere a guia.

## Banco de dados

Não cria tabela nova. Mantenha em produção:

```env
DB_SYNC=false
```
