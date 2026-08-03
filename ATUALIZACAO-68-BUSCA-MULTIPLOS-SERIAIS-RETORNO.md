# Atualização 68 — busca de múltiplos seriais no Retorno Técnico

## Objetivo

Adicionar à página **Retorno Técnico** a mesma pesquisa em lote já utilizada na transferência de equipamentos serializados.

## Funcionamento

Ao selecionar um material serializado, como uma ONU, a página passa a exibir uma caixa de texto maior com a orientação:

**Pesquisar vários seriais ou MACs — cole a coluna do Excel, um por linha**

A pesquisa aceita valores separados por:

- quebra de linha;
- vírgula;
- ponto e vírgula;
- tabulação;
- espaço.

Depois de colar a lista, o usuário pode:

1. clicar em **Filtrar**;
2. conferir quantos equipamentos foram encontrados;
3. clicar em **Selecionar tudo filtrado**;
4. revisar os seriais selecionados;
5. confirmar o retorno normalmente.

Também é possível pressionar **Ctrl+Enter** dentro da caixa para aplicar o filtro.

## Botões

- **Filtrar:** aplica a lista colada;
- **Limpar pesquisa:** remove apenas o filtro e mantém os seriais já selecionados;
- **Selecionar tudo filtrado:** seleciona todos os equipamentos encontrados;
- **Limpar seleção:** remove todos os seriais selecionados daquele item.

## Contadores

A página mostra, em tempo real:

- quantidade encontrada pelo filtro;
- quantidade total daquele material na caixa do técnico;
- quantidade já selecionada.

## Segurança operacional

A alteração é somente no frontend.

O backend existente já recebe um array `serialNumbers` e valida novamente cada serial antes de movimentar o estoque. Somente equipamentos que realmente estejam sob responsabilidade do técnico selecionado podem retornar.

Também permanecem ativas as regras que impedem:

- o mesmo serial em dois itens;
- o mesmo material repetido no retorno;
- retorno de serial que não esteja na caixa do técnico;
- movimentação sem confirmação final.

## Desempenho

A pesquisa é feita localmente sobre os equipamentos já carregados na caixa do técnico.

- nenhum endpoint novo;
- nenhuma chamada à API durante a digitação;
- nenhuma consulta adicional ao banco;
- nenhuma mudança no Render;
- apenas o frontend da Vercel precisa receber a nova versão.

## Banco de dados

- nenhuma migration;
- nenhuma coluna adicionada;
- nenhum saldo alterado pela atualização;
- nenhum retorno antigo modificado;
- nenhuma transferência modificada.
