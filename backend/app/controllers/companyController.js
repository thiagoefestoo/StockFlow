const { ContractorCompany, Technician } = require('../models');
const { crudController } = require('./crudHelpers');
module.exports = crudController(ContractorCompany, 'Empresa/Terceirizada', [Technician]);
