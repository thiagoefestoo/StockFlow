# Atualização — Multiestoque, aprovações e rastreabilidade de seriais

Esta atualização adiciona ao StockFlow recursos corporativos para controle por região, aprovação por valor e rastreabilidade completa do patrimônio.

## Principais mudanças

- Central de aprovações agora exibe os itens solicitados em formato legível, com material, categoria, quantidade, valor e seriais.
- Gatilho de aprovação por valor: abaixo do limite, supervisor/estoquista pode aprovar; acima do limite, somente admin.
- Variável nova: `APPROVAL_ADMIN_MIN_AMOUNT`. Exemplo: `500`.
- Cadastro de múltiplos estoques por cidade/região em **Operação → Estoques regionais**.
- Usuários estoquistas podem receber permissões por estoque e por cidade.
- Técnicos podem ter cidades de atuação e estoque padrão.
- Entrada quinzenal permite selecionar estoque/região e gerar seriais em lote.
- Central da caixa mantém devolução de material do técnico para estoque.
- Técnico pode criar OS e baixar materiais da própria caixa.
- Nova página **Vida do serial**, com linha do tempo completa do equipamento.
- Minha caixa passa a exibir materiais agrupados por tipo: ONU/equipamentos, Cabo/drop, Conectores/fixação e outros.
- Guia de transferência ganhou carimbo de conferência para impressão e assinatura.

## Banco de dados

Foram adicionadas tabelas/colunas novas. No primeiro deploy, use:

```env
DB_SYNC=true
APPROVAL_ADMIN_MIN_AMOUNT=500
```

Depois que as tabelas forem criadas, retorne:

```env
DB_SYNC=false
```
