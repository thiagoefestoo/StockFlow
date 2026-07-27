# Atualização 45 — Otimização de tráfego e consultas

Esta atualização reduz o volume transferido pelo banco sem alterar os fluxos operacionais.

## Principais ajustes

- O pulso global passou a consultar apenas indicadores resumidos, sem carregar todos os patrimônios, saldos e movimentações a cada atualização.
- Consultas globais do menu, notificações e permissões agora possuem cache curto e deduplicação de chamadas simultâneas.
- Atualizações automáticas ficaram menos frequentes e são pausadas quando a aba do navegador não está visível.
- Listas de entradas, transferências, perdas, documentos de ferramentas e auditoria não carregam mais arquivos em Base64 ou JSON detalhado em massa.
- Comprovantes, termos, anexos e detalhes de auditoria são carregados somente quando o usuário abre o registro.
- Auditorias futuras não gravam novamente o conteúdo Base64 de documentos, preservando apenas a indicação de que o binário foi omitido.
- A atualização automática da caixa do técnico passou de 15 para 60 segundos, mantendo atualização ao retornar à janela e após operações.

## Compatibilidade

- Nenhuma tabela ou coluna nova é criada.
- Não há alteração de saldos, seriais, documentos ou dados existentes.
- Os anexos continuam disponíveis normalmente ao abrir os detalhes.
- Backend e frontend foram validados e compilados com sucesso.
