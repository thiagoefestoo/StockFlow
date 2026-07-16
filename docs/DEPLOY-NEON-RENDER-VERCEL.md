# Deploy do StockFlow com Neon, Render e Vercel

Este projeto foi preparado para o seguinte ambiente:

- Banco de dados: Neon PostgreSQL
- Backend/API: Render
- Frontend: Vercel

## 1. Neon PostgreSQL

1. Crie um projeto no Neon.
2. Crie ou selecione um banco, por exemplo `stockflow`.
3. Copie a connection string com SSL.
4. A URL normalmente tem este formato:

```env
DATABASE_URL=postgresql://usuario:senha@ep-exemplo.us-east-2.aws.neon.tech/stockflow?sslmode=require
```

Use essa URL no Render.

## 2. Backend no Render

O backend fica na pasta `backend`.

Configuração recomendada:

```text
Root Directory: backend
Build Command: npm install
Start Command: npm start
Health Check Path: /api/health
```

Variáveis obrigatórias no Render:

```env
NODE_ENV=production
DATABASE_URL=postgresql://usuario:senha@host-neon/stockflow?sslmode=require
DB_SSL=true
DB_SYNC=true
DB_LOG=false
JWT_SECRET=uma_chave_grande_com_mais_de_32_caracteres
JWT_EXPIRES_IN=12h
SETUP_ADMIN_KEY=uma_chave_para_criar_o_primeiro_admin
CORS_ORIGIN=https://seu-frontend.vercel.app
FRONTEND_URL=https://seu-frontend.vercel.app
TELECOMSTOCK_AUTO_INTELLIGENCE_MINUTES=60
UPLOAD_PUBLIC_BASE_URL=https://seu-backend.onrender.com/uploads
```

No primeiro deploy, deixe:

```env
DB_SYNC=true
```

Depois que o banco criar as tabelas, recomenda-se voltar para:

```env
DB_SYNC=false
```

## 3. Teste do backend

Depois do deploy, acesse:

```text
https://seu-backend.onrender.com/api/health
```

Resposta esperada:

```json
{
  "success": true,
  "status": "online",
  "database": "connected"
}
```

## 4. Frontend na Vercel

O frontend fica na pasta `frontend`.

Configuração recomendada:

```text
Framework Preset: Create React App
Root Directory: frontend
Install Command: npm install
Build Command: npm run build
Output Directory: build
```

Variável obrigatória na Vercel:

```env
REACT_APP_API_URL=https://seu-backend.onrender.com/api
```

Depois de alterar essa variável, faça novo redeploy do frontend.

## 5. Primeiro administrador

Depois que backend e frontend estiverem online, crie o primeiro admin pelo endpoint:

```http
POST /api/auth/setup-admin
```

Corpo JSON:

```json
{
  "key": "sua_SET_UP_ADMIN_KEY",
  "name": "Administrador",
  "email": "admin@suaempresa.com",
  "password": "sua_senha_segura"
}
```

## 6. Uploads e guias assinadas

O sistema já aceita anexos no backend, mas atenção: armazenamento local no Render pode ser temporário dependendo do plano. Para produção definitiva, prefira integrar storage externo como S3, Cloudinary, Supabase Storage ou similar.

## 7. Variáveis principais

Backend Render:

```env
DATABASE_URL=...
CORS_ORIGIN=https://seu-frontend.vercel.app
FRONTEND_URL=https://seu-frontend.vercel.app
```

Frontend Vercel:

```env
REACT_APP_API_URL=https://seu-backend.onrender.com/api
```

Se o frontend abrir, mas não carregar dados, normalmente o problema está em uma dessas três variáveis.
