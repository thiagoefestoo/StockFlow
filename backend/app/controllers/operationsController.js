const { Op } = require('sequelize');
const {
  MaterialRequest,
  ApprovalRequest,
  Transfer,
  StockMovement,
  SerializedAsset,
  StockBalance,
  Material,
  Technician,
  ServiceOrder,
  TechnicianToolDocument,
  TechnicianTool,
  Warehouse,
} = require('../models');
const asyncHandler = require('../utils/asyncHandler');
const { ok } = require('../utils/response');
const { normalizeCityKey, resolveOperationalScope, requestScopeWhere, transferScopeWhere, serviceOrderScopeWhere } = require('../services/operationalScopeService');
const { countVisibleUnreadNotifications } = require('../services/notificationScopeService');
const { hasModuleAccess } = require('../config/modulePermissions');
const { reverseWarehouseIds, movementOutsideReverse } = require('../utils/reverseLogistics');


function isManager(user) {
  return ['admin', 'supervisor', 'estoquista'].includes(user?.role);
}

function positiveOnly(value) {
  return Number(value || 0) > 0 ? Number(value || 0) : 0;
}

async function countTechniciansMissingToolTerm(scope) {
  const activeToolRows = await TechnicianTool.findAll({
    where: { status: 'com_tecnico' },
    attributes: ['technicianId'],
    group: ['technicianId'],
    raw: true,
  }).catch(() => []);

  let technicianIds = [...new Set(activeToolRows.map((row) => Number(row.technicianId)).filter((id) => Number.isFinite(id) && id > 0))];
  if (!scope?.unrestricted) {
    const allowed = new Set(scope?.technicianIds || []);
    technicianIds = technicianIds.filter((id) => allowed.has(id));
  }
  if (!technicianIds.length) return 0;

  const activeTechnicians = await Technician.findAll({
    where: { id: { [Op.in]: technicianIds }, status: 'ativo' },
    attributes: ['id'],
    raw: true,
  }).catch(() => []);
  const activeIds = activeTechnicians.map((row) => Number(row.id));
  if (!activeIds.length) return 0;

  const documentedRows = await TechnicianToolDocument.findAll({
    where: { technicianId: { [Op.in]: activeIds } },
    attributes: ['technicianId'],
    group: ['technicianId'],
    raw: true,
  }).catch(() => []);
  const documentedIds = new Set(documentedRows.map((row) => Number(row.technicianId)));
  return activeIds.filter((id) => !documentedIds.has(id)).length;
}

async function countScopedPendingApprovals(scope, requestIds = [], warehouseIds = []) {
  if (scope?.unrestricted && !warehouseIds.length) {
    return ApprovalRequest.count({ where: { status: 'pendente' } });
  }

  const rows = await ApprovalRequest.findAll({
    where: { status: 'pendente' },
    attributes: ['entityType', 'entityId', 'payload'],
    raw: true,
  });
  const requestSet = new Set(requestIds.map(String));
  const warehouseSet = new Set((warehouseIds.length ? warehouseIds : scope?.warehouseIds || []).map(Number));

  return rows.filter((row) => {
    if (row.entityType === 'material_request') return requestSet.has(String(row.entityId));
    const payload = row.payload || {};
    if (row.entityType === 'warehouse_delete') {
      return warehouseSet.has(Number(payload.warehouseId || payload.warehouse?.id));
    }
    if (row.entityType === 'warehouse_transfer') {
      return warehouseSet.has(Number(payload.fromWarehouseId)) || warehouseSet.has(Number(payload.toWarehouseId));
    }
    return false;
  }).length;
}

function setRouteIfAllowed(routes, user, moduleKey, route, value) {
  if (hasModuleAccess(user, moduleKey)) routes[route] = positiveOnly(value);
}

