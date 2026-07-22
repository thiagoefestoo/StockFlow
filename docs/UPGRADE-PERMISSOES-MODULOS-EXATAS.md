# Controle de permissões por módulo — ajuste final

Este ajuste torna o controle de módulos mais rigoroso:

- O menu lateral só mostra módulos marcados no usuário.
- A rota do frontend bloqueia acesso quando o módulo não está marcado.
- O backend valida `modulePermissions` em cada rota protegida.
- Usuário administrador continua com acesso total.
- O módulo "Usuários e permissões" continua reservado ao administrador.
- Alterações de permissões são atualizadas automaticamente no usuário logado por foco da janela e intervalo.
- Na tela de usuário foram adicionados botões "Marcar todos" e "Desmarcar todos" para facilitar conferência.

Regra principal:

- Checkbox marcado: usuário pode acessar o módulo.
- Checkbox desmarcado: usuário não vê o módulo e recebe bloqueio ao tentar acessar pela URL/API.
