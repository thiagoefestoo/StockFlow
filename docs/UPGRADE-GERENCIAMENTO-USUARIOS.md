# StockFlow - Gerenciamento de Usuários e Permissões

Esta atualização adiciona uma área administrativa completa para gestão de contas do sistema.

## Nova página

**Administração → Usuários e permissões**

A página é exibida somente para usuários com perfil `admin`.

## Recursos

- criar usuários administradores, supervisores e técnicos;
- vincular conta de técnico ao cadastro do técnico;
- editar nome, e-mail, telefone, cargo, perfil, status e observações;
- redefinir senha pelo administrador;
- gerar senha temporária;
- marcar troca obrigatória de senha;
- bloquear e desbloquear usuário;
- ativar/inativar usuário;
- excluir usuário logicamente;
- restaurar usuário excluído;
- consultar detalhes e histórico de auditoria do usuário;
- exportar lista de usuários para CSV.

## Comportamento de técnico

Quando uma conta com perfil `tecnico` entra pelo celular, o sistema direciona o usuário para a própria caixa de materiais. O menu lateral do técnico exibe somente **Minha caixa**.

## Banco de dados

Foram adicionadas novas colunas na tabela `users`:

- `technicianId`
- `phone`
- `jobTitle`
- `notes`
- `mustChangePassword`
- `passwordChangedAt`
- `blockedAt`
- `blockedReason`
- `deletedAt`
- `deletedReason`

No primeiro start após atualizar, deixe no backend `.env`:

```env
DB_SYNC=true
```

Depois que o sistema abrir corretamente e criar as colunas, pode voltar para:

```env
DB_SYNC=false
```
