require('dotenv').config();
const sequelize = require('./config/db');
const { QueryTypes } = require('sequelize');

const checks = [
  { nome: 'Histórico de movimentação', tabela: 'stock_movements', coluna: 'quantity', ordem: '"movementAt" DESC NULLS LAST, id DESC' },
  { nome: 'Saldo em estoque/caixa', tabela: 'stock_balances', coluna: 'quantity', ordem: 'caixa', tabela: 'stock_balances', coluna: 'quantity', ordem: 'id DESC' },
  { nome: 'Itens de entrada', tabela: 'stock_batch_items', coluna: 'quantity', ordem: 'id DESC' },
  { nome: 'Entrada quinzenal/mensal', tabela: 'stock_batches', coluna: 'totalItems', ordem: 'id DESC' },
  { nome: 'Itens de transferência', tabela: 'transfer_items', coluna: 'quantity', ordem: 'id DESC' },
  { nome: 'Solicitação de material', tabela: 'material_request_items', coluna: 'quantity', ordem: 'id DESC' },
  { nome: 'Solicitação aprovada', tabela: 'material_request_items', coluna: 'approvedQuantity', ordem: 'id DESC' },
  { nome: 'Baixa de OS', tabela: 'service_order_materials', coluna: 'quantity', ordem: 'id DESC' }
];

function quote(name) {
  return '"' + String(name).replace(/"/g, '""') + '"';
}

async function existsTable(table) {
  const rows = await sequelize.query(
    `SELECT to_regclass(:tableName) AS table_exists`,
    {
      replacements: { tableName: `public.${table}` },
      type: QueryTypes.SELECT
    }
  );

  return !!rows[0]?.table_exists;
}

async function main() {
  await sequelize.authenticate();

  console.log('\n===== CONFERÊNCIA DE QUANTIDADES NO BANCO =====\n');

  for (const item of checks) {
    const tableOk = await existsTable(item.tabela);
    if (!tableOk) {
      console.log(`\n[IGNORADO] ${item.nome} - tabela não existe: ${item.tabela}`);
      continue;
    }

    const coluna = quote(item.coluna);
    const tabela = quote(item.tabela);

    console.log(`\n--- ${item.nome} | ${item.tabela}.${item.coluna} ---`);

    const resumo = await sequelize.query(
      `
      SELECT
        COUNT(*)::int AS total_registros,
        COUNT(*) FILTER (WHERE ${coluna}::numeric >= 1000)::int AS registros_com_1000_ou_mais,
        MIN(${coluna}::numeric)::float8 AS menor_quantidade,
        MAX(${coluna}::numeric)::float8 AS maior_quantidade,
        SUM(${coluna}::numeric)::float8 AS soma_quantidade
      FROM ${tabela}
      WHERE ${coluna} IS NOT NULL
      `,
      { type: QueryTypes.SELECT }
    );

    console.table(resumo);

    const recentes = await sequelize.query(
      `
      SELECT
        id,
        ${coluna}::text AS valor_exato_no_banco,
        ${coluna}::float8 AS valor_numerico_real,
        CASE
          WHEN ${coluna}::numeric >= 1000 THEN 'ATENÇÃO: banco tem 1000 ou mais'
          ELSE 'OK: banco está em unidade decimal'
        END AS leitura
      FROM ${tabela}
      WHERE ${coluna} IS NOT NULL
      ORDER BY ${item.ordem}
      LIMIT 15
      `,
      { type: QueryTypes.SELECT }
    );

    console.table(recentes);
  }

  console.log('\n===== COMO INTERPRETAR =====');
  console.log('Se valor_exato_no_banco aparecer 1.000 e valor_numerico_real aparecer 1, o banco está correto: é 1 unidade.');
  console.log('Se valor_numerico_real aparecer 1000, 2000, 3000, aí o banco realmente está errado e precisa correção no backend/banco.');
}

main()
  .catch((error) => {
    console.error('\nERRO AO CONFERIR:', error.message);
    process.exitCode = 1;
  })
  .finally(async () => {
    await sequelize.close();
  });
