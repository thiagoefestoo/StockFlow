# Entrada de estoque com serial condicional e avisos visíveis

## Objetivo

Corrigir a entrada de material para exigir número de série somente quando o material estiver cadastrado com `requiresSerial = true`.

## O que mudou

- Material cadastrado sem número de série não exige serial na entrada de estoque.
- Material cadastrado com número de série continua exigindo a lista de seriais com a mesma quantidade informada.
- A entrada ignora seriais enviados por engano quando o material não exige serial.
- O backend valida a mesma regra, evitando que a tela e a API fiquem divergentes.
- O cadastro/edição de material agora normaliza booleanos, evitando que valores como `"false"` sejam tratados como verdadeiro.
- Avisos de erro/sucesso na entrada aparecem em um quadro flutuante no canto superior da tela para facilitar visualização.

## Importante

Este ajuste não altera o banco nem força alteração em materiais já cadastrados. Caso algum material antigo esteja marcado como `Exige número de série = Sim`, basta editar o material, desmarcar essa opção e salvar.
