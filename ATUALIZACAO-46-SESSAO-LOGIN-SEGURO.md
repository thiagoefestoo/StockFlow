# Atualizacao 46 - Sessao de login segura

- Credenciais de sessao deixaram de ser persistidas permanentemente no navegador.
- Fechar a aba, janela ou aplicativo encerra a sessao na abertura seguinte.
- Minimizar, alternar para outro aplicativo e atualizar a pagina nao encerram a sessao.
- Protecao adicional encerra a sessao apos 8 horas sem atividade, configuravel por `REACT_APP_SESSION_IDLE_MINUTES`.
- Tokens vencidos e respostas 401 encerram imediatamente a sessao e exibem aviso no login.
- A abertura do termo de ferramentas em nova aba continua funcionando por meio de uma autorizacao temporaria de 15 segundos, consumida uma unica vez.
- Sessoes antigas gravadas em `localStorage` sao removidas na primeira abertura da nova versao.
