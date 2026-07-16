# Rodar o StockFlow localmente antes do Render e Vercel

Este fluxo é recomendado para desenvolver e testar tudo no computador antes de subir para produção.

## Arquitetura local

```text
Frontend React: http://localhost:5173
Backend API:     http://localhost:3000/api
PostgreSQL:      localhost:5432
Banco:           stockflow
Usuário:         stockflow
Senha:           stockflow
```

## 1. Instalar dependências obrigatórias

No Windows, tenha instalado:

- Node.js 20 ou superior;
- Git;
- Docker Desktop, se quiser usar PostgreSQL local com Docker.

O Docker é a forma mais simples para o banco local. Se preferir, também pode usar PostgreSQL instalado diretamente no Windows.

## 2. Abrir a pasta do projeto

Exemplo:

```powershell
cd C:\Users\TH\Documents\GitHub\StockFlow
```

## 3. Subir o PostgreSQL local com Docker

```powershell
docker compose -f docker-compose.local.yml up -d
```

Verifique se o banco está rodando:

```powershell
docker ps
```

Precisa aparecer o container:

```text
stockflow-postgres-local
```

### Sem Docker

Se usar PostgreSQL instalado no Windows, crie o usuário e banco:

```sql
CREATE USER stockflow WITH PASSWORD 'stockflow';
CREATE DATABASE stockflow OWNER stockflow;
```

A URL local será:

```env
DATABASE_URL=postgres://stockflow:stockflow@localhost:5432/stockflow
```

## 4. Criar os arquivos .env locais

No PowerShell:

```powershell
Copy-Item backend\.env.local.example backend\.env
Copy-Item frontend\.env.local.example frontend\.env
```

O backend local usa:

```env
DATABASE_URL=postgres://stockflow:stockflow@localhost:5432/stockflow
DB_SSL=false
DB_SYNC=true
CORS_ORIGIN=http://localhost:5173,http://127.0.0.1:5173
```

O frontend local usa:

```env
REACT_APP_API_URL=http://localhost:3000/api
```

## 5. Instalar dependências

```powershell
npm install --prefix backend
npm install --prefix frontend
```

Ou:

```powershell
npm run install:all
```

## 6. Iniciar backend e frontend

Em um terminal:

```powershell
npm start --prefix backend
```

Em outro terminal:

```powershell
npm start --prefix frontend
```

Também pode usar o script pronto:

```powershell
.\start-local.ps1
```

Se o PowerShell bloquear scripts, use:

```powershell
powershell -ExecutionPolicy Bypass -File .\start-local.ps1
```

Ou use o arquivo:

```powershell
.\start-local.bat
```

## 7. Testar API local

Abra no navegador:

```text
http://localhost:3000/api/health
```

A resposta esperada é parecida com:

```json
{
  "success": true,
  "status": "online"
}
```

## 8. Administrador local automático

O arquivo `backend/.env.local.example` já vem com:

```env
AUTO_CREATE_ADMIN=true
DEFAULT_ADMIN_EMAIL=admin@local.com
DEFAULT_ADMIN_PASSWORD=admin123
```

Quando o backend iniciar e conseguir conectar ao banco, ele cria ou atualiza esse administrador automaticamente.

O frontend local também vem com:

```env
REACT_APP_DEFAULT_ADMIN_EMAIL=admin@local.com
REACT_APP_DEFAULT_ADMIN_PASSWORD=admin123
```

Assim, a tela de login já abre preenchida e exibe o botão **Entrar como admin local**. Basta clicar para acessar.

Se preferir criar manualmente, ainda existe o script:

```powershell
npm run create-local-admin --prefix backend
```

Login local padrão:

```text
Email: admin@local.com
Senha: admin123
```

Em produção, mantenha `AUTO_CREATE_ADMIN=false` e não salve senha do admin nas variáveis do frontend.

## 9. Abrir o sistema

```text
http://localhost:5173
```

## 10. Testar o fluxo completo localmente

Antes de subir para Render/Vercel, teste:

1. Login do admin.
2. Cadastro de materiais.
3. Cadastro de técnicos.
4. Entrada quinzenal de materiais.
5. Cadastro de ONUs com número de série.
6. Transferência para técnico.
7. Impressão da guia de assinatura.
8. Anexo da guia assinada.
9. Portal técnico no celular ou navegador responsivo.
10. Baixa por OS, CPF e nome do cliente.
11. BI Executivo.
12. BI por Técnico.
13. BI Auditoria/Patrimônio.
14. Sino de notificações.
15. Histórico/auditoria.

## 11. Validar build antes de subir

```powershell
npm run check --prefix backend
npm run build --prefix frontend
```

Ou:

```powershell
npm run check
```

## 12. Só depois subir para GitHub

```powershell
git status
git add .
git commit -m "Prepara StockFlow para ambiente local e deploy posterior"
git push origin main
```

## 13. Produção fica separada

Local usa:

```env
DATABASE_URL=postgres://stockflow:stockflow@localhost:5432/stockflow
DB_SSL=false
REACT_APP_API_URL=http://localhost:3000/api
```

Produção usa:

```env
DATABASE_URL=postgresql://usuario:senha@host-neon/stockflow?sslmode=require
DB_SSL=true
REACT_APP_API_URL=https://seu-backend.onrender.com/api
```

Nunca suba arquivos `.env` reais para o GitHub.
