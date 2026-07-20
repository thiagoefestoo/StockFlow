# Upgrade - seleção múltipla de ONUs, avaliação de perdas e retorno ao estoque

## O que foi alterado

1. Transferências para técnico
- Adicionada pesquisa múltipla de seriais/ONUs.
- Permite colar vários seriais por linha, vírgula, ponto e vírgula ou espaço.
- Botão `Selecionar ONUs pesquisadas` seleciona automaticamente os seriais encontrados.
- Botão `Selecionar tudo filtrado` seleciona todos os seriais visíveis no filtro atual.
- O sistema evita duplicar o mesmo serial na guia.

2. Avaliação detalhada de perdas
- Nova página: `Avaliação de perdas`.
- Lista perdas por técnico, guia, motivo, materiais, seriais, valor e status do documento.
- Inclui cards de total de perdas, quantidade perdida, valor perdido, equipamentos com serial e guias/documentos pendentes.
- Permite abrir detalhes e guia de perda.

3. BI
- BI Executivo recebeu cards de equipamentos perdidos e valor perdido.
- As perdas continuam usando movimentação do tipo `perda`, portanto entram no histórico, auditoria e relatórios.

4. Retorno da caixa do técnico para estoque
- Novo módulo selecionável: `Retorno caixa para estoque`.
- Nova página: `/retorno-caixa-estoque`.
- Permite escolher técnico, estoque de destino e itens/seriais que voltarão para o estoque.
- O estoque de destino respeita os estoques liberados ao usuário.
- O backend exige estoque de destino e itens escolhidos.
- A operação gera histórico, auditoria e alimenta BI por meio de movimentação `retorno_tecnico`.

## Arquivos alterados

- frontend/src/pages/Transfers.jsx
- frontend/src/pages/TechnicianReturns.jsx
- frontend/src/pages/LossEvaluation.jsx
- frontend/src/pages/TechnicianBoxControl.jsx
- frontend/src/pages/BIExecutive.jsx
- frontend/src/App.jsx
- frontend/src/components/Layout.jsx
- frontend/src/config/modulePermissions.js
- frontend/src/styles.css
- backend/app/config/modulePermissions.js
- backend/app/controllers/stockController.js
- backend/app/controllers/biController.js
- backend/app/controllers/operationsController.js
- backend/app/routes/stockRoutes.js
- backend/app/routes/technicianRoutes.js
- backend/app/routes/warehouseRoutes.js

## Validação

- Frontend: `npm run build --prefix frontend` compilou com sucesso.
- Backend: `npm run check --prefix backend` validou a sintaxe.
