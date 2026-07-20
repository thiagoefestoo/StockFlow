const { Op } = require('sequelize');
const bcrypt = require('bcryptjs');
const {
  Technician,
  ContractorCompany,
  SerializedAsset,
  StockBalance,
  Material,
  Transfer,
  TransferItem,
  ServiceOrder,
  StockMovement,
  User,
  Warehouse,
} = require('../models');
const asyncHandler = require('../utils/asyncHandler');
const { ok, created, fail } = require('../utils/response');
const { writeAudit } = require('../services/auditService');
const { money, daysBetween } = require('../utils/number');

const technicianInclude = [ContractorCompany, { model: Warehouse, as: 'defaultWarehouse' }];

function normalizeEmail(value) {
  const email = String(value || '').toLowerCase().trim();
  return email || null;
}

function normalizeCities(value) {
  if (Array.isArray(value)) return value.map((item) => String(item || '').trim()).filter(Boolean);
  if (typeof value === 'string') return value.split(',').map((item) => item.trim()).filter(Boolean);
  return [];
}

function technicianPayload(body) {
  return {
    name: String(body.name || '').trim(),
    document: body.document ? String(body.document).trim() : null,
    phone: body.phone ? String(body.phone).trim() : null,
    email: normalizeEmail(body.email),
    type: body.type || 'interno',
    status: body.status || 'ativo',
    companyId: body.companyId || null,
    vehiclePlate: body.vehiclePlate ? String(body.vehiclePlate).trim().toUpperCase() : null,
    notes: body.notes ? String(body.notes).trim() : null,
    serviceCities: normalizeCities(body.serviceCities),
    defaultWarehouseId: body.defaultWarehouseId || null,
  };
}

function publicPortalUser(user) {
  if (!user) return null;
  return {
    id: user.id,
    name: user.name,
    email: user.email,
    role: user.role,
    status: user.status,
    technicianId: user.technicianId,
    mustChangePassword: !!user.mustChangePassword,
    lastLoginAt: user.lastLoginAt,
  };
}

async function findPortalUserForTechnician(technician) {
  return User.findOne({
    where: {
      [Op.or]: [
        { technicianId: technician.id },
        ...(technician.email ? [{ email: technician.email }] : []),
      ],
    },
  });
}

async function syncPortalUser({ req, technician, password, mustChangePassword = true }) {
  if (!technician.email) {
    const error = new Error('Informe um e-mail para criar o acesso de login do técnico.');
    error.statusCode = 400;
    throw error;
  }

  let user = await findPortalUserForTechnician(technician);
  const rawPassword = password === undefined || password === null ? '' : String(password);
  if (rawPassword && rawPassword.length < 6) {
    const error = new Error('Informe uma senha com pelo menos 6 caracteres para o acesso do técnico.');
    error.statusCode = 400;
    throw error;
  }
  const hasPassword = rawPassword.length >= 6;
  if (!user && !hasPassword) {
    const error = new Error('Informe uma senha inicial com pelo menos 6 caracteres para criar o acesso do técnico.');
    error.statusCode = 400;
    throw error;
  }

  const common = {
    name: technician.name,
    email: technician.email,
    role: 'tecnico',
    technicianId: technician.id,
    phone: technician.phone || null,
    jobTitle: 'Técnico',
    status: technician.status === 'ativo' ? 'ativo' : 'inativo',
    warehouseIds: technician.defaultWarehouseId ? [Number(technician.defaultWarehouseId)] : [],
    cityAccess: normalizeCities(technician.serviceCities),
  };

  if (!user) {
    user = await User.create({
      ...common,
      mustChangePassword: !!mustChangePassword,
      passwordChangedAt: new Date(),
      passwordHash: await bcrypt.hash(rawPassword, 10),
    });
    await writeAudit({ req, action: 'create_technician_portal_user', entity: 'User', entityId: user.id, message: `Acesso do técnico ${technician.name} criado no banco de dados.`, afterData: publicPortalUser(user) });
    return user;
  }

  const before = publicPortalUser(user);
  Object.assign(user, common);
  if (hasPassword) {
    user.passwordHash = await bcrypt.hash(rawPassword, 10);
    user.passwordChangedAt = new Date();
    user.mustChangePassword = !!mustChangePassword;
  }
  await user.save();
  await writeAudit({ req, action: 'sync_technician_portal_user', entity: 'User', entityId: user.id, message: `Acesso do técnico ${technician.name} sincronizado com o cadastro do técnico.`, beforeData: before, afterData: publicPortalUser(user) });
  return user;
}

