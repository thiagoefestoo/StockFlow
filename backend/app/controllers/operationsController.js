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
  Notification,
} = require('../models');
const asyncHandler = require('../utils/asyncHandler');
const { ok } = require('../utils/response');
const { userWarehouseIds } = require('../utils/warehouseAccess');
const { hasModuleAccess } = require('../config/modulePermissions');


function isManager(user) {
  return ['admin', 'supervisor', 'estoquista'].includes(user?.role);
}

function requestScopeFor(user) {
  if (user?.role === 'tecnico') return { technicianId: user.technicianId || -1 };
  if (user?.role === 'estoquista') {
    const ids = userWarehouseIds(user);
    return ids.length ? { warehouseId: { [Op.in]: ids } } : { warehouseId: -1 };
  }
  return {};
}

function transferScopeFor(user) {
  if (user?.role === 'tecnico') return { technicianId: user.technicianId || -1 };
  if (user?.role === 'estoquista') {
    const ids = userWarehouseIds(user);
    return ids.length ? { warehouseId: { [Op.in]: ids } } : { warehouseId: -1 };
  }
  return {};
}

function notificationVisibilityWhere(user) {
  return {
    [Op.or]: [
      { userId: user.id },
      { userId: null, role: 'todos' },
      { userId: null, role: user.role },
      ...(user.role === 'admin' ? [{ userId: null, role: 'supervisor' }] : []),
    ],
  };
}

function positiveOnly(value) {
  return Number(value || 0) > 0 ? Number(value || 0) : 0;
}

function setRouteIfAllowed(routes, user, moduleKey, route, value) {
  if (hasModuleAccess(user, moduleKey)) routes[route] = positiveOnly(value);
}

exports.pendingMenu = asyncHandler(async (req, res) => {
  const user = req.user;
  const routes = {};

  if (isManager(user)) {
    const requestScope = requestScopeFor(user);
    const transferScope = transferScopeFor(user);

    const [
      pendingApprovals,
      approvedMaterialRequests,
      pendingRequestApprovals,
      pendingTransferSignatures,
      pendingLossSignatures,
      openOrders,
    ] = await Promise.all([
      ApprovalRequest.count({ where: { status: 'pendente' } }),
      MaterialRequest.count({ where: { ...requestScope, status: 'aprovado' } }),
      MaterialRequest.count({ where: { ...requestScope, status: 'pendente_aprovacao' } }),
      Transfer.count({ where: { ...transferScope, status: 'pendente_assinatura', transferNumber: { [Op.notILike]: 'PERDA-%' } } }),
      Transfer.count({ where: { ...transferScope, status: 'pendente_assinatura', transferNumber: { [Op.iLike]: 'PERDA-%' } } }),
      ServiceOrder.count({ where: { status: { [Op.in]: ['aberta', 'pendente'] } } }),
    ]);

    setRouteIfAllowed(routes, user, 'approvals', '/aprovacoes', pendingApprovals || pendingRequestApprovals);
    setRouteIfAllowed(routes, user, 'materialRequests', '/solicitacoes-material', approvedMaterialRequests);
    setRouteIfAllowed(routes, user, 'transfers', '/transferencias', pendingTransferSignatures);
    setRouteIfAllowed(routes, user, 'technicianLosses', '/perdas-tecnico', pendingLossSignatures);
    setRouteIfAllowed(routes, user, 'lossEvaluation', '/avaliacao-perdas', pendingLossSignatures);
    setRouteIfAllowed(routes, user, 'serviceOrders', '/os', openOrders);
  } else if (user?.role === 'tecnico') {
    const requestScope = requestScopeFor(user);
    const transferScope = transferScopeFor(user);

    const [
      requestsInProgress,
      pendingSignatures,
      unreadNotifications,
      openOrders,
    ] = await Promise.all([
      MaterialRequest.count({ where: { ...requestScope, status: { [Op.in]: ['pendente_aprovacao', 'aprovado'] } } }),
      Transfer.count({ where: { ...transferScope, status: 'pendente_assinatura' } }),
      Notification.count({ where: { ...notificationVisibilityWhere(user), status: 'nao_lida' } }),
      ServiceOrder.count({ where: { technicianId: user.technicianId || -1, status: { [Op.in]: ['aberta', 'pendente'] } } }),
    ]);

    setRouteIfAllowed(routes, user, 'materialRequests', '/solicitacoes-material', requestsInProgress);
    setRouteIfAllowed(routes, user, 'technicianInbox', '/caixa-tecnico', pendingSignatures + unreadNotifications + openOrders);
  }

  const total = Object.values(routes).reduce((sum, value) => sum + Number(value || 0), 0);
  return ok(res, { total, routes, updatedAt: new Date().toISOString() });
});

