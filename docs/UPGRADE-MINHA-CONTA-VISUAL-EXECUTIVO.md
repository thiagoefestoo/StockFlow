# Upgrade StockFlow — Minha Conta e visual executivo

Esta versão adiciona uma área própria para o usuário logado e aplica uma última camada visual mais executiva ao sistema, preservando a identidade original do StockFlow.

## Nova área: Minha conta

Rota adicionada:

```text
/minha-conta
```

A página permite ao usuário logado:

- atualizar nome;
- atualizar e-mail;
- atualizar telefone;
- informar cargo/função;
- registrar observações da conta;
- alterar a própria senha;
- consultar perfil de acesso;
- consultar status da conta;
- consultar último login;
- consultar data da última troca de senha;
- consultar técnico vinculado, quando existir.

A página é exibida para todos os perfis: admin, supervisor e técnico.

## Técnico no celular

O técnico continua vendo apenas as áreas necessárias para sua operação:

- Minha caixa;
- Minha conta.

Assim ele consegue operar a baixa de materiais e alterar os próprios dados/senha sem acesso a módulos administrativos.

## Backend

Novos endpoints adicionados:

```text
PUT /api/auth/me
PATCH /api/auth/me/password
```

Os endpoints exigem autenticação e registram auditoria.

## Visual executivo

Foram melhorados:

- painéis gerais;
- KPIs;
- hero panels;
- tabelas;
- cards;
- área de usuário;
- topo do sistema;
- botões e cartões executivos.

A intenção foi aproximar o visual dos painéis do BI Financeiro, mantendo a identidade original do StockFlow.