exports.list = asyncHandler(async (req, res) => {
  const technicians = await Technician.findAll({ include: technicianInclude, order: [['name', 'ASC']] });
  const data = [];
  for (const technician of technicians) {
    const assetCount = await SerializedAsset.count({ where: { technicianId: technician.id, ownerType: 'tecnico' } });
    const assetValue = await SerializedAsset.sum('acquisitionCost', { where: { technicianId: technician.id, ownerType: 'tecnico' } });
    const balances = await StockBalance.findAll({ where: { technicianId: technician.id, ownerType: 'tecnico' }, include: [Material] });
    const consumableValue = balances.reduce((sum, row) => sum + Number(row.quantity || 0) * Number(row.Material?.unitCost || 0), 0);
    const portalUser = await findPortalUserForTechnician(technician);
    data.push({
      ...technician.toJSON(),
      portalUser: publicPortalUser(portalUser),
      assetCount,
      assetValue: money(assetValue),
      consumableValue: money(consumableValue),
      totalCustodyValue: money(Number(assetValue || 0) + consumableValue),
    });
  }
  return ok(res, data);
});

exports.get = asyncHandler(async (req, res) => {
  const technician = await Technician.findByPk(req.params.id, { include: technicianInclude });
  if (!technician) return fail(res, 404, 'Técnico não encontrado.');
  const portalUser = await findPortalUserForTechnician(technician);
  return ok(res, { ...technician.toJSON(), portalUser: publicPortalUser(portalUser) });
});

exports.create = asyncHandler(async (req, res) => {
  const payload = technicianPayload(req.body);
  if (!payload.name || payload.name.length < 3) return fail(res, 400, 'Informe o nome do técnico.');
  const technician = await Technician.create(payload);

  let portalUser = null;
  const wantsPortalUser = req.body.createPortalUser === true || req.body.createPortalUser === 'true' || !!String(req.body.portalPassword || '').trim();
  if (wantsPortalUser) {
    portalUser = await syncPortalUser({
      req,
      technician,
      password: req.body.portalPassword,
      mustChangePassword: req.body.mustChangePassword !== false && req.body.mustChangePassword !== 'false',
    });
  }

  const createdTechnician = await Technician.findByPk(technician.id, { include: technicianInclude });
  await writeAudit({ req, action: 'create', entity: 'Técnico', entityId: technician.id, message: 'Técnico criado.', afterData: createdTechnician.toJSON() });
  return created(res, { ...createdTechnician.toJSON(), portalUser: publicPortalUser(portalUser) }, portalUser ? 'Técnico criado com acesso de login.' : 'Técnico criado.');
});

exports.update = asyncHandler(async (req, res) => {
  const technician = await Technician.findByPk(req.params.id, { include: technicianInclude });
  if (!technician) return fail(res, 404, 'Técnico não encontrado.');
  const before = technician.toJSON();
  await technician.update(technicianPayload({ ...technician.toJSON(), ...req.body }));

  let portalUser = await findPortalUserForTechnician(technician);
  const wantsPortalUser = req.body.createPortalUser === true || req.body.createPortalUser === 'true' || !!String(req.body.portalPassword || '').trim();
  if (wantsPortalUser) {
    portalUser = await syncPortalUser({
      req,
      technician,
      password: req.body.portalPassword,
      mustChangePassword: req.body.mustChangePassword !== false && req.body.mustChangePassword !== 'false',
    });
  } else if (portalUser) {
    portalUser.name = technician.name;
    portalUser.email = technician.email || portalUser.email;
    portalUser.phone = technician.phone || null;
    portalUser.status = technician.status === 'ativo' ? 'ativo' : 'inativo';
    portalUser.warehouseIds = technician.defaultWarehouseId ? [Number(technician.defaultWarehouseId)] : [];
    portalUser.cityAccess = normalizeCities(technician.serviceCities);
    await portalUser.save();
  }

  const updated = await Technician.findByPk(technician.id, { include: technicianInclude });
  await writeAudit({ req, action: 'update', entity: 'Técnico', entityId: technician.id, message: 'Técnico atualizado.', beforeData: before, afterData: updated.toJSON() });
  return ok(res, { ...updated.toJSON(), portalUser: publicPortalUser(portalUser) }, portalUser ? 'Técnico atualizado e acesso sincronizado.' : 'Técnico atualizado.');
});