exports.cockpit = asyncHandler(async (req, res) => {
  const today = new Date();
  const last30 = new Date(today.getTime() - 30 * 24 * 60 * 60 * 1000);

  const [
    pendingRequests,
    approvedRequests,
    deliveredRequests,
    pendingApprovals,
    pendingSignatures,
    openOrders,
    completedOrders30,
    unreadNotifications,
    assetsWithTech,
    assetsInStock,
    recentMovements,
    recentRequests,
  ] = await Promise.all([
    MaterialRequest.count({ where: { status: 'pendente_aprovacao' } }),
    MaterialRequest.count({ where: { status: 'aprovado' } }),
    MaterialRequest.count({ where: { status: 'entregue' } }),
    ApprovalRequest.count({ where: { status: 'pendente' } }),
    Transfer.count({ where: { status: 'pendente_assinatura' } }),
    ServiceOrder.count({ where: { status: { [Op.in]: ['aberta', 'pendente'] } } }),
    ServiceOrder.count({ where: { status: 'concluida', completedAt: { [Op.gte]: last30 } } }),
    Notification.count({ where: { status: 'nao_lida' } }),
    SerializedAsset.findAll({ where: { ownerType: 'tecnico' }, include: [Material, Technician] }),
    SerializedAsset.findAll({ where: { ownerType: 'estoque' }, include: [Material] }),
    StockMovement.findAll({ include: [Material, { model: Technician, as: 'fromTechnician' }, { model: Technician, as: 'toTechnician' }], order: [['movementAt', 'DESC']], limit: 12 }),
    MaterialRequest.findAll({ include: [Technician], order: [['createdAt', 'DESC']], limit: 8 }),
  ]);

  const balances = await StockBalance.findAll({ include: [Material, Technician] });
  const stockValue = balances.reduce((sum, row) => sum + Number(row.quantity || 0) * Number(row.Material?.unitCost || 0), 0)
    + assetsInStock.reduce((sum, asset) => sum + Number(asset.acquisitionCost || asset.Material?.unitCost || 0), 0);
  const custodyValue = assetsWithTech.reduce((sum, asset) => sum + Number(asset.acquisitionCost || asset.Material?.unitCost || 0), 0)
    + balances.filter((row) => row.ownerType === 'tecnico').reduce((sum, row) => sum + Number(row.quantity || 0) * Number(row.Material?.unitCost || 0), 0);

  const technicianMap = new Map();
  for (const asset of assetsWithTech) {
    const key = asset.Technician?.id || 'sem-tecnico';
    const current = technicianMap.get(key) || { technician: asset.Technician?.name || 'Sem técnico', assets: 0, value: 0 };
    current.assets += 1;
    current.value += Number(asset.acquisitionCost || asset.Material?.unitCost || 0);
    technicianMap.set(key, current);
  }
  for (const row of balances.filter((item) => item.ownerType === 'tecnico')) {
    const key = row.Technician?.id || 'sem-tecnico';
    const current = technicianMap.get(key) || { technician: row.Technician?.name || 'Sem técnico', assets: 0, value: 0 };
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
    kpis: {
      pendingApprovals,
      pendingRequests,
      approvedRequests,
      deliveredRequests,
      pendingSignatures,
      openOrders,
      completedOrders30,
      unreadNotifications,
      stockValue,
      custodyValue,
      assetsWithTech: assetsWithTech.length,
      assetsInStock: assetsInStock.length,
    },
    queue,
    custodyRanking: [...technicianMap.values()].sort((a, b) => b.value - a.value).slice(0, 8),
    recentMovements,
    recentRequests,
  });
});
