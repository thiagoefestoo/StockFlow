# Atualização 76 V2 — várias ferramentas para o mesmo técnico

Esta versão substitui o primeiro pacote da Atualização 76.

## Correção do aplicador

O primeiro aplicador utilizava `Get-Content -Raw` no Windows PowerShell 5.1.

Nesse ambiente, arquivos JSX em UTF-8 sem BOM podem ser lidos usando a codificação
padrão do Windows. Isso fez a validação não reconhecer uma frase com acentos,
mesmo que o código correto estivesse presente.

A V2:

- lê JavaScript e JSX explicitamente em UTF-8;
- utiliza marcadores técnicos sem acentos;
- mantém backup e restauração automática;
- remove `frontend/build` dos comandos do Git, pois essa pasta é ignorada;
- continua executando a build completa antes de manter a atualização.

## Funcionalidade

Em `Técnicos → Detalhes → Adicionar ferramentas`, o usuário pode:

- adicionar várias linhas;
- selecionar uma ferramenta diferente em cada linha;
- informar uma quantidade por ferramenta;
- remover linhas;
- revisar toda a carga;
- confirmar tudo em uma única guia para o mesmo técnico.

O sistema bloqueia ferramenta repetida, quantidade inválida e saldo insuficiente.

## Backend e banco

O backend existente já aceita o array `items`.

- nenhuma alteração de backend;
- nenhuma migration;
- nenhum saldo alterado durante a instalação.
