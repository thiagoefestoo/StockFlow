# Atualização 51 — Dashboard, busca de serial e paginação

## Correções e melhorias

- Corrigida a coluna **Instalado** do dashboard legado:
  - equipamentos serializados consideram os ativos atualmente vinculados a clientes;
  - materiais não serializados consideram as quantidades efetivamente baixadas por ordem de serviço.
- Adicionada busca por **serial, patrimônio ou MAC** na seleção de equipamentos durante a baixa de OS, tanto no portal quanto na caixa móvel do técnico.
- Implementada paginação real no servidor, com 15 registros por página, nas listas operacionais de maior crescimento:
  - ordens de serviço;
  - movimentações/histórico;
  - auditoria;
  - aprovações;
  - solicitações de material;
  - entradas em estoque;
  - transferências;
  - consulta patrimonial.
- A próxima página é consultada apenas quando o usuário a solicita, reduzindo o volume transferido pelo banco e o tempo de carregamento.
- Consultas antigas sem parâmetros de paginação continuam compatíveis, preservando seletores e fluxos existentes.

## Validação

- Sintaxe validada em 93 arquivos JavaScript do backend.
- Frontend compilado em modo de produção.
- Arquivos frontend alterados verificados pelo ESLint sem erros ou avisos.
- Nenhuma migração de banco ou comando SQL é necessário.
