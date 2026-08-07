# Atualização 88 — Cancelamento na fila, filtros de técnicos e destaque de pendências

Base utilizada: **StockFlow • Versão 87**, recebida como versão em produção em 07/08/2026.

## Escopo

Esta atualização é exclusivamente de frontend e reaproveita o endpoint de cancelamento auditável criado na Atualização 87. Não há migration, alteração de model, mudança de saldo ou nova regra de movimentação.

### 1. Cancelar solicitação na fila “Preparar transferência”

Na página **Transferir material para técnico**, cada solicitação aprovada aguardando preparação passa a exibir:

- `Preparar transferência`;
- `Cancelar solicitação`.

O cancelamento usa a mesma rota `/material-requests/:id/cancel`, os mesmos motivos e as mesmas proteções da Atualização 87. Portanto, o cancelamento continua registrando responsável, data/hora, motivo, observação, histórico e auditoria.

Ao concluir o cancelamento, a fila é recarregada e a solicitação deixa de aparecer entre as preparações pendentes.

### 2. Filtros na página Técnicos

Foram adicionados filtros locais, sem novas consultas ao banco:

- pesquisa por nome, e-mail, documento, empresa, cidade ou estoque;
- cidade;
- estoque padrão;
- empresa;
- status;
- pendência de termo de ferramentas;
- botão `Limpar filtros`.

Os filtros atuam somente sobre a lista já carregada pela página, portanto não acrescentam tráfego ao Neon.

### 3. Destaque visual das pendências

#### Técnicos

A mesma regra usada pela barra lateral para pendência de documentação de ferramentas é refletida visualmente na lista: técnico ativo, com ferramenta em custódia e sem termo assinado. Essas linhas ficam em vermelho-claro e a coluna **Termos** recebe o marcador **Pendente**.

#### Transferências

Guias com status `pendente_assinatura`, que alimentam o contador vermelho de **Transferências** na barra lateral, também recebem fundo vermelho-claro e faixa vermelha discreta na primeira coluna.

## Versão

Cockpit atualizado para **StockFlow • Versão 88**.

## Segurança

- Backend não alterado.
- Banco/Neon não alterado.
- Nenhuma migration.
- Nenhum model.
- Nenhuma alteração em saldo ou movimentação.
- Fluxo de preparação e entrega existente preservado.
- Cancelamento reutiliza a implementação já auditável da Versão 87.
