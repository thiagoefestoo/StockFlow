# Atualização 52 — Logística reversa isolada e substituição de equipamento em OS

## 1. Logística reversa totalmente isolada

A entrada e a saída de logística reversa passam a utilizar tabelas próprias e não dependem do cadastro geral de materiais.

### Entrada

- Permite informar código, descrição, quantidade, unidade, condição, valor opcional e seriais/patrimônios.
- Não consulta nem cria registros no catálogo geral de materiais.
- Não cria lote operacional, saldo operacional, patrimônio operacional, movimentação geral ou auditoria geral.
- Os dados ficam disponíveis exclusivamente em **Estoques Regionais > Detalhes/BI** do estoque reverso.

### Saída para fornecedor

- Utiliza somente o saldo isolado do próprio estoque reverso.
- Não cria transferência, movimentação geral ou auditoria geral.
- Registra fornecedor, documento, itens, quantidades, seriais e valores somente no histórico interno do estoque reverso.

### Isolamento dos relatórios

- Estoques reversos continuam fora dos BIs operacionais e financeiros.
- Entradas reversas não aparecem na lista geral de entradas.
- Operações reversas não aparecem no histórico geral nem na auditoria geral.
- O valor do estoque reverso não é exibido na listagem geral; é consultado somente em **Detalhes/BI**.

### Excel

O botão **Baixar Excel**, dentro de **Detalhes/BI**, gera um arquivo exclusivo do estoque reverso com:

- resumo isolado;
- saldo atual;
- entradas e seus itens;
- saídas para fornecedor e seus itens.

Os dados detalhados para o Excel são buscados somente quando o usuário solicita a exportação, evitando aumentar o carregamento normal da página.

## 2. Substituição de equipamento instalado em ordem de serviço

Foi criada a permissão especial:

**Substituir equipamento instalado em OS**

Ela pode ser ativada em **Usuários e permissões**. O administrador possui acesso automático; os demais usuários só veem e executam a operação quando a permissão estiver marcada.

### Fluxo

1. O usuário abre uma ordem de serviço que possui equipamento serializado instalado.
2. Clica em **Trocar equipamento**.
3. Seleciona o equipamento atualmente instalado.
4. Pesquisa e seleciona um equipamento disponível na caixa do técnico responsável pela OS.
5. Informa o motivo e confirma a substituição.

### Resultado da operação

- O equipamento anterior retorna para a caixa do técnico responsável pela OS.
- O novo equipamento é instalado no mesmo cliente.
- A linha de material da OS passa a apontar para o novo patrimônio/serial.
- A substituição fica registrada na própria OS, no histórico operacional e na auditoria.
- São registradas as movimentações de devolução do equipamento anterior e instalação do novo.
- Técnicos só podem executar a substituição em suas próprias ordens de serviço.
- A troca é limitada a equipamentos de categoria compatível.

## 3. Banco de dados

O backend cria automaticamente, na primeira inicialização após o deploy, as tabelas isoladas da logística reversa e a tabela de substituições de equipamentos em OS. Não é necessário executar SQL manualmente.

A atualização não migra nem apaga automaticamente registros antigos que tenham sido lançados pelo fluxo anterior. Os novos lançamentos passam a utilizar exclusivamente a estrutura isolada.

## 4. Validação técnica

- Backend: sintaxe validada em 100 arquivos JavaScript.
- Frontend: compilação de produção concluída com sucesso.
- ESLint dos arquivos de interface alterados: sem erros e sem avisos.
- Não foram executados testes contra o banco de produção do cliente.
