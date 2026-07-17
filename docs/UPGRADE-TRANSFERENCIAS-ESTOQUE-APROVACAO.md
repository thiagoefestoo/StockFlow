# Upgrade — Transferências entre estoques com aprovação e acesso por cidade

## O que foi ajustado

- Usuários agora podem ter cidades autorizadas selecionadas por checklist na tela de edição.
- Detalhes do usuário exibem as cidades autorizadas como lista visual.
- Transferências entre estoques não movimentam saldo imediatamente.
- Toda transferência entre estoques cria uma aprovação pendente para o admin.
- Ao aprovar, o sistema valida novamente se o estoque de origem ainda possui saldo/serial disponível.
- Ao aprovar, o sistema movimenta o saldo, registra `stock_movements` e mantém histórico no estoque de origem e destino.
- A Central de aprovações exibe origem, destino, materiais, quantidades, valores e seriais da transferência.
- Entrada de material exige documento de recebimento/anexo também no frontend.

## Fluxo sugerido

1. Admin cria estoques regionais.
2. Admin vincula estoquista ao estoque autorizado.
3. Admin ou usuário autorizado solicita transferência entre estoques.
4. A solicitação vai para Central de aprovações.
5. Admin aprova ou reprova.
6. Se aprovado, o saldo é movimentado e entra no histórico/BI dos estoques envolvidos.

## Deploy

Como há alteração em backend e frontend:

- Render: `Manual Deploy -> Clear build cache & deploy`
- Vercel: redeploy sem cache

Mantenha em produção:

```env
DB_SYNC=false
```
