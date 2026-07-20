# Upgrade - Visualização de PDFs anexados

## Objetivo
Permitir que todos os documentos PDF anexados no sistema possam ser visualizados diretamente pelo usuário, sem depender apenas do download.

## O que foi alterado

### Novo componente
- `frontend/src/components/AttachmentPreview.jsx`

Esse componente centraliza a visualização de anexos e funciona com:
- PDF em base64/data URL;
- imagens anexadas;
- outros arquivos com opção de baixar.

### Locais atualizados

#### Entrada de material
- Tela: `Entrada de material`
- Campo: comprovante/documento de recebimento
- Agora permite visualizar PDF anexado na listagem e nos detalhes da entrada.

#### Transferências
- Tela: `Transferências`
- Campo: assinatura/anexo da guia
- Agora permite visualizar PDF anexado na listagem e nos detalhes da guia.

#### Guia de transferência
- Tela de impressão da guia
- Agora o anexo assinado em PDF pode ser visualizado e baixado.

#### Perdas/descontos
- Tela: `Perdas/descontos`
- Campo: documento de reconhecimento assinado
- Agora permite visualizar PDF anexado na listagem e nos detalhes.

#### Guia de perda/desconto
- Tela de impressão da guia de perda
- Agora o documento assinado em PDF pode ser visualizado e baixado.

#### Avaliação de perdas
- Tela: `Avaliação de perdas`
- Campo: documento da perda
- Agora permite visualizar PDF anexado na listagem e nos detalhes.

## Observações técnicas
- O botão `Visualizar` abre o documento em nova aba usando Blob URL, evitando bloqueios comuns de data URL em PDF.
- O botão `Baixar` continua disponível.
- Imagens continuam exibindo prévia inline.
- PDFs também exibem prévia inline nas telas de detalhes quando suportado pelo navegador.

## Arquivos alterados
- `frontend/src/components/AttachmentPreview.jsx`
- `frontend/src/pages/Receiving.jsx`
- `frontend/src/pages/Transfers.jsx`
- `frontend/src/pages/TransferPrint.jsx`
- `frontend/src/pages/TechnicianLosses.jsx`
- `frontend/src/pages/LossPrint.jsx`
- `frontend/src/pages/LossEvaluation.jsx`
- `frontend/src/styles.css`
