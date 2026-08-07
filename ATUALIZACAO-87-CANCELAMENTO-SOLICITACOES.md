# StockFlow — Atualização 87

## Cancelamento auditável de solicitações de material

Base utilizada: versão 86 enviada como produção em 07/08/2026.

### Alterações

1. Solicitações de material pendentes ou aprovadas e ainda não entregues podem ser canceladas.
2. O cancelamento exige um motivo padronizado: Técnico desistiu do pedido; Pedido entregue anteriormente em outro pedido; Solicitação duplicada; Item solicitado incorretamente; Quantidade solicitada incorretamente; Material não é mais necessário; Pedido criado por engano; Cancelamento por ajuste operacional; Outro motivo.
3. Ao selecionar Outro motivo, a observação é obrigatória.
4. Pedidos entregues, reprovados, já cancelados ou com guia vinculada não podem ser cancelados por esse fluxo.
5. Técnicos podem cancelar apenas as próprias solicitações de reposição de carga. Usuários operacionais respeitam o escopo de cidade/estoque já existente.
6. O cancelamento grava status, data/hora, motivo, observação, usuário, perfil e identificação do responsável no metadata da solicitação, sem criar nova tabela ou coluna.
7. O ApprovalRequest relacionado é encerrado como cancelado para não continuar aparecendo como pendência de aprovação.
8. A auditoria registra a ação material_request_cancelled com dados antes/depois e usuário responsável.
9. Os detalhes da solicitação passam a exibir um histórico visual com criação, aprovação/reprovação, cancelamento e entrega.
10. O resumo da página passa a mostrar o indicador Canceladas.
11. Quando o técnico cancela, a operação recebe notificação. Quando a operação cancela uma carga técnica, o técnico recebe notificação.
12. O cancelamento não cria StockMovement, não chama adjustBalance e não altera saldos.
13. Foi adicionada trava transacional para impedir corrida entre cancelamento e geração da entrega vinculada.
14. Cockpit atualizado para StockFlow • Versão 87.

### Arquivos alterados

- backend/app/controllers/materialRequestController.js
- backend/app/controllers/transferController.js
- backend/app/routes/materialRequestRoutes.js
- frontend/src/pages/MaterialRequests.jsx
- frontend/src/pages/OperationsCockpit.jsx

### Arquivo de validação adicionado

- backend/scripts/test-update-87-material-request-cancellation.js

### Banco de dados

Nenhuma migration, model, tabela ou coluna foi alterada. O recurso utiliza cancelledAt e metadata, já existentes na tabela material_requests.
