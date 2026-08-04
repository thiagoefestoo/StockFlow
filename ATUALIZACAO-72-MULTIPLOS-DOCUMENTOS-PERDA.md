# Atualização 72 — múltiplos documentos por perda/desconto

## Objetivo

Permitir que uma mesma ocorrência de **Perda/desconto do técnico** possua vários documentos anexados.

A alteração funciona tanto:

- na abertura de uma nova perda;
- quanto em uma perda já registrada, inclusive depois do primeiro documento.

## Funcionamento na abertura

No formulário **Registrar perda/desconto**, o campo passa a aceitar vários arquivos de uma vez.

Formatos permitidos:

- PDF;
- JPG/JPEG;
- PNG;
- WEBP;
- demais formatos de imagem aceitos pelo navegador.

O usuário poderá revisar os documentos selecionados e remover um arquivo antes de confirmar a perda.

## Funcionamento depois do registro

Na tabela de perdas, o seletor de arquivos permanece disponível mesmo quando a ocorrência já possui documento.

Isso permite:

1. selecionar uma ou mais imagens/PDFs;
2. anexar ao registro existente;
3. manter os documentos anteriores;
4. acrescentar novos documentos em outro momento.

Nenhum documento antigo é substituído quando novos arquivos são enviados.

## Limites de segurança

- até 8 arquivos por envio;
- até 12 MB por envio;
- até 30 documentos no total por perda;
- somente PDF ou imagem;
- conteúdo total armazenado limitado pelo backend.

## Visualização

Os documentos aparecem individualmente em:

- Detalhes da perda;
- Guia de perda/desconto.

Cada arquivo pode ser:

- visualizado;
- baixado;
- identificado pelo nome original.

Os dados completos dos arquivos são carregados apenas quando o usuário solicita visualização ou download, evitando carregar todos os anexos na listagem principal.

## Compatibilidade com documentos antigos

Registros antigos com apenas um documento continuam funcionando.

O backend reconhece:

- formato legado com um único data URL;
- formato novo com uma coleção de anexos.

Quando um novo documento é incluído em um registro antigo, o documento anterior é preservado e o registro é convertido automaticamente para o formato de múltiplos anexos.

## Acesso e segurança

Foram criadas rotas específicas dentro do módulo **Perdas/descontos** para:

- consultar a ocorrência;
- listar os nomes dos anexos;
- carregar um anexo individual;
- acrescentar documentos.

Assim, a função não depende da permissão geral de Transferências.

O backend valida:

- se o registro realmente é uma perda;
- se o usuário possui acesso ao módulo;
- se o usuário possui acesso à cidade/técnico da ocorrência;
- tipo e quantidade dos arquivos;
- limite total de anexos;
- limite de conteúdo.

## Auditoria

Cada envio posterior registra:

- usuário responsável;
- perda alterada;
- quantidade de documentos adicionados;
- total de documentos depois do envio;
- situação anterior e posterior.

## Banco de dados

A funcionalidade utiliza os campos já existentes no registro da guia:

- `attachmentName`;
- `attachmentData`.

O novo formato é armazenado como JSON dentro do campo de texto existente.

- nenhuma migration;
- nenhuma coluna nova;
- nenhuma tabela nova;
- nenhuma perda antiga alterada durante a instalação;
- nenhum saldo ou valor financeiro alterado;
- nenhum documento existente apagado.
