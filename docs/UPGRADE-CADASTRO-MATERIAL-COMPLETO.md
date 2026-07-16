# Upgrade - Cadastro completo de material

Esta atualização deixa a janela **Novo material** mais completa e adequada para uso operacional/ERP.

## O que mudou

A página **Cadastros e estoque > Materiais/Estoque** recebeu uma janela de cadastro mais robusta, com blocos organizados:

1. Identificação do item
2. Fabricante, modelo e rastreio
3. Estoque, custo e reposição
4. Regras de movimentação
5. Fiscal, localização e ciclo de vida

## Novos dados do catálogo

Foram adicionados campos como:

- nome comercial;
- marca;
- modelo;
- fabricante;
- fornecedor padrão;
- código de barras/EAN;
- padrão do serial;
- estoque máximo;
- ponto de pedido;
- prazo de reposição;
- criticidade;
- política de movimentação;
- tipo de inspeção;
- NCM;
- código fiscal;
- código contábil;
- centro de custo;
- prefixo patrimonial;
- local de armazenagem;
- prateleira/rua;
- garantia;
- vida útil;
- peso;
- dimensões;
- regras de transferência, baixa e retorno.

## Banco de dados

Esta atualização adiciona colunas à tabela `materials`.

No primeiro start, use:

```env
DB_SYNC=true
```

Depois que o sistema abrir corretamente, pode voltar para:

```env
DB_SYNC=false
```
