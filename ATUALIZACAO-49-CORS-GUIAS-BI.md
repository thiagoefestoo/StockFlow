# Atualização 49 — CORS, detalhes de guias e desempenho do BI

## Correções

- Corrige o CORS entre `https://estoque-superinfra.vercel.app` e o backend publicado no Render.
- Mantém as origens locais e combina as origens padrão com as variáveis `CORS_ORIGIN` e `FRONTEND_URL`, evitando que uma configuração antiga remova o domínio oficial.
- A tela de detalhes da guia deixa de transportar todos os anexos em Base64 na abertura.
- Os anexos são carregados individualmente somente ao clicar em **Visualizar** ou **Baixar**.
- A página de impressão da guia também utiliza carregamento sob demanda dos anexos.
- O BI financeiro passa a mostrar mensagem tratada e botão de nova tentativa quando houver falha de rede.

## Desempenho

- Remove consultas repetidas por material no cálculo da posição patrimonial.
- Remove consultas repetidas por técnico no BI financeiro.
- Equipamentos, saldos e ferramentas passam a ser carregados em lotes e agrupados em memória.
- Remove associações desnecessárias de equipamentos serializados nas consultas de transferências e ordens do BI.
- A requisição do BI financeiro admite até 60 segundos para acomodar inicialização fria do Render.

## Banco de dados

Não há migração nem alteração de estrutura do banco.