exports.pendingMenu = asyncHandler(async (req, res) => {
  const user = req.user;
  const routes = {};
  const scope = await resolveOperationalScope(user);

  if (isManager(user)) {
    const requestWhere = requestScopeWhere(scope);
    const transferWhere = transferScopeWhere(scope);
    const orderWhere = serviceOrderScopeWhere(scope);
    const scopedRequests = await MaterialRequest.findAll({ where: requestWhere, attributes: ['id'], raw: true });
    const scopedRequestIds = scopedRequests.map((row) => String(row.id));

    const [
      pendingApprovals,
      approvedMaterialRequests,
      pendingRequestApprovals,
      pendingTransferSignatures,
      pendingLossSignatures,
      openOrders,
      techniciansMissingToolTerm,
    ] = await Promise.all([
      countScopedPendingApprovals(scope, scopedRequestIds),
      MaterialRequest.count({ where: { [Op.and]: [requestWhere, { status: 'aprovado' }] } }),
      MaterialRequest.count({ where: { [Op.and]: [requestWhere, { status: 'pendente_aprovacao' }] } }),
      Transfer.count({ where: { [Op.and]: [transferWhere, { status: 'pendente_assinatura', transferNumber: { [Op.notILike]: 'PERDA-%' } }] } }),
      Transfer.count({ where: { [Op.and]: [transferWhere, { status: 'pendente_assinatura', transferNumber: { [Op.iLike]: 'PERDA-%' } }] } }),
      ServiceOrder.count({ where: { [Op.and]: [orderWhere, { status: { [Op.in]: ['aberta', 'pendente'] } }] } }),
      countTechniciansMissingToolTerm(scope),
    ]);

    setRouteIfAllowed(routes, user, 'approvals', '/aprovacoes', Math.max(pendingApprovals, pendingRequestApprovals));
    setRouteIfAllowed(routes, user, 'materialRequests', '/solicitacoes-material', approvedMaterialRequests);
    setRouteIfAllowed(routes, user, 'transfers', '/transferencias', pendingTransferSignatures);
    setRouteIfAllowed(routes, user, 'technicianLosses', '/perdas-tecnico', pendingLossSignatures);
    setRouteIfAllowed(routes, user, 'lossEvaluation', '/avaliacao-perdas', pendingLossSignatures);
    setRouteIfAllowed(routes, user, 'serviceOrders', '/os', openOrders);
    setRouteIfAllowed(routes, user, 'technicians', '/tecnicos', techniciansMissingToolTerm);
  } else if (user?.role === 'tecnico') {
    const requestWhere = { technicianId: user.technicianId || -1 };
    const transferWhere = { technicianId: user.technicianId || -1 };

    const [requestsInProgress, pendingSignatures, unreadNotifications, openOrders] = await Promise.all([
      MaterialRequest.count({ where: { ...requestWhere, status: { [Op.in]: ['pendente_aprovacao', 'aprovado'] } } }),
      Transfer.count({ where: { ...transferWhere, status: 'pendente_assinatura' } }),
      countVisibleUnreadNotifications(user),
      ServiceOrder.count({ where: { technicianId: user.technicianId || -1, status: { [Op.in]: ['aberta', 'pendente'] } } }),
    ]);

    setRouteIfAllowed(routes, user, 'materialRequests', '/solicitacoes-material', requestsInProgress);
    setRouteIfAllowed(routes, user, 'technicianInbox', '/caixa-tecnico', pendingSignatures + unreadNotifications + openOrders);
  }

  const total = Object.values(routes).reduce((sum, value) => sum + Number(value || 0), 0);
  return ok(res, { total, routes, updatedAt: new Date().toISOString() });
});

