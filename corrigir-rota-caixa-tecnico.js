const fs = require('fs');

function save(path, content) {
  fs.writeFileSync(path, content, 'utf8');
  console.log('Atualizado:', path);
}

const routesPath = 'backend/app/routes/technicianRoutes.js';
let routes = fs.readFileSync(routesPath, 'utf8');

routes = routes.replace(
  "router.get('/:id/stock', requireRoles('admin', 'supervisor'), controller.stock);",
  "router.get('/:id/stock', requireRoles('admin', 'supervisor', 'estoquista', 'tecnico'), controller.stock);"
);

save(routesPath, routes);

const controllerPath = 'backend/app/controllers/technicianController.js';
let controller = fs.readFileSync(controllerPath, 'utf8');

const oldBlock = `exports.stock = asyncHandler(async (req, res) => {
  const technician = await Technician.findByPk(req.params.id, { include: technicianInclude });
  if (!technician) return fail(res, 404, 'Técnico não encontrado.');

  const assets = await SerializedAsset.findAll({`;

const newBlock = `exports.stock = asyncHandler(async (req, res) => {
  const technician = await Technician.findByPk(req.params.id, { include: technicianInclude });
  if (!technician) return fail(res, 404, 'Técnico não encontrado.');

  if (req.user.role === 'tecnico' && Number(req.user.technicianId) !== Number(technician.id)) {
    return fail(res, 403, 'Você só pode consultar a sua própria caixa.');
  }

  const assets = await SerializedAsset.findAll({`;

if (!controller.includes("Você só pode consultar a sua própria caixa.")) {
  if (!controller.includes(oldBlock)) {
    throw new Error('Não encontrei o bloco da função stock para alterar.');
  }
  controller = controller.replace(oldBlock, newBlock);
  save(controllerPath, controller);
} else {
  console.log('Regra de segurança da caixa já existia no controller.');
}
