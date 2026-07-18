# Upgrade - contador de pendências no menu lateral

Este ajuste adiciona aviso visual de tarefas pendentes no menu lateral.

## O que foi incluído

- Novo endpoint `GET /api/operations/pending-menu`.
- Contador por rota do menu lateral.
- Número em círculo vermelho com texto branco para tarefas pendentes.
- Contador também no cabeçalho do grupo do menu.
- Atualização automática a cada 30 segundos e quando a janela volta ao foco.

## Pendências consideradas

- Aprovações pendentes.
- Solicitações aprovadas aguardando entrega/recebimento.
- Guias de transferência pendentes de assinatura.
- Guias de perda/desconto pendentes de assinatura.
- Ordens de serviço abertas ou pendentes.
- Para técnico: solicitações em andamento, guias pendentes e notificações não lidas na caixa.

## Arquivos alterados

- `backend/app/controllers/operationsController.js`
- `backend/app/routes/operationsRoutes.js`
- `frontend/src/components/Layout.jsx`
- `frontend/src/styles.css`
