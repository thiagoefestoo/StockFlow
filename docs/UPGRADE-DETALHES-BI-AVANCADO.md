# Upgrade: Detalhes, edição administrativa e BI avançado

Esta versão amplia o StockFlow ERP com foco em uso operacional e gerencial.

## Principais melhorias

- Botões **Detalhes** nas principais telas operacionais.
- Janelas internas do próprio sistema para consulta detalhada, sem pop-ups do Windows.
- Botões **Editar** para perfil admin em materiais, técnicos, guias e ordens de serviço.
- Histórico e auditoria preservados nas edições administrativas de guias e OS.
- BI Executivo com 6 gráficos.
- BI por Técnico com 8 gráficos.
- BI Auditoria e Patrimônio com 6 gráficos.
- Interface de opções mais parecida com ERP: ações agrupadas em coluna **Opções**.
- Build ajustado para ambiente Windows, Render/Vercel e local.

## Páginas com detalhes

- Entrada quinzenal
- Catálogo e estoque
- Transferências e guias
- Solicitações de material
- Central de aprovações
- Caixa do técnico
- Ordens de serviço
- Patrimônio
- Técnicos e terceirizadas
- Histórico de movimentações
- Cockpit operacional

## Novas edições administrativas

- `PUT /api/transfers/:id`
- `PUT /api/service-orders/:id`

As alterações geram auditoria automaticamente.