exports.cockpit = asyncHandler(async (req, res) => {
  const user = req.user;
  const scope = await resolveOperationalScope(user);
  const selectedCity = String(req.query.city || '').trim();
  const warehouseBaseWhere = { isReverseLogistics: false, status: 'ativo' };
  if (!scope.unrestricted) warehouseBaseWhere.id = { [Op.in]: scope.warehouseIds.length ? scope.warehouseIds : [-1] };

  const operationalWarehouses = await Warehouse.findAll({
    where: warehouseBaseWhere,
    attributes: ['id', 'city'],
    order: [['city', 'ASC'], ['name', 'ASC']],
    raw: true,
  });
  const cities = [...new Set(operationalWarehouses.map((row) => String(row.city || '').trim()).filter(Boolean))];
  const selectedCityKey = normalizeCityKey(selectedCity);
  const cityWarehouseIds = selectedCity
    ? operationalWarehouses.filter((row) => normalizeCityKey(row.city) === selectedCityKey).map((row) => Number(row.id))
    : operationalWarehouses.map((row) => Number(row.id));
  const restrictOperationalData = Boolean(selectedCity) || !scope.unrestricted;
  const cityTechnicians = restrictOperationalData
    ? await Technician.findAll({ where: { defaultWarehouseId: { [Op.in]: cityWarehouseIds.length ? cityWarehouseIds : [-1] } }, attributes: ['id'], raw: true })
    : [];
  const cityTechnicianIds = cityTechnicians.map((row) => Number(row.id));

  const requestCityWhere = restrictOperationalData ? {
    [Op.or]: [
      { warehouseId: { [Op.in]: cityWarehouseIds.length ? cityWarehouseIds : [-1] } },
      { technicianId: { [Op.in]: cityTechnicianIds.length ? cityTechnicianIds : [-1] } },
    ],
  } : {};
  const transferCityWhere = restrictOperationalData ? {
    [Op.or]: [
      { warehouseId: { [Op.in]: cityWarehouseIds.length ? cityWarehouseIds : [-1] } },
      { technicianId: { [Op.in]: cityTechnicianIds.length ? cityTechnicianIds : [-1] } },
      { fromTechnicianId: { [Op.in]: cityTechnicianIds.length ? cityTechnicianIds : [-1] } },
    ],
  } : {};
  const orderCityWhere = restrictOperationalData ? {
    [Op.or]: [
      ...(selectedCity ? [{ city: { [Op.iLike]: selectedCity } }] : []),
      { warehouseId: { [Op.in]: cityWarehouseIds.length ? cityWarehouseIds : [-1] } },
      { technicianId: { [Op.in]: cityTechnicianIds.length ? cityTechnicianIds : [-1] } },
    ],
  } : {};

  if (String(req.query.summaryOnly || '').toLowerCase() === 'true') {
    const scopedRequests = await MaterialRequest.findAll({ where: requestCityWhere, attributes: ['id'], raw: true });
    const scopedIds = scopedRequests.map((row) => String(row.id));
    const [pendingApprovals, pendingSignatures, openOrders, unreadNotifications] = await Promise.all([
      countScopedPendingApprovals(scope, scopedIds, restrictOperationalData ? cityWarehouseIds : []),
      Transfer.count({ where: { [Op.and]: [transferCityWhere, { status: 'pendente_assinatura' }] } }),
      ServiceOrder.count({ where: { [Op.and]: [orderCityWhere, { status: { [Op.in]: ['aberta', 'pendente'] } }] } }),
      countVisibleUnreadNotifications(user),
    ]);
    return ok(res, {
      kpis: { pendingApprovals, pendingSignatures, openOrders, unreadNotifications },
      queue: [], custodyRanking: [], recentMovements: [], recentRequests: [],
      summaryOnly: true, selectedCity: selectedCity || null, cities,
    });
  }

  const today = new Date();
  const last30 = new Date(today.getTime() - 30 * 24 * 60 * 60 * 1000);
  const reverseIds = await reverseWarehouseIds();
  const reverseSet = new Set(reverseIds.map(Number));

  const requestRows = await MaterialRequest.findAll({ where: requestCityWhere, attributes: ['id'], raw: true });
  const requestIds = requestRows.map((row) => String(row.id));

  const movementCityWhere = restrictOperationalData ? {
    [Op.or]: [
      { fromWarehouseId: { [Op.in]: cityWarehouseIds.length ? cityWarehouseIds : [-1] } },
      { toWarehouseId: { [Op.in]: cityWarehouseIds.length ? cityWarehouseIds : [-1] } },
      { fromTechnicianId: { [Op.in]: cityTechnicianIds.length ? cityTechnicianIds : [-1] } },
      { toTechnicianId: { [Op.in]: cityTechnicianIds.length ? cityTechnicianIds : [-1] } },
    ],
  } : {};

  const [
    pendingRequests, approvedRequests, deliveredRequests, pendingApprovals,
    pendingSignatures, openOrders, completedOrders30, unreadNotifications,
    assetsWithTech, assetsInStock, recentMovements, recentRequests, balances,
  ] = await Promise.all([
    MaterialRequest.count({ where: { ...requestCityWhere, status: 'pendente_aprovacao' } }),
    MaterialRequest.count({ where: { ...requestCityWhere, status: 'aprovado' } }),
    MaterialRequest.count({ where: { ...requestCityWhere, status: 'entregue' } }),
    countScopedPendingApprovals(scope, requestIds, restrictOperationalData ? cityWarehouseIds : []),
    Transfer.count({ where: { ...transferCityWhere, status: 'pendente_assinatura' } }),
    ServiceOrder.count({ where: { ...orderCityWhere, status: { [Op.in]: ['aberta', 'pendente'] } } }),
    ServiceOrder.count({ where: { ...orderCityWhere, status: 'concluida', completedAt: { [Op.gte]: last30 } } }),
    countVisibleUnreadNotifications(user),
    SerializedAsset.findAll({ where: { ownerType: 'tecnico', ...(restrictOperationalData ? { technicianId: { [Op.in]: cityTechnicianIds.length ? cityTechnicianIds : [-1] } } : {}) }, include: [Material, Technician] }),
    SerializedAsset.findAll({ where: { ownerType: 'estoque', warehouseId: { [Op.in]: cityWarehouseIds.length ? cityWarehouseIds : [-1] } }, include: [Material] }),
    StockMovement.findAll({ where: { [Op.and]: [movementOutsideReverse(reverseIds), movementCityWhere] }, include: [Material, { model: Technician, as: 'fromTechnician' }, { model: Technician, as: 'toTechnician' }], order: [['movementAt', 'DESC'], ['createdAt', 'DESC'], ['id', 'DESC']], limit: 12 }),
    MaterialRequest.findAll({ where: requestCityWhere, include: [Technician], order: [['createdAt', 'DESC'], ['id', 'DESC']], limit: 8 }),
    StockBalance.findAll({ include: [Material, Technician] }),
  ]);

  const filteredBalances = balances.filter((row) => {
    if (row.ownerType === 'estoque') return !reverseSet.has(Number(row.warehouseId)) && (!restrictOperationalData || cityWarehouseIds.includes(Number(row.warehouseId)));
    if (row.ownerType === 'tecnico') return !restrictOperationalData || cityTechnicianIds.includes(Number(row.technicianId));
    return false;
  });
  const stockValue = filteredBalances.filter((row) => row.ownerType === 'estoque').reduce((sum, row) => sum + Number(row.quantity || 0) * Number(row.Material?.unitCost || 0), 0)
    + assetsInStock.reduce((sum, asset) => sum + Number(asset.acquisitionCost || asset.Material?.unitCost || 0), 0);
  const custodyValue = assetsWithTech.reduce((sum, asset) => sum + Number(asset.acquisitionCost || asset.Material?.unitCost || 0), 0)
    + filteredBalances.filter((row) => row.ownerType === 'tecnico').reduce((sum, row) => sum + Number(row.quantity || 0) * Number(row.Material?.unitCost || 0), 0);

  const technicianMap = new Map();
  for (const asset of assetsWithTech) {
    const key = asset.Technician?.id || 'sem-tecnico';
    const current = technicianMap.get(key) || { technician: asset.Technician?.name || 'Sem técnico', assets: 0, value: 0 };
    current.assets += 1;
    current.value += Number(asset.acquisitionCost || asset.Material?.unitCost || 0);
    technicianMap.set(key, current);
  }
  for (const row of filteredBalances.filter((item) => item.ownerType === 'tecnico')) {
    const key = row.Technician?.id || 'sem-tecnico';
    const current = technicianMap.get(key) || { technician: row.Technician?.name || 'Sem técnico', assets: 0, value: 0 };
    current.assets += Number(row.quantity || 0);
    current.value += Number(row.quantity || 0) * Number(row.Material?.unitCost || 0);
    technicianMap.set(key, current);
  }

  const queue = [
    hasModuleAccess(req.user, 'approvals') && { label: 'Solicitações para aprovar', value: pendingRequests, route: '/aprovacoes', tone: pendingRequests ? 'warning' : 'success' },
    hasModuleAccess(req.user, 'materialRequests') && { label: 'Separações para entregar', value: approvedRequests, route: '/solicitacoes-material', tone: approvedRequests ? 'warning' : 'success' },
    hasModuleAccess(req.user, 'transfers') && { label: 'Guias sem assinatura', value: pendingSignatures, route: '/transferencias', tone: pendingSignatures ? 'danger' : 'success' },
    hasModuleAccess(req.user, 'serviceOrders') && { label: 'OS abertas/pendentes', value: openOrders, route: '/os', tone: openOrders ? 'warning' : 'success' },
  ].filter(Boolean);

  return ok(res, {
    kpis: { pendingApprovals, pendingRequests, approvedRequests, deliveredRequests, pendingSignatures, openOrders, completedOrders30, unreadNotifications, stockValue, custodyValue, assetsWithTech: assetsWithTech.length, assetsInStock: assetsInStock.length },
    queue,
    custodyRanking: [...technicianMap.values()].sort((a, b) => b.value - a.value).slice(0, 8),
    recentMovements,
    recentRequests,
    selectedCity: selectedCity || null,
    cities,
  });
});
