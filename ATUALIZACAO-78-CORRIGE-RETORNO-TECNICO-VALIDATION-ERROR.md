# Atualização 78 — correção do retorno do técnico para o estoque

## Erro

Ao confirmar um retorno, a tela podia apresentar:

`Validation error`

## Causa

O campo visível **Referência** era salvo como `transferNumber`.

A coluna `transferNumber` é única no banco. Referências comuns selecionadas na tela,
como “Devolução de material”, “Conferência de caixa” ou “Ajuste de inventário”,
podem ser usadas em vários retornos. Na segunda utilização, o banco rejeitava a
nova guia.

## Correção

O fluxo passa a separar:

- **referência descritiva:** pode se repetir;
- **número da guia:** gerado automaticamente e sempre único.

Exemplo:

- Referência: `Devolução de material`;
- Guia: `RETORNO-20260805-201542-123-A1B2C3D4`.

O número inclui data, horário, milissegundos e oito caracteres aleatórios.

## Histórico

A referência escolhida continua sendo preservada:

- nas observações da guia;
- nas movimentações;
- na auditoria;
- no retorno da API.

## Segurança

A operação continua transacional. Em caso de erro:

- nenhum serial muda de proprietário;
- nenhum saldo é movimentado;
- nenhuma guia parcial permanece;
- nenhuma movimentação parcial é salva.

## Banco de dados

- nenhuma migration;
- nenhuma coluna nova;
- nenhuma guia antiga alterada;
- nenhum saldo alterado durante a instalação.
