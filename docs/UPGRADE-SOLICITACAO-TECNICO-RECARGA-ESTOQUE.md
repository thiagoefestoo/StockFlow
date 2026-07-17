# Upgrade — Solicitação do técnico e recarga de estoque

## O que foi adicionado

- O login de técnico agora tem acesso ao menu **Solicitar material**.
- O técnico pode abrir solicitação de reposição para a própria caixa.
- O estoquista pode abrir solicitação de **recarga de estoque regional**.
- A recarga é vinculada ao estoque autorizado do usuário.
- Recarga de estoque exige aprovação do administrador.
- Depois de aprovada, a recarga pode ser recebida no estoque regional.
- Materiais consumíveis entram no saldo do estoque.
- Equipamentos serializados exigem os seriais no recebimento da recarga.
- O recebimento gera histórico em movimentações e auditoria.

## Fluxo do técnico

1. Técnico entra no sistema.
2. Acessa **Solicitar material**.
3. Escolhe os materiais e quantidades.
4. Envia para aprovação.
5. Admin aprova.
6. Estoque entrega a carga e a caixa do técnico é atualizada.

## Fluxo do estoquista

1. Estoquista entra no sistema.
2. Acessa **Solicitações**.
3. Clica em **Nova solicitação**.
4. Escolhe **Recarga de estoque regional**.
5. Seleciona o estoque que receberá a recarga.
6. Informa materiais e quantidades.
7. Envia para aprovação do admin.
8. Depois de aprovado, registra o recebimento no estoque.

## Banco de dados

Não foram criadas tabelas novas. Pode manter:

```env
DB_SYNC=false
```
