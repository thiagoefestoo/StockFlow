# Upgrade — Filtros recolhíveis nos BIs

Esta versão adiciona o botão **Ocultar filtros / Mostrar filtros** ao componente central de filtros dos painéis de BI.

## Onde aparece

- BI Executivo
- BI por Técnico
- BI Auditoria e Patrimônio
- BI Financeiro

## Comportamento

- Ao clicar em **Ocultar filtros**, o painel recolhe todos os campos e mantém apenas o resumo dos filtros ativos.
- Ao clicar em **Mostrar filtros**, todos os campos retornam para edição.
- O estado fica salvo no navegador do usuário por `localStorage`, evitando que a tela volte a abrir os filtros quando o usuário navegar entre BIs.
- O resumo mostra quantos filtros estão ativos e os principais filtros aplicados.
- Na impressão, o painel de filtros é ocultado automaticamente para deixar o relatório mais limpo.

## Impacto técnico

- Alteração apenas no frontend.
- Não cria tabelas.
- Não exige alteração no `DB_SYNC`.
