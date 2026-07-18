# Upgrade - baixa de OS, notificações e fluxo de entrega de carga

## Alterações aplicadas

### Baixa de OS do técnico
- Nome do cliente, CPF e número da OS passam a ser obrigatórios.
- A baixa de OS exige exatamente 1 serial transferido para o cliente.
- O técnico só consegue selecionar 1 serial por OS.
- A seleção de serial passou a ser clicável, removendo a digitação livre para equipamentos serializados.
- A validação também foi aplicada no backend para impedir burla via API.

### Mobile / smartphone
- Os campos de preenchimento da OS ficam recolhidos no celular.
- No smartphone, o técnico clica em "Preencher dados da OS" para abrir os campos.

### Notificações na caixa do técnico
- A caixa do técnico exibe um resumo de solicitações em andamento, aprovadas e entregues.
- As solicitações recentes aparecem como notificações clicáveis.

### Minha conta
- Técnico e estoquista não podem editar dados cadastrais da própria conta.
- Técnico e estoquista podem alterar apenas a senha.
- Backend bloqueia alteração cadastral para técnico e estoquista pela rota /auth/me.

### Entrega de carga solicitada
- Ao clicar em "Entregar carga" em uma solicitação aprovada para técnico, o usuário é direcionado para a tela de Transferências.
- A transferência abre preenchida com técnico, estoque e itens da solicitação.
- O operador escolhe o serial da ONU/equipamento e pode ajustar quantidades de consumíveis.
- Ao gerar a guia, a solicitação é marcada como entregue e vinculada à transferência.

### Adicionar itens
- Ao adicionar item, o campo de material começa em branco.
- O sistema não permite salvar com item sem material selecionado.

## Deploy
Alteração envolve frontend e backend.

- Render: Manual Deploy com Clear Build Cache.
- Vercel: Redeploy sem cache.
