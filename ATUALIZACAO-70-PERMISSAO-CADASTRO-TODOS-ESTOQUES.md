# Atualização 70 — permissão para cadastrar material em todos os estoques

## Objetivo

Controlar individualmente quais contas podem utilizar a opção:

**Todos os estoques operacionais autorizados**

A liberação é feita em:

**Administração → Usuários e permissões → Permissões especiais**

Nome da permissão:

**Cadastrar material em todos os estoques**

## Comportamento por perfil

### Administrador

O administrador mantém acesso total, conforme a regra atual do sistema.

### Supervisor, estoquista e outras contas

A nova permissão não é concedida automaticamente.

Para liberar:

1. abrir Administração;
2. acessar Usuários e permissões;
3. editar a conta;
4. localizar Permissões especiais;
5. marcar Cadastrar material em todos os estoques;
6. salvar o usuário.

Sem essa permissão, a conta continua podendo cadastrar o material em um estoque específico, desde que também tenha a permissão Cadastrar/editar materiais.

## Proteção no frontend

Sem a permissão:

- a opção Todos os estoques não aparece no seletor;
- a tela informa onde solicitar a liberação;
- uma seleção antiga é automaticamente substituída por um estoque específico;
- o formulário não envia `registerInAllWarehouses: true`.

Com a permissão:

- a opção aparece normalmente;
- são mostrados os estoques operacionais autorizados;
- o material é criado uma única vez;
- cada estoque recebe uma linha de saldo zero.

## Proteção no backend

O backend valida novamente:

`materialAllWarehouses`

Caso uma conta sem acesso envie manualmente:

`registerInAllWarehouses: true`

a API responde com status 403 e não cria o material.

A validação independe da tela e impede alteração manual da requisição pelo navegador.

## Escopo por cidade

Mesmo com a permissão, o usuário alcança somente:

- estoques autorizados na conta;
- cidades vinculadas;
- estoques ativos;
- estoques operacionais.

Estoques de logística reversa e inativos ficam de fora.

## Compatibilidade

Esta atualização já contém a funcionalidade da atualização 69.

Caso a atualização 69 ainda não tenha sido aplicada, aplique somente a atualização 70.

Requisições antigas com um único `initialWarehouseId` continuam funcionando.

## Banco de dados

A permissão utiliza a coluna JSONB `modulePermissions`, que já existe.

- nenhuma migration;
- nenhuma coluna adicionada;
- nenhuma tabela alterada;
- nenhum usuário antigo modificado em massa;
- nenhum material antigo modificado;
- nenhum saldo alterado.

Usuários existentes não administradores permanecem sem a nova permissão até que o administrador a conceda.
