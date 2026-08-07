# StockFlow — Atualização 86

Base utilizada: versão 85 de produção enviada em 07/08/2026.

## Escopo

1. Bloqueio de nova transferência direta estoque → técnico quando o técnico possui solicitação de reposição aprovada aguardando preparação/entrega.
2. Baixa múltipla de ferramentas da ficha do técnico, com seleção de vários tipos/quantidades e geração de uma única guia.
3. Data e hora na fila de solicitações aprovadas aguardando preparação.
4. Cockpit atualizado para StockFlow • Versão 86.

## Regra da pendência de preparação

A trava usa exatamente a fila já existente: `requestType = reposicao_carga` e `status = aprovado`.

- Transferência direta estoque → técnico: bloqueada enquanto existir pendência aprovada para o técnico.
- Preparar/entregar a própria solicitação aprovada: permitido.
- Transferência técnico → cliente / baixa por OS: não alterada.
- Transferência de ferramentas entre técnicos: não alterada.
- Retornos existentes: não alterados.

A proteção existe no frontend e também no backend. O backend retorna HTTP 409 com código `PENDING_MATERIAL_REQUEST_DELIVERY` caso uma tentativa direta seja feita fora da tela.

## Baixa múltipla de ferramentas

Foi adicionada a opção **Baixar várias ferramentas** na ficha do técnico.

- Permite marcar vários tipos de ferramenta.
- Para ferramentas controladas por quantidade, permite informar a quantidade de cada tipo.
- Uma confirmação executa toda a baixa dentro de uma única transação de banco.
- É criada uma única guia `BAIXA-FERRAMENTA-*`.
- Em devoluções, as ferramentas controladas por estoque retornam ao respectivo estoque de origem.
- Perda/extravio e desgaste/quebra baixam a custódia sem devolver saldo.
- Substituição continua individualmente no fluxo existente para preservar a lógica atual de substituição.
- A baixa individual existente foi mantida intacta como fallback/compatibilidade.

## Data/hora da preparação

Na tabela **Solicitações aprovadas aguardando transferência** foi adicionada a coluna **Data/hora**, exibindo a criação da solicitação e, quando disponível, a data/hora de aprovação.

## Banco e compatibilidade

- Nenhuma migration adicionada.
- Nenhum model alterado.
- Nenhuma coluna/tabela alterada.
- A nova guia usa o campo `transferType`, que já é texto e aceita o novo valor `baixa_ferramenta` sem alteração estrutural.
- O fluxo de OS não foi alterado.
