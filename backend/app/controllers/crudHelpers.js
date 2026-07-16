const asyncHandler = require('../utils/asyncHandler');
const { ok, created, fail } = require('../utils/response');
const { writeAudit } = require('../services/auditService');

function crudController(Model, entity, include = []) {
  return {
    list: asyncHandler(async (req, res) => {
      const records = await Model.findAll({ include, order: [['createdAt', 'DESC']] });
      return ok(res, records);
    }),
    get: asyncHandler(async (req, res) => {
      const record = await Model.findByPk(req.params.id, { include });
      if (!record) return fail(res, 404, `${entity} não encontrado.`);
      return ok(res, record);
    }),
    create: asyncHandler(async (req, res) => {
      const record = await Model.create(req.body);
      await writeAudit({ req, action: 'create', entity, entityId: record.id, message: `${entity} criado.`, afterData: record.toJSON() });
      return created(res, record, `${entity} criado.`);
    }),
    update: asyncHandler(async (req, res) => {
      const record = await Model.findByPk(req.params.id);
      if (!record) return fail(res, 404, `${entity} não encontrado.`);
      const before = record.toJSON();
      await record.update(req.body);
      await writeAudit({ req, action: 'update', entity, entityId: record.id, message: `${entity} atualizado.`, beforeData: before, afterData: record.toJSON() });
      return ok(res, record, `${entity} atualizado.`);
    }),
  };
}

module.exports = { crudController };
