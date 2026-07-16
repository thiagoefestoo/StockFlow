# StockFlow — Central da Caixa do Técnico e Entrada Fiscal Completa

Esta atualização deixa o StockFlow mais robusto para operação real de estoque telecom.

## Central administrativa da caixa do técnico

Nova página:

- **Operação → Central da caixa**
- Rota: `/central-caixa-tecnico`
- Perfis: `admin` e `supervisor`

A página permite que o gestor opere a caixa do técnico quando o técnico não conseguir fazer pelo celular.

Funcionalidades:

- escolher um técnico;
- visualizar em tempo real tudo que está em nome dele;
- ver equipamentos serializados, MAC, marca, modelo, valor e dias em custódia;
- ver consumíveis como drop, conector, esticador e outros materiais;
- baixar material para cliente com ou sem OS;
- criar OS concluída automaticamente quando o número da OS é informado;
- devolver materiais da caixa do técnico para o estoque;
- consultar histórico completo da caixa;
- gravar auditoria para cada movimentação.

## Novas APIs

- `GET /api/stock/technician-box/:id`
- `POST /api/stock/technician-box/move-to-client`
- `POST /api/stock/technician-box/return-to-stock`

## Entrada de estoque com comprovante obrigatório

A página **Entrada quinzenal** agora exige documento comprobatório.

Novos campos:

- tipo de documento: nota fiscal, termo, romaneio, recibo ou outro;
- número do documento;
- data do documento;
- emitente;
- chave de acesso NF-e;
- responsável pelo recebimento/conferência;
- status de conferência;
- local padrão de armazenagem;
- anexo obrigatório do comprovante;
- lote do fabricante por item;
- pedido/OC por item;
- condição do item;
- local específico do item;
- observações do item.

## Novas colunas no banco

Foram adicionados campos em:

- `stock_batches`
- `stock_batch_items`

No primeiro start depois desta versão, use:

```env
DB_SYNC=true
```

Depois que as colunas forem criadas e o sistema abrir corretamente, pode voltar para:

```env
DB_SYNC=false
```

## Validação

- Backend: `npm run check` concluído com sucesso.
- Frontend: `npm run build` concluído com sucesso.
