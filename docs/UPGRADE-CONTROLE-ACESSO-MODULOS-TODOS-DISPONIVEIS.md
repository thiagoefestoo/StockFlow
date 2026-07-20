# Ajuste - controle de acesso mostrando todos os módulos

Este ajuste corrige a tela de edição de usuário para exibir todos os módulos operacionais, cadastros, BI e auditoria disponíveis para seleção, mesmo quando ainda não estão liberados para o usuário.

## Alterações

- A tela `Administração -> Usuários e permissões -> Editar usuário` agora mostra todos os módulos selecionáveis.
- O admin pode marcar/desmarcar o acesso por checkbox.
- O menu lateral continua exibindo apenas os módulos liberados para o usuário logado.
- O backend passa a aceitar permissões operacionais/BI liberadas manualmente pelo admin, independentemente do perfil base do usuário.
- O módulo `Usuários e permissões` permanece reservado ao administrador por segurança.

## Arquivos alterados

- frontend/src/pages/Users.jsx
- frontend/src/config/modulePermissions.js
- backend/app/config/modulePermissions.js
