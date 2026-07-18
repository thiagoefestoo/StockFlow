# Bloqueio de dados cadastrais da conta

Ajuste implementado para impedir que perfis diferentes de administrador alterem dados cadastrais da própria conta.

## Regras aplicadas

- Técnico não altera nome, e-mail, telefone, cargo ou observações pela tela Minha conta.
- Estoquista não altera nome, e-mail, telefone, cargo ou observações pela tela Minha conta.
- Supervisor também fica bloqueado para edição cadastral própria, mantendo a regra de que somente administrador altera esses dados.
- Perfis bloqueados podem alterar apenas a própria senha.
- Backend reforça a regra no endpoint `/auth/me`, retornando erro caso usuário não administrador tente alterar dados cadastrais.
- Administrador continua conseguindo alterar dados dos usuários pela tela de gerenciamento de usuários.

## Arquivos alterados

- `frontend/src/pages/Account.jsx`
- `backend/app/controllers/authController.js`
