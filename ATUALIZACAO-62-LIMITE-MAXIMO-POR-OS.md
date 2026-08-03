# Atualização 62 — limite máximo de material por ordem de serviço

## Objetivo

Adicionar uma trava configurável de quantidade máxima por ordem de serviço para materiais consumíveis, usando o mesmo princípio de defesa em duas camadas já aplicado aos equipamentos serializados:

1. prevenção na tela;
2. validação obrigatória no backend antes de criar a OS e movimentar o saldo.

A configuração inicial desta atualização protege o material:

- SKU: `ATFX200571`;
- descrição: `CONECTOR MECANICO SC APC VERDE DTC042`;
- limite: `2` unidades por OS;
- aplicação: todos os tipos de serviço.

## Regra operacional

Para o conector verde:

- quantidade 1: permitida;
- quantidade 2: permitida;
- quantidade acima de 2: bloqueada;
- todos os tipos de serviço usam a mesma regra;
- a OS não é criada quando a validação falha;
- o saldo do técnico não é alterado;
- nenhuma movimentação parcial é criada.

Os equipamentos serializados continuam com a regra própria de seleção de serial. A nova quantidade máxima não substitui nem altera a regra das ONUs.

## Banco de dados

A atualização adiciona uma coluna opcional à tabela `materials`:

```text
maxQuantityPerServiceOrder DECIMAL(12,3) NULL
```

Características:

- alteração aditiva;
- nenhuma tabela é recriada;
- nenhum saldo é recalculado;
- nenhuma OS antiga é modificada;
- nenhum movimento antigo é alterado;
- materiais sem limite continuam funcionando como antes.

Durante a inicialização do backend, o serviço de estrutura garante o valor `2` para o SKU `ATFX200571` quando o campo estiver nulo.

## Proteção do backend

A API valida a quantidade antes de abrir a transação da OS e valida novamente dentro da transação. Mesmo que o navegador seja alterado ou a API seja chamada diretamente, uma quantidade acima do limite é rejeitada.

A tentativa bloqueada é gravada na auditoria com:

- material;
- SKU;
- quantidade solicitada;
- limite permitido;
- técnico;
- tipo de serviço;
- contrato informado.

## Proteção do frontend

A trava foi aplicada nas duas telas que registram baixa de OS:

- Caixa do Técnico;
- Portal do Técnico.

O campo de quantidade recebe o menor valor entre:

- saldo disponível na caixa;
- limite máximo configurado para o material.

A tela informa `Limite por OS: 2` para o conector verde.

## Cadastro do material

Na página Materiais / Estoque foi adicionado o campo `Limite máximo por OS`.

- vazio: sem limite para materiais comuns;
- valor maior que zero: limite aplicado em qualquer tipo de OS;
- material serializado: continua usando a regra por serial;
- o SKU protegido `ATFX200571` mantém o limite de segurança 2 quando o campo estiver nulo.

## Ordem de implantação

1. aplicar e validar a atualização localmente;
2. enviar o código ao GitHub;
3. criar um snapshot/backup do banco no provedor;
4. redeploy do backend no Render;
5. verificar o material pela API;
6. redeploy do frontend na Vercel;
7. sair e entrar novamente no sistema;
8. testar uma tentativa com quantidade 3, que deve ser bloqueada sem criar OS.

## Rollback

A coluna adicionada é opcional e pode permanecer no banco mesmo que o código seja revertido. Não é recomendado remover a coluna durante um incidente, pois ela não interfere na versão anterior do sistema.
