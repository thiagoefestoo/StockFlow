require('dotenv').config();

const sequelize = require('./config/db');
const { Op } = require('sequelize');

const {
  StockBatch,
  StockBatchItem,
  Material,
  SerializedAsset,
} = require('./app/models');

const ENTRADAS = [
  {
    entrada: 'ENTRATA-405060',
    documento: 'DOC-789',
    valorTotal: 2500,
  },
  {
    entrada: 'ENTRATA-102030',
    documento: 'DOC1010101',
    valorTotal: 2500,
  },
];

function parseSerials(value) {
  if (!value) return [];

  if (Array.isArray(value)) {
    return value.map(String).map((s) => s.trim()).filter(Boolean);
  }

  if (typeof value === 'string') {
    try {
      const parsed = JSON.parse(value);
      if (Array.isArray(parsed)) {
        return parsed.map(String).map((s) => s.trim()).filter(Boolean);
      }
    } catch {}

    return value
      .split(/\n|,|;/)
      .map((s) => s.trim())
      .filter(Boolean);
  }

  return [];
}

async function main() {
  await sequelize.authenticate();
  console.log('Conectado ao banco Neon.');

  await sequelize.transaction(async (transaction) => {
    for (const entrada of ENTRADAS) {
      const batch = await StockBatch.findOne({
        where: {
          [Op.or]: [
            { receiptNumber: entrada.entrada },
            { fiscalDocumentNumber: entrada.documento },
          ],
        },
        transaction,
      });

      if (!batch) {
        console.log(`Entrada não encontrada: ${entrada.entrada} / ${entrada.documento}`);
        continue;
      }

      const items = await StockBatchItem.findAll({
        where: { batchId: batch.id },
        include: [Material],
        transaction,
      });

      const quantidadeTotal = items.reduce((sum, item) => {
        return sum + Number(item.quantity || 0);
      }, 0);

      if (!quantidadeTotal) {
        console.log(`Entrada ${entrada.entrada} sem itens para atualizar.`);
        continue;
      }

      const valorUnitario = Number((entrada.valorTotal / quantidadeTotal).toFixed(6));

      await batch.update(
        {
          totalValue: entrada.valorTotal,
          totalItems: quantidadeTotal,
        },
        { transaction }
      );

      for (const item of items) {
        const quantidade = Number(item.quantity || 0);
        const totalItem = Number((quantidade * valorUnitario).toFixed(2));

        await item.update(
          {
            unitCost: valorUnitario,
            totalCost: totalItem,
          },
          { transaction }
        );

        if (item.Material) {
          await item.Material.update(
            {
              unitCost: valorUnitario,
            },
            { transaction }
          );
        }

        const serials = parseSerials(item.serialNumbers);

        if (serials.length) {
          await SerializedAsset.update(
            {
              acquisitionCost: valorUnitario,
            },
            {
              where: {
                serialNumber: serials,
              },
              transaction,
            }
          );
        }

        console.log('');
        console.log(`Entrada atualizada: ${batch.receiptNumber}`);
        console.log(`Material: ${item.Material?.name || item.materialId}`);
        console.log(`Quantidade: ${quantidade}`);
        console.log(`Valor unitário: R$ ${valorUnitario}`);
        console.log(`Valor total do item: R$ ${totalItem}`);
      }

      console.log(`Valor total da entrada ${batch.receiptNumber}: R$ ${entrada.valorTotal}`);
    }
  });

  console.log('');
  console.log('Atualização concluída com sucesso.');
}

main()
  .catch((error) => {
    console.error('Erro:', error.message);
    process.exitCode = 1;
  })
  .finally(async () => {
    await sequelize.close();
  });
