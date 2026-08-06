# Atualização 80 — exibir todos os itens do estoque de origem

## Problema

Na transferência entre estoques, a interface consultava os materiais com:

`activeOnly: true`

Isso ocultava qualquer material inativo no catálogo, mesmo quando ainda havia
saldo físico positivo no estoque selecionado.

Um item nessa situação permanecia visível nos detalhes e inventários do estoque,
mas não aparecia na lista de transferência.

## Correção

A transferência passa a exibir todos os materiais que possuam saldo físico
positivo no estoque de origem:

- materiais ativos;
- materiais inativos ainda com saldo;
- ferramentas;
- EPIs;
- consumíveis;
- equipamentos serializados disponíveis.

Itens com saldo zero continuam fora da lista, pois não existe quantidade para
transferir.

## Materiais inativos

O item inativo é identificado na lista por:

`INATIVO NO CATÁLOGO`

Ele pode ser transferido entre estoques para permitir a realocação do saldo
existente.

A alteração não reativa o cadastro e não permite criar saldo novo. Todas as
validações de quantidade e serial continuam obrigatórias.

## Ordenação

A lista passa a ser exibida em ordem alfabética por nome ou SKU, facilitando a
localização de itens como:

`PARAFUSADEIRA IMPACTO BOSCH`

## Segurança

O backend continua conferindo no momento da solicitação e da aprovação:

- estoque de origem;
- estoque de destino;
- saldo físico disponível;
- serial disponível;
- serial pertencente ao material;
- ausência de itens e seriais duplicados;
- transação única na aprovação.

## Banco de dados

- nenhuma migration;
- nenhuma coluna nova;
- nenhum material reativado;
- nenhum saldo alterado durante a instalação.
