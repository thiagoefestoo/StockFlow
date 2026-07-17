# Upgrade — Estoques regionais com acesso por estoquista

Esta atualização adiciona controle operacional por estoque/região para o Super Infra.

## O que foi incluído

- Cadastro de estoques por cidade/região, com número/código, status ativo/inativo/bloqueado e responsável local.
- Vinculação de estoquistas aos estoques autorizados via página **Usuários e permissões**.
- Estoquista visualiza e movimenta somente os estoques vinculados no campo `warehouseIds` do usuário.
- Transferência de material entre estoques pela tela **Estoques regionais**.
- Transferência com suporte a materiais consumíveis e equipamentos com serial.
- Detalhes do estoque com:
  - materiais consumíveis no estoque;
  - equipamentos serializados no estoque;
  - usuários/estoquistas vinculados;
  - técnicos com estoque padrão vinculado;
  - histórico de movimentações;
  - BI individual do estoque.
- Filtros de backend para impedir que estoquistas consultem ou movimentem estoques não autorizados.

## Fluxo recomendado

1. Admin cria o estoque em **Operação → Estoques regionais**.
2. Admin acessa **Administração → Usuários e permissões**.
3. Edita ou cria o usuário com perfil **Estoquista**.
4. Seleciona os **Estoques autorizados** para esse usuário.
5. Em **Estoques regionais**, o admin transfere itens do estoque central para o estoque da cidade.
6. O estoquista entra no sistema e passa a ver somente o estoque vinculado a ele.

## Observação sobre tipos de movimento

Para evitar alterações destrutivas no ENUM do PostgreSQL em produção, a transferência entre estoques usa `type = ajuste` em `stock_movements`, com origem e destino preenchidos em `fromWarehouseId` e `toWarehouseId`.

