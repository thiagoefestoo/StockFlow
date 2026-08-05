# Atualização 74 — inativação de usuário e limite de contas ativas

## Situação atual identificada

A opção **Excluir usuário** já é uma exclusão lógica.

O sistema não apaga fisicamente o usuário nem os registros relacionados. Ele grava:

- `status = inativo`;
- `deletedAt`;
- motivo da exclusão;
- auditoria da ação.

Por isso, entradas, transferências, ordens de serviço, movimentações, aprovações e auditorias criadas pelo usuário permanecem no banco.

O problema encontrado era outro: o limite de 30 contas utilizava a quantidade total de linhas da tabela `users`. Assim, contas inativas, bloqueadas e excluídas continuavam ocupando vaga.

## Nova opção: Inativar usuário

Na página:

**Administração → Usuários e permissões**

cada conta ativa ou bloqueada passa a exibir o botão:

**Inativar**

Ao confirmar:

- o usuário perde o acesso imediatamente;
- tokens existentes deixam de funcionar na próxima chamada à API;
- a conta fica com status `inativo`;
- todos os registros anteriores permanecem intactos;
- a ação fica registrada na auditoria;
- a conta deixa de ocupar vaga no limite de 30 contas ativas.

A própria conta do administrador conectado não pode ser inativada, bloqueada ou excluída por ele mesmo.

## Contagem do limite

A partir desta atualização, somente conta com estas três condições ocupa vaga:

- `status = ativo`;
- `blockedAt` vazio;
- `deletedAt` vazio.

Portanto, não ocupam vaga:

- contas inativas;
- contas bloqueadas;
- contas excluídas logicamente.

O painel passa a mostrar:

- contas ativas usadas de 30;
- quantidade de inativos;
- quantidade de bloqueados;
- quantidade de excluídos.

## Ativação e restauração

Ao ativar, desbloquear ou restaurar uma conta, ela volta a ocupar uma vaga.

Se já existirem 30 contas ativas, a operação será bloqueada com mensagem para inativar outra conta primeiro.

A proteção existe em dois níveis:

1. validação na aplicação;
2. trigger no PostgreSQL para impedir concorrência ou chamada manual.

## Contas existentes

Após o redeploy, contas que já estavam inativas, bloqueadas ou excluídas deixam de contar automaticamente no limite.

Nenhum registro é alterado ou apagado para produzir essa nova contagem.

## Técnico vinculado

Inativar a conta de acesso não apaga o cadastro do técnico nem seu histórico operacional.

O técnico, sua caixa, movimentações, ordens de serviço, ferramentas, transferências e registros permanecem intactos.

## Banco de dados

- nenhuma coluna nova;
- nenhuma tabela nova;
- nenhuma migration manual;
- a função e o trigger de limite são atualizados automaticamente na inicialização do backend;
- nenhum usuário é inativado automaticamente;
- nenhum registro histórico é apagado.
