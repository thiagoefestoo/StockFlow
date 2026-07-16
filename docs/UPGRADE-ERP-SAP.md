# Upgrade ERP/SAP - StockFlow

Esta versão transforma o StockFlow em um fluxo mais robusto de gestão operacional para prestadoras de telecom.

## Novas áreas

- **Cockpit Operacional**: fila de aprovações, solicitações, guias sem assinatura, OS abertas, patrimônio em campo e ranking de carga por técnico.
- **Central de Aprovações**: visão formal das aprovações pendentes, aprovadas e reprovadas.
- **Solicitações de Material**: fluxo completo para o técnico solicitar material, supervisor aprovar e estoque entregar.
- **Caixa do Técnico**: tela mobile para o técnico consultar carga, solicitar reposição e dar baixa por OS.
- **Histórico de Movimentações**: consulta de todas as movimentações patrimoniais e de consumíveis.

## Fluxo operacional recomendado

1. A telecom entrega material para o estoque principal.
2. O estoque registra entrada quinzenal.
3. O técnico solicita reposição pelo celular em **Caixa do Técnico**.
4. Supervisor aprova em **Central de Aprovações**.
5. Estoque entrega em **Solicitações de Material**.
6. O sistema gera a guia de transferência para assinatura.
7. O técnico executa a OS e baixa material pelo celular.
8. O histórico, auditoria, BI e notificações são atualizados.

## Regras importantes

- ONUs e equipamentos serializados só saem com número de série.
- Materiais não serializados saem por quantidade.
- Toda aprovação, entrega e baixa gera histórico.
- A entrega de uma solicitação aprovada gera automaticamente uma guia de transferência.
- O técnico enxerga apenas a própria caixa e as próprias solicitações.
- Admin e supervisor enxergam todas as filas.

## Rotas adicionadas no backend

- `GET /api/operations/cockpit`
- `GET /api/material-requests`
- `POST /api/material-requests`
- `POST /api/material-requests/:id/approve`
- `POST /api/material-requests/:id/reject`
- `POST /api/material-requests/:id/deliver`
- `GET /api/approvals`

## Tabelas adicionadas

- `material_requests`
- `material_request_items`
- `approval_requests`

Use `DB_SYNC=true` no primeiro start local ou no primeiro deploy para criar as novas tabelas. Depois de validar, volte para `DB_SYNC=false` em produção.
