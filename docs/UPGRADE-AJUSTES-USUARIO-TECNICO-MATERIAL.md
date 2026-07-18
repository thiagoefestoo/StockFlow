# Ajustes de usuário, técnico e material

Alterações aplicadas:

- Removida a visualização de técnico vinculado na lista e detalhes de usuários.
- Ao criar/editar usuário técnico, o campo `technicianId` não é enviado pelo frontend; o backend continua criando/sincronizando o técnico automaticamente por nome/e-mail.
- Cadastro de técnico permanece sem caixa de texto manual para adicionar cidade; as cidades são carregadas dos estoques regionais e selecionadas por checkbox.
- Campo de estoque vinculado ao técnico recebeu orientação mais clara e marca a cidade automaticamente.
- Removido do cadastro e detalhes de material o bloco Fabricante, modelo e rastreio.
- Alterado o rótulo Quantidade por embalagem para Unidade.

Arquivos alterados:

- frontend/src/pages/Users.jsx
- frontend/src/pages/Technicians.jsx
- frontend/src/pages/Stock.jsx
