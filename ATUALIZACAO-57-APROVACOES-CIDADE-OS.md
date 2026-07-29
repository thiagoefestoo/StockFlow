# Atualização 57 — Aprovações e cidade vinculada nas ordens de serviço

## Correção da Central de Aprovações

- Corrigida a falha `paginationFromQuery is not defined`.
- Adicionadas as importações de paginação e resposta paginada exigidas pelo controller.
- A paginação continua limitada a 15 registros por página.

## Cidade vinculada na baixa de OS

- A cidade deixou de ser um campo livre.
- O backend determina a cidade pelo estoque regional padrão vinculado ao técnico.
- A OS também passa a salvar o `warehouseId` do estoque regional correspondente.
- Estoque inativo, inexistente, sem cidade ou de logística reversa bloqueia a baixa com mensagem clara.
- O backend ignora qualquer cidade digitada manualmente pelo navegador ou por chamada externa.

## Telas atualizadas

- Portal do técnico.
- Caixa do técnico.
- Central da caixa.
- Tela de ordens de serviço.

Nas telas de baixa, a cidade é exibida como informação vinculada e não pode ser editada.

## Consulta de ordens de serviço

- Adicionada coluna Cidade.
- Adicionado filtro dinâmico por cidade.
- As opções são carregadas dos estoques regionais operacionais ativos disponíveis para a conta.
- Estoques de logística reversa não aparecem no filtro.
- O filtro trabalha junto com a busca e com a paginação de 15 registros.

## Compatibilidade

- Não exige alteração manual no banco de dados.
- Ordens antigas não são modificadas automaticamente.
- Novas baixas passam a registrar cidade e estoque regional de forma controlada.
