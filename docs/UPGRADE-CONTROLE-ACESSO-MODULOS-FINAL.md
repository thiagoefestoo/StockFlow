# Upgrade - Controle de acesso por módulos

Este pacote adiciona controle individual de módulos por usuário.

## O que mudou

- Foi criado o campo `modulePermissions` na tabela `users`.
- O backend cria a coluna automaticamente ao iniciar, mesmo com `DB_SYNC=false`.
- O admin passa a editar as permissões dentro de **Administração → Usuários e permissões → Editar usuário**.
- Cada módulo aparece com uma caixa de checagem.
- O menu lateral mostra apenas os módulos liberados para o usuário.
- A rota direta também é bloqueada pelo backend, não apenas pelo visual.
- Administrador sempre mantém acesso total.
- Estoquista vem por padrão sem BI Financeiro, mas com BI Executivo/Operacional liberado.

## Exemplo de uso

Para um estoquista:

- Marcar: BI Executivo/Operacional.
- Desmarcar: BI Financeiro.
- Salvar usuário.

Depois, ao logar como esse usuário, o menu lateral já será exibido conforme as permissões salvas.
