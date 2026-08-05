# Atualização 75 — alarmes por cidade e novas dicas de inventário

## Objetivos

1. Impedir que usuários de uma cidade recebam alarmes e pendências operacionais de outra cidade.
2. Ampliar as dicas dinâmicas sobre inventário, conferência de estoque, entradas, seriais, transferências e caixas dos técnicos.

## Alarmes e pendências

O sistema passa a resolver o escopo operacional da conta usando:

- estoques autorizados;
- cidades autorizadas;
- técnicos vinculados aos estoques autorizados;
- técnico associado à própria conta, quando aplicável.

Os seguintes indicadores passam a respeitar esse escopo:

- documentação pendente de técnicos;
- solicitações aguardando aprovação;
- solicitações aprovadas aguardando entrega;
- guias de transferência sem assinatura;
- perdas/descontos pendentes;
- avaliações de perda;
- ordens de serviço abertas ou pendentes;
- notificações exibidas no sino;
- notificações utilizadas nas dicas dinâmicas;
- indicadores do Cockpit.

### Exemplo

Uma conta com acesso somente a São Pedro da Aldeia:

- vê pendências de técnicos dessa cidade;
- vê guias, solicitações, OS e documentos relacionados aos seus estoques;
- não vê alarmes de Vila Velha.

A mesma regra é aplicada no sentido contrário.

## Proteção da leitura de notificações

O endpoint que marca uma notificação como lida também valida o escopo.

Um usuário não consegue marcar como lido um alerta pertencente a outra cidade informando manualmente o ID da notificação.

## Compatibilidade com notificações antigas

Notificações antigas podem possuir apenas referências como:

- requestId;
- transferId;
- assetId;
- serviceOrderId.

O sistema consulta o registro relacionado e identifica automaticamente o estoque e o técnico correspondentes antes de decidir se o aviso pode ser exibido.

As novas notificações inteligentes também passam a gravar diretamente:

- warehouseId;
- technicianId;
- referência operacional.

## Administrador

O administrador mantém visão global, conforme a regra atual do sistema.

Supervisores, estoquistas e técnicos permanecem limitados aos estoques, cidades e técnicos autorizados.

## Novas dicas dinâmicas

Foram incluídas orientações sobre:

- inventário rotativo semanal;
- inventário completo periódico;
- dupla conferência das entradas;
- preenchimento de documento, fornecedor, quantidade e custo;
- conferência de serial, MAC, modelo e etiqueta;
- contagem física durante a entrega ao técnico;
- separação e conferência da carga em duas etapas;
- conciliação da caixa física com a caixa do sistema;
- revisão diária da caixa pelo técnico;
- inspeção dos itens devolvidos;
- investigação de saldo zero inesperado;
- uso do histórico antes de realizar ajuste;
- anexação imediata de termos e comprovantes;
- conferência de avarias no retorno;
- rastreamento da sequência entrada, transferência, OS, retorno e perda.

Também foram adicionadas dicas específicas conforme a página atual:

- Entrada em Estoque;
- Central da Caixa do Técnico;
- Retorno Técnico;
- Patrimônio;
- Histórico de Movimentações.

A rotação passa a suportar até 28 recomendações relevantes, respeitando os módulos liberados para a conta.

## Banco de dados

- nenhuma migration;
- nenhuma coluna adicionada;
- nenhuma tabela criada;
- nenhum saldo alterado;
- nenhuma notificação antiga apagada;
- nenhum usuário modificado.

A alteração atua somente nas consultas, na validação de visibilidade e na apresentação das dicas.
