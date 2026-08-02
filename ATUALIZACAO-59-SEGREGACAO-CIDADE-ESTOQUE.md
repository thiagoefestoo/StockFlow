# Atualização 59 — Segregação completa por cidade, estoque e técnico

## Base utilizada

Esta atualização foi aplicada sobre o pacote `estoque-superinfra(69).zip`, preservando a estrutura, o banco de dados, as variáveis de ambiente e os fluxos já existentes.

## Regras implementadas

### Solicitação de material

- O estoque da solicitação é definido pelo `defaultWarehouseId` do técnico selecionado.
- A lista de materiais carrega somente itens:
  - ativos;
  - liberados para transferência ao técnico;
  - com saldo maior que zero no estoque da cidade do técnico.
- O navegador não pode escolher outro estoque para contornar a regra.
- O backend recalcula o saldo antes de gravar a solicitação.
- Quantidade acima do saldo da cidade é bloqueada, mesmo que outra cidade possua saldo.
- Técnico sem estoque padrão não consegue receber solicitação até que o vínculo seja corrigido.

### Técnicos e caixas

- Central da Caixa, Caixa do Técnico, transferências, ferramentas e consultas de técnicos respeitam os estoques/cidades vinculados à conta autenticada.
- Uma conta com acesso somente a Vila Velha não recebe técnicos de São Pedro da Aldeia.
- Uma conta com acesso somente a São Pedro da Aldeia não recebe técnicos de Vila Velha.
- O estoque padrão do técnico é a referência principal para definir sua cidade operacional.
- Cadastros antigos sem estoque padrão possuem compatibilidade temporária por `serviceCities`, mas solicitações exigem estoque padrão.

### Materiais / Estoque

- O saldo é calculado por estoque e cidade.
- Materiais sem serial usam `StockBalance` do estoque correto.
- Equipamentos serializados usam somente ativos com:
  - `ownerType = estoque`;
  - `status = em_estoque`;
  - `warehouseId` correspondente ao estoque filtrado.
- Equipamentos que estão com técnico, cliente, perdidos ou em outro estoque não entram no saldo disponível daquela cidade.
- A página exibe detalhamento por estoque e os totais respeitam os filtros selecionados.

### Filtros adicionados em Materiais / Estoque

- Pesquisa por SKU, nome ou categoria.
- Cidade.
- Estoque.
- Categoria.
- Situação do saldo:
  - com saldo;
  - sem saldo;
  - abaixo do mínimo.

### Proteção no backend

A separação não depende somente da interface. Os controllers de materiais, solicitações, técnicos, ferramentas, estoque, movimentações, transferências, ordens de serviço, aprovações, armazéns e BI validam o escopo autorizado da conta.

A resolução de cidades aceita diferenças de maiúsculas e acentuação, por exemplo `Sao Pedro da Aldeia` e `São Pedro da Aldeia`.

## Administração das contas

Para a separação funcionar corretamente:

1. Cada usuário não administrador deve possuir ao menos uma cidade ou estoque autorizado.
2. Cada técnico deve possuir um estoque padrão operacional ativo.
3. O estoque padrão deve pertencer à cidade real do técnico.
4. O administrador continua com acesso global.
5. Contas sem cidade e sem estoque autorizado não recebem dados regionais.

## Banco de dados

- Nenhuma migration foi adicionada.
- Nenhuma tabela foi apagada ou recriada.
- Nenhum saldo existente foi alterado automaticamente.
- A atualização muda regras de consulta, validação e apresentação.

## Ordem segura de publicação

1. Aplicar e validar a atualização localmente.
2. Fazer commit e push.
3. Redeploy do backend no Render.
4. Confirmar `/api/health` e realizar login de teste.
5. Redeploy do frontend na Vercel.
6. Sair e entrar novamente nas contas usadas no teste.
7. Validar uma conta de Vila Velha e outra de São Pedro da Aldeia.

Não publique a Vercel antes do backend, pois a nova interface depende dos filtros e respostas regionais da nova API.
