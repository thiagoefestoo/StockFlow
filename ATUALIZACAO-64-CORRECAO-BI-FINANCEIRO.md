# Atualização 64 — correção do BI Financeiro

## Escopo

A alteração foi aplicada somente ao **BI Financeiro**. Os BIs Executivo, Técnicos e Auditoria não tiveram suas fórmulas alteradas.

## Correções realizadas

### Baixado em OS

O card passa a considerar exclusivamente ordens com:

`status = concluida`

OS abertas, pendentes e canceladas não entram no total consumido.

### Separação do consumo

O valor das OS concluídas foi dividido em:

- equipamentos baixados em OS: itens serializados;
- consumíveis aplicados: materiais sem serial;
- baixado em OS concluídas: soma das duas parcelas.

Assim:

`Baixado em OS concluídas = Equipamentos baixados em OS + Consumíveis aplicados`

### Equipamentos instalados

O card foi renomeado para **Equipamentos instalados** e continua representando a posição atual dos itens serializados com proprietário cliente.

Ele não é mais apresentado como se fosse igual ao consumo histórico das OS, pois equipamentos podem ser substituídos, devolvidos ou movimentados depois da instalação.

### Cobertura documentada

A fórmula anterior era:

`posição atual ÷ entradas do período`

Essa comparação misturava uma fotografia atual com entradas limitadas pelo período selecionado.

A nova fórmula usa o histórico completo do escopo autorizado:

`posição atual + consumíveis aplicados em OS concluídas + perdas documentadas`
`÷ entradas confirmadas do histórico`

Equipamentos serializados instalados não são somados novamente como consumo, pois já fazem parte da posição atual. Isso evita duplicidade.

A cobertura fica indisponível quando filtros que impedem uma conciliação válida são usados, como técnico, empresa, fornecedor, status, serviço, movimento, faixa de valor ou busca livre.

### Diferença a conciliar

Foi adicionado um card que mostra a diferença entre:

- entradas confirmadas do histórico;
- destinos documentados.

Esse valor ajuda a identificar OS canceladas sem estorno, ajustes, divergências de custo, perdas não registradas ou dados históricos incompletos.

### Posição por estoque

O quadro regional agora recebe os filtros de:

- cidade;
- material;
- categoria;
- tipo serializado/consumível;
- pesquisa.

Também considera somente estoques operacionais ativos. Isso evita comparar um card filtrado por cidade com um total regional sem filtro.

## Gráficos e listas

As seguintes áreas passam a considerar somente OS concluídas para consumo:

- fluxo financeiro mensal;
- entrada x consumo por categoria;
- consumo por técnico;
- consumo por material;
- últimas baixas em OS.

O gráfico “Custo das OS por status” permanece mostrando todos os status, pois sua finalidade é auditoria.

## Banco de dados

- nenhuma migration;
- nenhuma coluna adicionada;
- nenhum saldo modificado;
- nenhuma OS alterada;
- nenhum histórico recriado;
- nenhum registro excluído.

A atualização modifica somente consultas, fórmulas e apresentação.
