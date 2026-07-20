# Ajuste de exibição de quantidades

Este ajuste padroniza a exibição de quantidades no frontend para evitar que valores unitários armazenados como decimal, por exemplo `1.000`, apareçam visualmente como mil unidades.

## Alterações

- Criado utilitário `frontend/src/utils/formatQuantity.js`.
- Quantidades inteiras passam a aparecer como `1`, `2`, `20`, etc.
- Quantidades fracionadas continuam aparecendo com decimal quando necessário.
- Histórico de movimentações passa a exibir `1` em vez de `1.000`.
- Detalhes, guias, BI, caixa do técnico, retornos, perdas, solicitações e transferências passam a usar o mesmo padrão visual.
- Campos preenchidos por solicitação aprovada também passam a receber `20` em vez de `20.000` quando a quantidade for inteira.

## Observação

O banco pode continuar usando casas decimais para permitir materiais fracionados no futuro. A correção é visual e operacional no frontend, preservando compatibilidade com os dados existentes.
