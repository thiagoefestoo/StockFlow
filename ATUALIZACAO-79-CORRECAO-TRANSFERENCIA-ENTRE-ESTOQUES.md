# Atualização 79 — correção da transferência entre estoques

## Objetivo

Revisar e corrigir o fluxo completo de transferência entre estoques:

1. seleção do estoque de origem;
2. carregamento dos materiais e seriais disponíveis;
3. revisão dos itens;
4. criação da solicitação de aprovação;
5. aprovação pelo administrador;
6. saída do estoque de origem;
7. entrada no estoque de destino;
8. histórico e auditoria.

## Problemas encontrados

### Referência usada como identificador da operação

O texto digitado em **Referência** também era utilizado como código da solicitação.

Uma referência como:

`Reposição Vila Velha`

pode ser usada em várias transferências. Dependendo das restrições existentes no
banco, a repetição ou duas operações criadas no mesmo segundo podiam resultar em
erro genérico de validação.

### Número automático com precisão de apenas um segundo

O número antigo era semelhante a:

`TE-20260806-092300`

Duas solicitações criadas no mesmo segundo podiam receber o mesmo número.

### Itens permaneciam ao trocar o estoque de origem

Ao alterar a origem, a tela limpava apenas os seriais. Materiais e quantidades
selecionados para o estoque anterior podiam continuar no formulário.

### Catálogo não era carregado especificamente pela origem

A lista inicial utilizava o catálogo geral. O backend reprovava posteriormente
itens sem saldo na origem, mas a tela podia apresentar uma disponibilidade que
não correspondia ao estoque selecionado.

### Aprovação e movimentação em transações separadas

O saldo era movimentado primeiro e o status da aprovação era salvo depois.

Uma falha entre essas duas etapas poderia deixar a aprovação pendente mesmo após
a movimentação, permitindo tentativa de execução duplicada.

### Concorrência durante a aprovação

Os saldos e equipamentos não eram bloqueados durante toda a execução. Duas
aprovações simultâneas podiam disputar o mesmo saldo ou serial.

### Serial não validado contra o material da linha

O fluxo verificava o serial e o estoque, mas não exigia explicitamente que o
serial pertencesse ao material selecionado.

## Correções

### Número único e referência separada

Agora existem dois conceitos:

- **Referência/motivo:** texto livre, pode ser repetido;
- **Número da operação:** gerado automaticamente e sempre único.

Exemplo:

- referência: `Reposição Vila Velha`;
- operação: `TE-20260806-092300-123-A1B2C3D4`.

O número utiliza data, horário, milissegundos e oito caracteres aleatórios.

### Estoque de origem controla a lista

Ao escolher a origem, a tela consulta:

- materiais ativos com saldo positivo naquele estoque;
- equipamentos serializados disponíveis naquele estoque.

Ao trocar a origem:

- todos os itens da montagem são limpos;
- todos os seriais são limpos;
- a revisão é fechada;
- o catálogo é carregado novamente.

### Validação antes da revisão

A tela bloqueia:

- origem igual ao destino;
- item sem material;
- material repetido;
- serial repetido;
- serial que não pertence ao material;
- serial que deixou de estar disponível;
- quantidade zero, negativa, decimal ou acima do saldo.

### Revalidação na aprovação

No momento da aprovação, o backend verifica novamente:

- estoques ativos;
- saldo disponível;
- material ativo;
- serial no estoque de origem;
- serial pertencente ao material;
- ausência de itens e seriais duplicados.

### Transação única

Na aprovação, as seguintes ações acontecem na mesma transação:

1. bloqueio da aprovação;
2. revalidação do saldo;
3. bloqueio dos saldos e seriais;
4. saída da origem;
5. entrada no destino;
6. criação das movimentações;
7. atualização da aprovação;
8. registro da auditoria.

Se qualquer etapa falhar, tudo é revertido.

### Proteção contra clique ou aprovação duplicada

A linha da aprovação é bloqueada com `FOR UPDATE`.

Se duas confirmações ocorrerem ao mesmo tempo, somente uma executa. A outra
encontra a aprovação já decidida e é bloqueada.

## Comportamento operacional

A solicitação continua sem movimentar saldo imediatamente.

O saldo somente muda quando o administrador aprova a operação na Central de
Aprovações.

## Compatibilidade

Aprovações pendentes criadas antes desta atualização continuam podendo ser
executadas. No momento da aprovação, o sistema gera um número único para a
movimentação e preserva a referência antiga como descrição.

## Banco de dados

- nenhuma migration;
- nenhuma coluna adicionada;
- nenhuma tabela criada;
- nenhum saldo alterado durante a instalação;
- nenhuma aprovação antiga alterada automaticamente.
