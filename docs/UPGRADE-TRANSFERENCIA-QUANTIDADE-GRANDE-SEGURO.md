# Transferência com quantidade grande e exibição correta

Este ajuste corrige a janela de transferência para técnico e reforça a normalização de quantidades.

## O que foi ajustado

- O campo **Quantidade a transferir** permanece visível ao selecionar o material.
- Ao selecionar o material, a quantidade inicia em 1, mas pode ser alterada para 30, 40, 50, 300 etc., respeitando o saldo disponível.
- Para consumíveis, a quantidade digitada é enviada ao backend e baixa diretamente do estoque de origem.
- Para materiais serializados, a quantidade digitada precisa bater com a quantidade de seriais selecionados.
- A exibição de quantidades foi reforçada para não mostrar `1.000` como milhar; o sistema exibe `1`, `2`, `3`, `300` etc.
- A normalização também inclui saldos como `mainStock`, `availableQty`, `totalItems` e demais campos de quantidade usados nas telas.

## Arquivos alterados

- `frontend/src/pages/Transfers.jsx`
- `frontend/src/pages/TechnicianReturns.jsx`
- `frontend/src/services/api.js`
- `frontend/src/utils/formatQuantity.js`
- `backend/app/middlewares/quantityResponseMiddleware.js`

## Observação de regra

Nenhuma estrutura de banco foi alterada. A baixa real continua sendo feita pelo backend, usando a quantidade informada e validando saldo antes de confirmar a transferência.
