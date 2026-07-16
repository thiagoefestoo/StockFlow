# Upgrade StockFlow vivo + auditoria corporativa

Esta versão renomeia o sistema para **StockFlow** e amplia a operação para ficar mais parecida com um ERP corporativo.

## Principais melhorias

- Menu lateral em grupos expansíveis: Comando, Operação, Cadastros/Estoque e BI/Auditoria.
- Janela de transferência mais completa, com seriais disponíveis no estoque para seleção.
- Envio da carga diretamente para a caixa do técnico.
- Visão viva no topo do sistema, com alertas, pendências e dicas operacionais atualizadas periodicamente.
- Central do técnico: clique em um técnico para ver materiais, equipamentos, valores, guias, OS e histórico em tempo real.
- Histórico de movimentações mais completo, com filtros, detalhes, operador, referência e exportação CSV/Excel.
- Página de auditoria corporativa com filtros, comparativo antes/depois e exportação CSV/Excel.
- BIs com paleta mais variada para diferenciar indicadores.
- Visual modernizado com emojis, cards, chips, destaque de status e aparência mais viva.

## Observações técnicas

Não foram criadas novas tabelas nesta atualização. A alteração reutiliza as tabelas existentes e amplia consultas, telas e visualização.

Após substituir os arquivos, rode:

```powershell
npm install --prefix backend
npm install --prefix frontend
npm run check --prefix backend
npm run build --prefix frontend
```

Para uso local:

```powershell
npm start --prefix backend
npm start --prefix frontend
```
