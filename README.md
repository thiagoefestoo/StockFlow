# StockFlow

Sistema moderno para prestadoras de serviço de telecom controlarem estoque, patrimônio serializado, carga dos técnicos, baixa por OS, guias de assinatura, auditoria e BI gerencial.

## Módulos principais

- **Estoque geral:** materiais de telecom, ONUs, drop, esticador, conectores, cabos e outros itens.
- **Entrada quinzenal:** registro do material recebido da companhia de telecom a cada ciclo.
- **Patrimônio serializado:** controle de ONUs/equipamentos por número de série e MAC.
- **Transferência para técnico:** transfere materiais para a carga do colaborador e gera guia de assinatura.
- **Anexo de guia assinada:** upload de PDF ou imagem da guia assinada dentro do próprio sistema.
- **Portal técnico mobile:** técnico visualiza sua carga e baixa materiais informando OS, CPF e nome do cliente.
- **Auditoria completa:** toda criação, edição, transferência, assinatura e baixa gera histórico.
- **Permissões por perfil:** admin, supervisor e técnico.
- **Sistema vivo:** sino de notificações, tarefas, alertas de estoque baixo, assinatura pendente, custódia antiga e dicas operacionais.
- **BI gerencial:** três páginas de BI: Executivo, Técnicos e Auditoria/Patrimônio.

## Stack

- Backend: Node.js, Express, Sequelize e PostgreSQL.
- Frontend: React, React Router e CSS responsivo.
- Deploy sugerido: backend no Render e frontend na Vercel.

## Rodar localmente

### Backend

```bash
cd backend
npm install
cp .env.example .env
npm start
```

Configure `DATABASE_URL` e `JWT_SECRET` no `.env`.

O ambiente local já vem preparado para criar o administrador automaticamente quando o backend iniciar com `AUTO_CREATE_ADMIN=true`:

```text
Email: admin@local.com
Senha: admin123
```

Na tela de login, o frontend local exibe o botão **Entrar como admin local** e também deixa os campos preenchidos. Em produção, mantenha `AUTO_CREATE_ADMIN=false` e não configure `REACT_APP_DEFAULT_ADMIN_PASSWORD` na Vercel.

### Frontend

```bash
cd frontend
npm install
cp .env.example .env
npm start
```

Variável do frontend:

```env
REACT_APP_API_URL=http://localhost:3000/api
```

## Variáveis principais do backend

```env
NODE_ENV=production
PORT=3000
DATABASE_URL=sua_url_postgresql
DB_SSL=true
DB_SYNC=true
JWT_SECRET=sua_chave_segura
JWT_EXPIRES_IN=12h
SETUP_ADMIN_KEY=uma_chave_de_primeiro_acesso
CORS_ORIGIN=https://seu-frontend.vercel.app
TELECOMSTOCK_AUTO_INTELLIGENCE_MINUTES=60
```

Depois do primeiro deploy com as tabelas criadas, recomenda-se alterar `DB_SYNC=false`.

## Perfis

### Admin

Acesso total: usuários, estoque, transferências, BI, auditoria, técnicos e configurações.

### Supervisor

Acesso gerencial: estoque, transferências, técnicos, BI, auditoria e acompanhamento operacional.

### Técnico

Acesso enxuto e mobile: portal técnico, carga própria e baixa por OS.

## Fluxo ideal

1. Cadastre materiais e marque quais exigem número de série.
2. Registre a entrada quinzenal recebida da telecom.
3. Transfira ONUs e materiais para o técnico.
4. Imprima a guia de entrega com os seriais.
5. Técnico assina a guia.
6. Anexe a guia assinada no sistema.
7. Técnico baixa materiais pelo portal mobile informando OS, CPF e cliente.
8. Admin/supervisor acompanha BI, histórico e alertas.



## Desenvolvimento local primeiro

Este pacote está preparado para você testar tudo localmente antes de subir para Render e Vercel.

Arquivos adicionados para ambiente local:

```text
docker-compose.local.yml
backend/.env.local.example
frontend/.env.local.example
start-local.ps1
start-local.bat
docs/RODAR-LOCALMENTE.md
```

Fluxo recomendado:

```powershell
docker compose -f docker-compose.local.yml up -d
Copy-Item backend\.env.local.example backend\.env
Copy-Item frontend\.env.local.example frontend\.env
npm run install:all
npm start --prefix backend
npm start --prefix frontend
```

Depois abra:

```text
http://localhost:5173
```

Guia completo: `docs/RODAR-LOCALMENTE.md`.

## Deploy em Neon, Render e Vercel

Este pacote já foi adaptado para:

- Neon PostgreSQL como banco de dados;
- Render para o backend/API;
- Vercel para o frontend.

Arquivos principais de deploy:

```text
render.yaml
backend/.env.example
frontend/.env.example
frontend/vercel.json
docs/DEPLOY-NEON-RENDER-VERCEL.md
```

Resumo das variáveis mais importantes:

```env
# Render / Backend
DATABASE_URL=postgresql://usuario:senha@host-neon/stockflow?sslmode=require
DB_SSL=true
DB_SYNC=true
CORS_ORIGIN=https://seu-frontend.vercel.app
FRONTEND_URL=https://seu-frontend.vercel.app

# Vercel / Frontend
REACT_APP_API_URL=https://seu-backend.onrender.com/api
```

No primeiro deploy, use `DB_SYNC=true` para criar as tabelas no Neon. Depois que o sistema subir, volte para `DB_SYNC=false`.

Veja o passo a passo completo em `docs/DEPLOY-NEON-RENDER-VERCEL.md`.

## Upgrade ERP/SAP

Esta versão adiciona um fluxo mais robusto inspirado em ERP/SAP e nos padrões dos sistemas FlowERP/FlowCRM:

- Cockpit Operacional como tela inicial;
- Central de Aprovações;
- Solicitações de Material;
- Caixa do Técnico mobile;
- Histórico de Movimentações;
- expedição automática com geração de guia;
- notificações inteligentes para aprovações paradas, separações pendentes e guias sem assinatura.

Leia também: `docs/UPGRADE-ERP-SAP.md`.

## Atualização — Central da Caixa e Entrada Fiscal

Esta versão inclui a página **Operação → Central da caixa**, permitindo que admin/supervisor façam baixa de OS, movimentação da caixa do técnico para cliente e devolução ao estoque. A entrada de estoque também passou a exigir documento comprobatório/anexo, como nota fiscal, romaneio, recibo ou termo de entrega.

Consulte `docs/UPGRADE-CAIXA-TECNICO-ENTRADA-FISCAL.md`.
