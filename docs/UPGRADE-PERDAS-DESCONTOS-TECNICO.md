# Upgrade — Perdas e descontos do técnico

## Objetivo
Adicionar uma página administrativa para registrar perda de material sob responsabilidade do técnico, gerar guia de reconhecimento/desconto, anexar documento assinado e baixar automaticamente o item da caixa técnica.

## Funcionalidades adicionadas

- Nova página **Perdas/descontos** no menu Operação.
- Registro de perda por técnico.
- Seleção de material disponível na caixa do técnico.
- Seleção de serial quando o material for serializado.
- Baixa automática da caixa do técnico no momento do registro da perda.
- Registro no histórico de movimentações com tipo `perda`.
- Registro na auditoria com ação `technician_loss`.
- Geração de guia imprimível para assinatura/reconhecimento do técnico.
- Campo para anexar documento assinado na abertura ou depois do registro.
- Valores da perda passam a alimentar os BIs por meio dos movimentos de perda e status patrimonial `perdido`.

## Observação técnica

Não foi criada tabela nova. A guia de perda/desconto usa a estrutura existente de `transfers` e `transfer_items`, com número iniciado por `PERDA-`. O patrimônio serializado é marcado como `perdido` e removido da caixa do técnico.

## Deploy

Como há alterações no frontend e backend, subir no Render e na Vercel.
