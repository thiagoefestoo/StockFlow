# Atualização 82 — seleção filtrada, técnico obrigatório e versão no cockpit

## Escopo
Atualização exclusivamente de frontend. Nenhuma alteração foi feita no backend, banco de dados, migrations, rotas de API ou regras de saldo/movimentação.

## Ajustes
1. **Pesquisa de equipamentos/seriais — Transferências**
   - O botão **Selecionar tudo filtrado** fica oculto antes de uma pesquisa ser aplicada.
   - Só aparece após aplicar um filtro não vazio e somente quando existe ao menos um equipamento no resultado.
   - O botão usa verde escuro com texto branco para manter bom contraste visual.

2. **Pesquisa de equipamentos/seriais — Retorno da caixa do técnico**
   - Mesma proteção: seleção em massa só é exibida depois do filtro e quando há resultado.
   - Pesquisa sem resultado não oferece seleção em massa e não seleciona nenhum item.

3. **Central da Caixa**
   - O campo/painel de seleção do técnico usa o mesmo destaque vermelho de obrigatoriedade já existente na Caixa do Técnico enquanto nenhum técnico estiver selecionado.
   - Após selecionar um técnico, o painel retorna ao estado normal.

4. **Cockpit**
   - Adicionado marcador discreto no final da página: **StockFlow • Versão 82**.

## Segurança para produção
- Sem alteração de banco.
- Sem alteração de contratos de API.
- Sem alteração das validações de movimentação.
- Seleção individual dos equipamentos permanece inalterada.
- A mudança de seleção em massa é apenas uma trava de interface sobre resultados filtrados.
