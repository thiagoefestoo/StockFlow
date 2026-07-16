# Upgrade — Filtros avançados nos BIs do StockFlow

Esta atualização adiciona um painel de filtros reutilizável nos BIs do sistema.

## Páginas alteradas

- BI Executivo
- BI por Técnico
- BI Auditoria e Patrimônio
- BI Financeiro

## Novos filtros disponíveis

- Período rápido: hoje, 7, 15, 30, 60, 90, 180 dias, mês atual, mês anterior, ano atual e todo histórico
- Datas personalizadas
- Modo de cálculo: competência, movimentação, responsabilidade atual, caixa do técnico e cliente/instalado
- Técnico
- Empresa / terceirizada
- Material
- Categoria
- Item serializado ou consumível
- Local do patrimônio: estoque, técnico, cliente ou fornecedor
- Status patrimonial
- Tipo de movimentação
- Status da guia
- Status da OS
- Tipo de OS
- Fornecedor/origem
- Tipo de documento fiscal
- Status de conferência
- Valor mínimo e máximo
- Busca livre por serial, OS, guia, cliente, CPF, NF, material e técnico

## Backend

Foi adicionado o endpoint:

```http
GET /api/bi/filter-options
```

Os endpoints abaixo agora aceitam query params de filtro:

```http
GET /api/bi/executive
GET /api/bi/technicians
GET /api/bi/audit
GET /api/bi/financial
```

## Banco de dados

Esta atualização não cria novas tabelas e não exige novas colunas.
