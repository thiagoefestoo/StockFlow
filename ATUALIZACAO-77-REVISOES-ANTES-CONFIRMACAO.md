# Atualização 77 — revisão dos itens antes da confirmação

## Objetivo

Auditar e fortalecer todos os menus que mostram itens antes da confirmação de uma operação.

Foram verificados 13 fluxos:

1. entrada de estoque;
2. retorno do técnico;
3. perda/desconto;
4. baixa de OS no Portal do Técnico;
5. baixa de OS na Caixa do Técnico;
6. solicitação pela Caixa do Técnico;
7. transferência de material para técnico;
8. transferência de ferramentas do estoque para a ficha;
9. transferência de ferramentas entre técnicos;
10. transferência entre estoques;
11. saída de logística reversa;
12. baixa e devolução na Central da Caixa;
13. solicitação de material.

Doze fluxos utilizam o componente padronizado de revisão. A solicitação da página de Solicitações possui uma tabela detalhada própria.

## Correções

### Seriais na entrada

A revisão de Entrada em Estoque agora mostra:

- quantidade de seriais;
- prévia dos primeiros seriais;
- indicação dos seriais restantes.

Antes, os seriais estavam no objeto da entrada, mas o componente de revisão não recebia os campos esperados.

### Solicitação pela Caixa do Técnico

A confirmação simples foi substituída por revisão completa, mostrando:

- técnico;
- prioridade;
- justificativa;
- todos os materiais;
- quantidade por item;
- quantidade total;
- valor estimado.

A solicitação é validada novamente ao confirmar.

### Transferência ligada a solicitação aprovada

Uma entrega ligada a solicitação já aprovada não informa mais, incorretamente, que será enviada novamente para aprovação.

A mensagem “enviar para aprovação” aparece somente na transferência direta que ultrapassar o limite do técnico.

### Valor de equipamento serializado na OS

Na revisão das baixas de OS, o valor do equipamento selecionado passa a usar primeiro o custo de aquisição do serial.

O custo médio do material é usado apenas como fallback.

### Proteção do componente de revisão

O componente geral agora:

- aceita lista e metadados ausentes sem quebrar;
- reconhece seriais pelo campo serialCount ou pela lista serials;
- mostra valores numéricos iguais a zero corretamente;
- bloqueia a confirmação quando não existe item;
- informa que é necessário voltar e adicionar um item;
- usa texto neutro para operações que ainda dependem de aprovação.

## Teste automático

Foi adicionado:

`frontend/scripts/test-operation-review-flows.js`

O teste verifica os 13 fluxos, as funções de confirmação, a revalidação, a exibição de seriais e a regra de aprovação.

## Banco e backend

- nenhuma alteração de backend;
- nenhuma migration;
- nenhuma coluna nova;
- nenhum saldo alterado;
- nenhuma operação antiga modificada.
