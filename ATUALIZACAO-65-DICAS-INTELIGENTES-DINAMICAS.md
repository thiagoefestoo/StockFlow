# Atualização 65 — dicas inteligentes e dinâmicas

## Objetivo

Transformar a faixa global de dicas em um assistente operacional dinâmico, baseado nos acontecimentos reais visíveis para cada usuário.

## Funcionamento

Cada dica permanece na tela por 30 segundos. Em seguida, o sistema avança automaticamente para a próxima recomendação.

A faixa possui:

- título e mensagem em destaque;
- identificação do tipo da dica;
- contador de posição, como `2 de 9`;
- barra de progresso de 30 segundos;
- botão **Próxima**;
- botão de acesso direto à página relacionada;
- animação suave na troca;
- cores diferentes para informação, sucesso, atenção e urgência;
- layout adaptado para computador e celular.

Quando o usuário muda manualmente a dica, a contagem de 30 segundos é reiniciada.

## Prioridade das mensagens

As mensagens são organizadas nesta ordem:

1. pendências reais da operação;
2. notificações não lidas;
3. confirmação de operação sem pendências críticas;
4. dica contextual da página aberta;
5. boas práticas relacionadas às permissões do usuário.

Exemplos de eventos reais:

- aprovações aguardando decisão;
- solicitações aguardando acompanhamento ou entrega;
- transferências sem assinatura;
- perdas aguardando tratamento;
- OS abertas ou pendentes;
- tarefas da caixa do técnico;
- documentação de técnicos a revisar.

## Personalização

As dicas respeitam:

- perfil do usuário;
- módulos liberados para a conta;
- rotas que o usuário pode acessar;
- notificações destinadas ao usuário ou ao perfil;
- tarefas pendentes já filtradas pelo backend;
- página atualmente aberta.

Administradores e responsáveis operacionais recebem orientações sobre aprovações, transferências, caixas, auditoria e BIs.

Técnicos recebem orientações sobre sua caixa, solicitações, OS e conferência de seriais.

## Desempenho

A implementação não adiciona um novo endpoint.

A faixa reutiliza exatamente os mesmos endpoints usados pelo sino:

- `/notifications`;
- `/operations/pending-menu`.

O cliente já possui cache e deduplicação de requisições GET. Dessa forma, quando o sino e a faixa carregam juntos, a mesma resposta é compartilhada.

A consulta antiga separada ao cockpit foi removida da faixa, reduzindo o trabalho do backend.

Os dados são atualizados:

- ao abrir o sistema;
- ao retornar para a aba;
- ao focar novamente a janela;
- a cada dois minutos enquanto a aba estiver visível.

## Banco de dados

- nenhuma migration;
- nenhuma coluna adicionada;
- nenhum saldo alterado;
- nenhuma OS alterada;
- nenhuma transferência alterada;
- nenhuma notificação criada automaticamente pela faixa.

A atualização modifica somente a apresentação e o uso de dados já existentes.
