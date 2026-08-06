# Atualização 81 — usabilidade na entrada, ferramentas e materiais

## 1. Filtros na página de Entrada de Estoque

A listagem passa a aceitar filtros processados pelo backend, preservando a
paginação correta.

Filtros disponíveis:

- busca por número da entrada;
- número do documento fiscal;
- chave da NF-e;
- fornecedor/origem;
- emitente;
- nome ou e-mail do operador;
- nome, SKU ou nome comercial do material;
- estoque autorizado;
- material específico;
- origem/fornecedor;
- data inicial e final;
- status da conferência;
- tipo de documento;
- presença de comprovante.

O botão **Limpar filtros** restaura a listagem completa autorizada.

## 2. Bloqueio do scroll nos campos numéricos

Foi criado um bloqueio global para `input[type="number"]`.

Quando um campo numérico estiver focado e o usuário girar a roda do mouse:

- o valor não será aumentado;
- o valor não será reduzido;
- o campo perde o foco;
- digitação e setas do teclado continuam funcionando normalmente.

A proteção vale para quantidade, valor, estoque mínimo, peso, prazo e demais
campos numéricos do sistema.

## 3. Botão de adicionar ferramenta

Na ficha do técnico, o botão:

`＋ Adicionar mais uma ferramenta`

fica abaixo do último item da montagem e antes das observações gerais.

O usuário não precisa voltar ao topo para acrescentar outra ferramenta.

## 4. Exclusão de material

Foi adicionada a permissão:

`Excluir materiais sem saldo e sem histórico`

O administrador possui essa permissão automaticamente. Para outros perfis, ela
pode ser liberada em Administração de usuários.

### Exclusão permitida

A exclusão permanente somente é liberada quando o material não possui:

- saldo diferente de zero;
- equipamento ou serial;
- entrada de estoque;
- movimentação;
- guia ou transferência;
- ordem de serviço;
- solicitação de material;
- ferramenta vinculada a técnico;
- substituição de equipamento;
- aprovação pendente.

Linhas técnicas de saldo zero criadas na inicialização do catálogo são removidas
junto com o material.

### Exclusão bloqueada

Quando existe qualquer vínculo, o sistema mostra os bloqueadores e orienta a
editar o material e desmarcar **Material ativo**.

O histórico nunca é apagado para permitir a exclusão do cadastro.

### Confirmação

Para excluir, o usuário precisa digitar exatamente o SKU do material.

A exclusão gera registro na auditoria administrativa.

## Banco de dados

- nenhuma migration;
- nenhuma coluna nova;
- nenhuma tabela nova;
- nenhum saldo alterado pela instalação;
- nenhum material excluído automaticamente.
