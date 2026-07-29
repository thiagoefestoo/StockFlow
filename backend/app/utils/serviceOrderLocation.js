const { Technician, Warehouse } = require('../models');

function operationalLocationError(message, statusCode = 400) {
  const error = new Error(message);
  error.statusCode = statusCode;
  return error;
}

async function resolveServiceOrderLocation(technicianId, options = {}) {
  const transaction = options.transaction || null;
  const id = Number(technicianId);

  if (!Number.isInteger(id) || id <= 0) {
    throw operationalLocationError('Técnico não identificado para definir a cidade da OS.');
  }

  const technician = await Technician.findByPk(id, { transaction });
  if (!technician) {
    throw operationalLocationError('Técnico não encontrado.', 404);
  }

  if (!technician.defaultWarehouseId) {
    throw operationalLocationError(
      'O técnico não possui estoque regional vinculado. Defina o estoque padrão no cadastro do técnico antes de baixar a OS.'
    );
  }

  const warehouse = await Warehouse.findByPk(technician.defaultWarehouseId, { transaction });
  if (!warehouse || warehouse.status !== 'ativo') {
    throw operationalLocationError('O estoque regional vinculado ao técnico não foi encontrado ou está inativo.');
  }

  if (warehouse.isReverseLogistics) {
    throw operationalLocationError('Estoque de logística reversa não pode ser usado como cidade de uma ordem de serviço.');
  }

  const city = String(warehouse.city || '').trim();
  if (!city) {
    throw operationalLocationError(
      `O estoque regional ${warehouse.name} não possui cidade cadastrada. Preencha a cidade do estoque antes de baixar a OS.`
    );
  }

  return { technician, warehouse, city };
}

module.exports = { resolveServiceOrderLocation };