exports.stock = asyncHandler(async (req, res) => {
  const technician = await Technician.findByPk(req.params.id, { include: technicianInclude });
  if (!technician) return fail(res, 404, 'Técnico não encontrado.');
  if (req.user?.role === 'tecnico' && Number(req.user.technicianId) !== Number(technician.id)) {
    return fail(res, 403, 'Você só pode acessar a própria caixa técnica.');
  }

  const assets = await SerializedAsset.findAll({
    where: { technicianId: technician.id, ownerType: 'tecnico' },
    include: [Material],
    order: [['custodyStartedAt', 'ASC']],
  });

  const balances = await StockBalance.findAll({
    where: { technicianId: technician.id, ownerType: 'tecnico' },
    include: [Material],
    order: [[Material, 'name', 'ASC']],
  });

  const movements = await StockMovement.findAll({
    where: { [Op.or]: [{ fromTechnicianId: technician.id }, { toTechnicianId: technician.id }] },
    include: [
      Material,
      SerializedAsset,
      { model: Technician, as: 'fromTechnician' },
      { model: Technician, as: 'toTechnician' },
      { model: User, as: 'createdBy', attributes: ['id', 'name', 'email', 'role'] },
    ],
    order: [['movementAt', 'DESC']],
    limit: 80,
  });

  const transfers = await Transfer.findAll({
    where: { technicianId: technician.id },
    include: [{ model: TransferItem, include: [Material, SerializedAsset] }],
    order: [['deliveredAt', 'DESC']],
    limit: 30,
  });

  const orders = await ServiceOrder.findAll({
    where: { technicianId: technician.id },
    order: [['createdAt', 'DESC']],
    limit: 40,
  });

  const assetsValue = assets.reduce((sum, asset) => sum + Number(asset.acquisitionCost || 0), 0);
  const consumableValue = balances.reduce((sum, row) => sum + Number(row.quantity || 0) * Number(row.Material?.unitCost || 0), 0);
  const grouped = {};
  for (const asset of assets) {
    const key = asset.Material?.name || 'Equipamento serializado';
    grouped[key] = grouped[key] || { material: key, quantity: 0, value: 0, serials: [] };
    grouped[key].quantity += 1;
    grouped[key].value += Number(asset.acquisitionCost || 0);
    grouped[key].serials.push(asset.serialNumber);
  }
  for (const balance of balances) {
    const key = balance.Material?.name || 'Material consumível';
    grouped[key] = grouped[key] || { material: key, quantity: 0, value: 0, serials: [] };
    grouped[key].quantity += Number(balance.quantity || 0);
    grouped[key].value += Number(balance.quantity || 0) * Number(balance.Material?.unitCost || 0);
  }

  return ok(res, {
    technician,
    assets: assets.map((asset) => ({ ...asset.toJSON(), custodyDays: daysBetween(asset.custodyStartedAt) })),
    balances,
    movements,
    transfers,
    orders,
    summary: {
      assetsCount: assets.length,
      consumableLines: balances.length,
      transfersCount: transfers.length,
      ordersCount: orders.length,
      openOrders: orders.filter((order) => ['aberta', 'pendente'].includes(order.status)).length,
      oldCustody: assets.filter((asset) => daysBetween(asset.custodyStartedAt) >= 60).length,
      assetsValue: money(assetsValue),
      consumableValue: money(consumableValue),
      totalValue: money(assetsValue + consumableValue),
    },
    groupedMaterials: Object.values(grouped).map((row) => ({ ...row, value: money(row.value) })),
  });
});
