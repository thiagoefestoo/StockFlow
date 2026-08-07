# Atualização 85 — Loading visual Superinfra

Base utilizada: ZIP de produção `StockFlow-main(20260807-175321).zip`, identificado no Cockpit como **StockFlow • Versão 84**.

## Objetivo

Dar feedback visual quando uma página estiver realmente demorando para carregar, sem criar novas consultas e sem desfazer as otimizações de tráfego da Atualização 84.

## Alterações

- Tela de inicialização com a logo oficial da Superinfra enquanto o React ainda está carregando.
- Loading global nas trocas de página, com logo, barra animada e mensagem de carregamento.
- O loading de navegação só aparece depois de 300 ms. Páginas rápidas não piscam uma tela de loading desnecessariamente.
- Depois de 10 segundos, a mensagem muda para informar que a operação continua sendo processada.
- O loading observa as requisições já existentes. Ele não cria chamadas HTTP/API novas.
- Consultas globais passivas de `/auth/me`, `/notifications` e `/operations/pending-menu` são ignoradas pelo loading.
- Pollings normais que ocorrerem fora do início de uma navegação não exibem o overlay.
- O loading é ocultado em impressão.
- Animação possui tratamento para `prefers-reduced-motion`.
- Versão exibida no Cockpit alterada para **StockFlow • Versão 85**.

## Segurança operacional

Esta atualização é somente de frontend.

Não foram alterados:

- backend;
- models;
- migrations;
- banco Neon;
- regras de saldo;
- transferências;
- retornos;
- ordens de serviço;
- solicitações;
- perdas/descontos;
- permissões;
- anexos;
- intervalos de polling da Atualização 84.

## Arquivos de código alterados

- `frontend/public/index.html`
- `frontend/src/App.jsx`
- `frontend/src/components/PageLoadingOverlay.jsx` (novo)
- `frontend/src/services/api.js`
- `frontend/src/styles.css`
- `frontend/src/pages/OperationsCockpit.jsx`
