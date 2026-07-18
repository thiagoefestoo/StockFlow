# Ajuste - Caixa do técnico no celular e sino de notificações

## O que foi alterado

### 1. Caixa do técnico no celular
- A tela `/caixa-tecnico` foi reorganizada para uso no smartphone.
- Foram criados atalhos fixos no topo da tela:
  - Resumo
  - Baixar OS
  - Minha carga
  - Solicitações
- No celular, apenas a seção escolhida aparece, evitando excesso de informação na tela.
- A área de resumo mostra notificações rápidas de solicitações em andamento, aprovadas e entregues.
- A carga do técnico agora aparece em cards compactos no celular.
- A tabela completa continua disponível no desktop.
- O formulário de OS permanece recolhível no celular.
- A tela de baixa de OS continua exigindo nome, CPF, número da OS e exatamente 1 serial por OS.

### 2. Sino de notificações
- O sino foi refeito para abrir em uma camada fixa acima de todo o sistema.
- Corrigido problema visual em que a janela podia não aparecer.
- O sino agora carrega notificações reais e também tarefas pendentes do menu.
- O número do sino soma notificações não lidas e operações pendentes.
- Ao clicar em uma tarefa pendente, o sistema direciona para a tela correspondente.
- Atualização automática a cada 45 segundos e também quando a janela volta ao foco.

## Arquivos alterados

- `frontend/src/components/NotificationBell.jsx`
- `frontend/src/pages/TechnicianInbox.jsx`
- `frontend/src/styles.css`
