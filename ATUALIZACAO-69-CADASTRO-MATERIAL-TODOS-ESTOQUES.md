# Atualização 69 — cadastrar material em todos os estoques

## Objetivo

Adicionar ao cadastro de materiais a opção:

**Todos os estoques operacionais autorizados**

O material é criado uma única vez no catálogo e inicializado em cada estoque permitido para a conta conectada.

## Funcionamento da tela

No campo **Onde cadastrar o material**, o usuário poderá escolher:

- um estoque regional específico;
- todos os estoques operacionais autorizados.

Quando a opção de todos os estoques for selecionada, a tela mostra previamente as unidades que receberão o cadastro.

## Regra de saldo

O cadastro não cria quantidade física automaticamente.

Para cada estoque escolhido, o sistema inicializa uma linha de saldo com:

`quantidade = 0`

A quantidade real continua sendo registrada pela página **Entrada em Estoque**.

Isso evita:

- unidade adicional indevida;
- duplicação de material;
- movimentação sem documento;
- impacto inesperado no BI financeiro.

## Materiais serializados

Quando o material exige serial e a opção de todos os estoques é utilizada:

- o material é cadastrado em todos os estoques com zero seriais;
- não é permitido informar seriais iniciais;
- os seriais devem ser registrados depois pela Entrada em Estoque da cidade correta.

Essa proteção impede que o mesmo conjunto de seriais seja associado a várias cidades.

Ao escolher apenas um estoque, o fluxo atual de seriais iniciais permanece disponível.

## Segurança por cidade e conta

O backend não confia apenas na opção enviada pela tela.

Ele consulta diretamente os estoques permitidos para o usuário e inclui somente:

- estoques ativos;
- estoques operacionais;
- estoques e cidades autorizados para a conta.

O administrador alcança todos os estoques operacionais ativos.

Usuários restritos alcançam apenas seu próprio escopo.

Estoques de logística reversa não entram na seleção.

## Compatibilidade

A resposta da API continua retornando o material criado diretamente, preservando a estrutura utilizada por integrações e telas antigas.

Requisições antigas que enviam apenas `initialWarehouseId` continuam funcionando.

O novo campo é:

`registerInAllWarehouses: true`

## Auditoria

O histórico do cadastro passa a registrar:

- se foi utilizada a opção de todos os estoques;
- relação de estoques inicializados;
- cidade e código das unidades;
- quantidade inicial;
- seriais iniciais, quando houver cadastro em uma unidade específica.

## Banco de dados

- nenhuma migration;
- nenhuma coluna adicionada;
- nenhum material antigo modificado;
- nenhum saldo existente alterado;
- nenhuma entrada ou transferência criada automaticamente.

Somente quando um novo material for cadastrado com a nova opção serão criadas linhas de saldo zero para os estoques autorizados.
