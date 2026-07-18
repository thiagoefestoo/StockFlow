# Ajustes de entrada, seriais, valor obrigatório e empresa do técnico

## Entrada de material

- Removida a opção de gerar seriais em lote.
- Para material serializado, a quantidade informada precisa ser exatamente igual à quantidade de seriais digitados.
- O sistema bloqueia seriais repetidos na própria entrada.
- O sistema bloqueia serial já cadastrado no banco de dados.
- O valor unitário da entrada passou a ser obrigatório e maior que zero.
- A validação existe no frontend e no backend.

## Cadastro de usuário técnico

- Adicionado campo `Nome da empresa` ao criar ou editar usuário com perfil Técnico.
- Ao salvar um usuário técnico, o backend cria ou encontra a empresa pelo nome informado.
- O técnico criado/sincronizado automaticamente passa a receber o vínculo com a empresa.

## Cadastro de material

- Removidos do código da tela os campos de fabricante, modelo, marca, código de barras e padrão de serial.
