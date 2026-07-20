# Ajuste: visualização de PDF sem pop-up

Este ajuste remove a abertura de documentos via `window.open`, que poderia ser bloqueada pelo navegador.

## Alteração

- O botão **Visualizar** agora abre o PDF/imagem em uma janela modal dentro do próprio sistema.
- A mensagem "O navegador bloqueou a visualização" não deve mais aparecer.
- A opção **Baixar** foi mantida.
- Funciona também em celular, sem depender de liberação de pop-ups.

## Arquivos alterados

- `frontend/src/components/AttachmentPreview.jsx`
- `frontend/src/styles.css`
