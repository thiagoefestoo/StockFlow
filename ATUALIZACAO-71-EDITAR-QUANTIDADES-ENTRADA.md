# Atualização 71 — editar quantidades dos itens de uma entrada

## Objetivo

Permitir que uma entrada de estoque já registrada tenha as quantidades dos seus itens corrigidas pela tela **Editar entrada**.

A alteração é controlada por uma permissão específica concedida na Administração da conta.

## Permissões na Administração

Em:

**Administração → Usuários e permissões → Permissões especiais**

ficam disponíveis duas autorizações separadas:

### Editar dados documentais das entradas

Permite alterar os campos que já eram editáveis:

- número da entrada;
- data;
- ciclo;
- fornecedor/origem;
- status da conferência;
- documento fiscal;
- emitente;
- responsável;
- localização;
- comprovante;
- observações.

### Alterar quantidades de itens das entradas

Permite alterar a quantidade dos materiais sem serial que fazem parte da entrada.

A permissão nova é opt-in:

- administrador: permitido;
- supervisor padrão: bloqueado;
- estoquista padrão: bloqueado;
- usuário autorizado manualmente: permitido.

Uma conta pode receber somente uma das permissões ou as duas.

## Funcionamento

Na página:

**Entrada em Estoque → Detalhes → Editar entrada**

a janela passa a exibir todos os itens da entrada com:

- material;
- quantidade original;
- quantidade corrigida;
- diferença;
- custo unitário;
- total projetado;
- total geral antes e depois.

## Ajuste do saldo

Para material sem serial, o sistema movimenta apenas a diferença.

Exemplo:

- quantidade original: 10;
- quantidade corrigida: 14;
- diferença no estoque: +4.

Outro exemplo:

- quantidade original: 10;
- quantidade corrigida: 7;
- diferença no estoque: -3.

Ao reduzir uma entrada, o estoque precisa possuir saldo suficiente naquele material. Caso parte do saldo já tenha sido transferida ou consumida e não haja quantidade disponível, a correção é bloqueada e nenhuma alteração é mantida.

## Valores e BI

Depois da correção, o sistema recalcula automaticamente:

- quantidade total da entrada;
- custo total de cada item;
- valor total da entrada;
- movimentação original de entrada;
- saldo do estoque;
- dados utilizados pelos BIs.

O custo unitário permanece o mesmo da entrada original.

## Materiais com serial

A quantidade de itens serializados não pode ser alterada nessa tela.

Ela fica bloqueada porque a quantidade deve continuar exatamente igual ao número de seriais vinculados.

A proteção evita:

- serial sem item;
- item sem serial;
- divergência patrimonial;
- inconsistência no histórico de movimentações.

## Campos que permanecem bloqueados

A correção de quantidade não permite:

- trocar o material;
- adicionar item;
- excluir item;
- trocar o estoque;
- editar o custo unitário;
- editar seriais.

## Segurança no backend

A API valida novamente a permissão:

`stockBatchQuantityEdit`

Uma chamada manual sem autorização recebe erro 403.

A operação ocorre em uma única transação. Se qualquer validação falhar, o sistema desfaz:

- alteração do item;
- ajuste do saldo;
- atualização da movimentação;
- recálculo dos totais;
- registro da auditoria.

## Auditoria

A auditoria registra:

- usuário responsável;
- entrada alterada;
- material;
- quantidade anterior;
- quantidade nova;
- diferença aplicada;
- dados anteriores e posteriores.

## Banco de dados

- nenhuma migration;
- nenhuma coluna adicionada;
- nenhuma tabela criada;
- nenhuma entrada antiga alterada automaticamente;
- nenhum saldo alterado durante a instalação;
- nenhuma permissão nova concedida automaticamente a usuários não administradores.
