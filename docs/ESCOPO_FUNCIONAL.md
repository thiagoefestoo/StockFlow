# Escopo funcional do StockFlow

## Estoque e patrimônio

- Entrada de material por guia/nota.
- Ciclo quinzenal, mensal ou extra.
- Controle de material serializado e não serializado.
- ONUs por número de série e MAC.
- Valor patrimonial por item.
- Estoque mínimo e alerta automático.
- Custódia por técnico.
- Rastreamento até OS e cliente final.

## Guia de entrega

Ao entregar material ao técnico, o sistema gera uma guia com:

- número da transferência;
- data e hora;
- técnico;
- CPF/documento do técnico;
- lista de materiais;
- número de série de cada equipamento;
- valor patrimonial;
- campos de assinatura do técnico e do responsável pelo estoque.

A guia pode ser impressa e depois anexada como PDF ou imagem.

## Portal técnico

O perfil técnico acessa uma tela simplificada e responsiva para celular:

- vê sua carga atual;
- informa número da OS;
- informa CPF e nome do cliente;
- seleciona material utilizado;
- informa serial da ONU instalada;
- baixa materiais de consumo.

## Sistema vivo

A inteligência automática gera alertas sobre:

- estoque baixo;
- guias pendentes de assinatura;
- equipamentos parados há mais de 30 ou 60 dias com técnico;
- patrimônio alto em campo;
- lembretes de baixa diária por OS.

## BI gerencial

O sistema inclui três páginas:

1. BI Executivo — visão de estoque, patrimônio, OS, guias e risco.
2. BI por Técnico — ranking, carga, OS, valor e equipamentos antigos.
3. BI Auditoria — movimentações, eventos, guias e custódias críticas.
