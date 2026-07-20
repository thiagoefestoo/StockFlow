# Ajuste: fluxo regional sem estoque central

Alterações incluídas:

- Cargo/função no cadastro de usuário virou lista suspensa.
- Campo de técnico vinculado foi removido do formulário de usuário.
- Usuário técnico passa a criar/vincular cadastro de técnico automaticamente pelo e-mail/nome.
- Usuário pode ser vinculado a estoques autorizados por checkboxes.
- Cidades autorizadas não têm mais campo manual; vêm dos estoques regionais cadastrados.
- Cadastro de técnico não usa mais caixa de texto livre para cidade; usa checkboxes de cidades regionais.
- Entrada de material exige sempre estoque regional; não existe mais opção de estoque central.
- Cadastro de material novo exige estoque regional de cadastro e pode incluir quantidade/seriais iniciais diretamente nesse estoque.

Depois de aplicar, rode build, commit, Render e Vercel.
