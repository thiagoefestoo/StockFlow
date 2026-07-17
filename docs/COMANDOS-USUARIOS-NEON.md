# Comandos para criar contas de usuários no Neon

Este projeto salva as contas na tabela `users` do PostgreSQL/Neon. As senhas não são salvas em texto puro: o backend grava o `passwordHash` com bcrypt.

## 1. Pré-requisitos

No arquivo `backend/.env`, confira:

```env
DATABASE_URL=postgresql://...
DB_SSL=true
DB_SYNC=false
```

Use `DB_SYNC=true` apenas no primeiro deploy de um banco zerado. Depois volte para `DB_SYNC=false`.

## 2. Criar/atualizar contas padrão no Neon

No PowerShell:

```powershell
cd C:\Users\TH\Documents\GitHub\StockFlow\backend

$env:SEED_ADMIN_EMAIL="admin@local.com"
$env:SEED_ADMIN_PASSWORD="admin123"

$env:SEED_STOCK_NAME="Estoquista Super Infra"
$env:SEED_STOCK_EMAIL="estoque@superinfra.local"
$env:SEED_STOCK_PASSWORD="estoque123"

$env:SEED_TECH_NAME="Bruno Lima"
$env:SEED_TECH_EMAIL="bruno@superinfra.local"
$env:SEED_TECH_PASSWORD="tec123456"
$env:SEED_TECH_CITIES="Joinville,Araquari"

npm run create-neon-users
```

O script cria/atualiza:

- 1 administrador
- 1 estoquista
- 1 técnico vinculado ao cadastro de técnico
- 1 estoque padrão, se ainda não existir

## 3. Criar usuários pela tela do sistema

1. Entre como administrador.
2. Vá em **Administração > Usuários**.
3. Crie ou edite o usuário.
4. No campo **Nova senha manual opcional**, digite a senha desejada.
5. Clique em **Salvar usuário**.

Se o campo de senha ficar vazio na edição, a senha anterior será mantida.

## 4. Criar login pelo cadastro de técnico

1. Entre como administrador.
2. Vá em **Técnicos**.
3. Edite o técnico.
4. Marque **Criar ou sincronizar conta de login no banco Neon**.
5. Digite a senha manual.
6. Clique em **Salvar**.

Se preencher a senha, o sistema agora sincroniza automaticamente a conta do técnico no banco Neon.
