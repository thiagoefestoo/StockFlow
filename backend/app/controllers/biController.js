const { Op } = require('sequelize');
const {
  Material,
  SerializedAsset,
  StockBalance,
  Technician,
  ContractorCompany,
  Transfer,
  ServiceOrder,
  StockMovement,
  AuditLog,
  StockBatch,
  StockBatchItem,
  TransferItem,
  ServiceOrderMaterial,
  MaterialRequest,
  ApprovalRequest,
} = require('../models');
const asyncHandler = require('../utils/asyncHandler');
const { ok } = require('../utils/response');
const { money, daysBetween } = require('../utils/number');

function asArray(value) {
  if (Array.isArray(value)) return value.filter(Boolean).map(String);
  if (value === undefined || value === null || value === '') return [];
  return String(value).split(',').map((item) => item.trim()).filter(Boolean);
}

function numeric(value) {
  const n = Number(value);
  return Number.isFinite(n) ? n : null;
}

function dateOnly(date) {
  if (!date) return '';
  const d = new Date(date);
  if (Number.isNaN(d.getTime())) return '';
  return d.toISOString().slice(0, 10);
}

function parseDate(value, end = false) {
  if (!value) return null;
  const date = new Date(`${value}T${end ? '23:59:59.999' : '00:00:00.000'}`);
  return Number.isNaN(date.getTime()) ? null : date;
}

function getDateRange(query = {}) {
  const preset = query.periodPreset || '90d';
  const now = new Date();
  let start = null;
  let end = new Date(now);

  if (preset === 'all') end = null;
  if (preset === 'today') start = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  if (preset === '7d') start = new Date(now.getTime() - 7 * 86400000);
  if (preset === '15d') start = new Date(now.getTime() - 15 * 86400000);
  if (preset === '30d') start = new Date(now.getTime() - 30 * 86400000);
  if (preset === '60d') start = new Date(now.getTime() - 60 * 86400000);
  if (preset === '90d') start = new Date(now.getTime() - 90 * 86400000);
  if (preset === '180d') start = new Date(now.getTime() - 180 * 86400000);
  if (preset === 'month') start = new Date(now.getFullYear(), now.getMonth(), 1);
  if (preset === 'lastMonth') {
    start = new Date(now.getFullYear(), now.getMonth() - 1, 1);
    end = new Date(now.getFullYear(), now.getMonth(), 0, 23, 59, 59, 999);
  }
  if (preset === 'year') start = new Date(now.getFullYear(), 0, 1);

  const customStart = parseDate(query.startDate);
  const customEnd = parseDate(query.endDate, true);
  if (preset === 'custom' || customStart || customEnd) {
    if (customStart) start = customStart;
    if (customEnd) end = customEnd;
  }

  return { start, end, preset };
}

function buildFilters(query = {}) {
  const range = getDateRange(query);
  return {
    ...range,
    calculationMode: query.calculationMode || 'competencia',
    technicianIds: asArray(query.technicianId),
    companyIds: asArray(query.companyId),
    materialIds: asArray(query.materialId),
    categories: asArray(query.category),
    requiresSerial: query.requiresSerial === 'true' ? true : query.requiresSerial === 'false' ? false : null,
    ownerTypes: asArray(query.ownerType),
    assetStatuses: asArray(query.assetStatus),
    movementTypes: asArray(query.movementType),
    transferStatuses: asArray(query.transferStatus),
    orderStatuses: asArray(query.orderStatus),
    serviceTypes: asArray(query.serviceType),
    sourceCompanies: asArray(query.sourceCompany),
    fiscalDocumentTypes: asArray(query.fiscalDocumentType),
    conferenceStatuses: asArray(query.conferenceStatus),
    minValue: numeric(query.minValue),
    maxValue: numeric(query.maxValue),
    search: String(query.search || '').trim().toLowerCase(),
  };
}

function matchesSelected(value, selected = []) {
  if (!selected.length) return true;
  if (value === null || value === undefined) return false;
  return selected.includes(String(value));
}

function inDateRange(value, filters) {
  if (!filters.start && !filters.end) return true;
  if (!value) return false;
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return false;
  if (filters.start && date < filters.start) return false;
  if (filters.end && date > filters.end) return false;
  return true;
}

function textIncludes(fields = [], search = '') {
  if (!search) return true;
  return fields.some((field) => String(field || '').toLowerCase().includes(search));
}

function betweenValue(value, filters) {
  const amount = Number(value || 0);
  if (filters.minValue !== null && amount < filters.minValue) return false;
  if (filters.maxValue !== null && amount > filters.maxValue) return false;
  return true;
}

function materialMatches(material, filters) {
  if (!material) return false;
  if (!matchesSelected(material.id, filters.materialIds)) return false;
  if (!matchesSelected(material.category, filters.categories)) return false;
  if (filters.requiresSerial !== null && Boolean(material.requiresSerial) !== filters.requiresSerial) return false;
  if (!textIncludes([material.name, material.sku, material.category], filters.search)) return false;
  return true;
}

function technicianMatches(technician, filters) {
  if (!technician) return !filters.technicianIds.length && !filters.companyIds.length;
  if (!matchesSelected(technician.id, filters.technicianIds)) return false;
  if (!matchesSelected(technician.companyId, filters.companyIds)) return false;
  return true;
}

function transferValue(transfer) {
  return Number(transfer.totalValue || 0);
}

function orderValue(order) {
  return (order.ServiceOrderMaterials || []).reduce((sum, item) => sum + Number(item.totalCost || 0), 0);
}

function movementValue(movement) {
  return Number(movement.SerializedAsset?.acquisitionCost || 0) || Number(movement.quantity || 0) * Number(movement.Material?.unitCost || 0);
}

function rowHasFilteredMaterial(items = [], filters) {
  if (!filters.materialIds.length && !filters.categories.length && filters.requiresSerial === null) return true;
  return items.some((item) => materialMatches(item.Material, { ...filters, search: '' }));
}

function filterBatches(batches, filters) {
  return batches.filter((batch) => {
    if (!inDateRange(batch.receivedAt || batch.createdAt, filters)) return false;
    if (!matchesSelected(batch.sourceCompany, filters.sourceCompanies)) return false;
    if (!matchesSelected(batch.fiscalDocumentType, filters.fiscalDocumentTypes)) return false;
    if (!matchesSelected(batch.conferenceStatus, filters.conferenceStatuses)) return false;
    if (!rowHasFilteredMaterial(batch.StockBatchItems || [], filters)) return false;
    if (!betweenValue(batch.totalValue, filters)) return false;
    if (!textIncludes([batch.receiptNumber, batch.sourceCompany, batch.fiscalDocumentNumber, batch.invoiceAccessKey, batch.fiscalIssuer, batch.notes], filters.search)) return false;
    return true;
  });
}

function filterTransfers(transfers, filters) {
  return transfers.filter((transfer) => {
    const dateField = filters.calculationMode === 'movimento' ? (transfer.signedAt || transfer.deliveredAt || transfer.createdAt) : (transfer.deliveredAt || transfer.createdAt);
    if (!inDateRange(dateField, filters)) return false;
    if (!matchesSelected(transfer.status, filters.transferStatuses)) return false;
    if (!technicianMatches(transfer.Technician, filters)) return false;
    if (!rowHasFilteredMaterial(transfer.TransferItems || [], filters)) return false;
    if (!betweenValue(transfer.totalValue, filters)) return false;
    if (!textIncludes([transfer.transferNumber, transfer.status, transfer.signatureResponsible, transfer.notes, transfer.Technician?.name], filters.search)) return false;
    return true;
  });
}

function filterOrders(orders, filters) {
  return orders.filter((order) => {
    const dateField = filters.calculationMode === 'movimento' ? (order.completedAt || order.createdAt) : (order.createdAt || order.completedAt);
    if (!inDateRange(dateField, filters)) return false;
    if (!matchesSelected(order.status, filters.orderStatuses)) return false;
    if (!matchesSelected(order.serviceType, filters.serviceTypes)) return false;
    if (!technicianMatches(order.Technician, filters)) return false;
    if (!rowHasFilteredMaterial(order.ServiceOrderMaterials || [], filters)) return false;
    if (!betweenValue(orderValue(order), filters)) return false;
    if (!textIncludes([order.osNumber, order.customerName, order.customerCpf, order.city, order.serviceType, order.status, order.notes, order.Technician?.name], filters.search)) return false;
    return true;
  });
}

function filterMovements(movements, filters) {
  return movements.filter((movement) => {
    if (!inDateRange(movement.movementAt || movement.createdAt, filters)) return false;
    if (!matchesSelected(movement.type, filters.movementTypes)) return false;
    if (!matchesSelected(movement.fromOwnerType, filters.ownerTypes) && !matchesSelected(movement.toOwnerType, filters.ownerTypes)) return false;
    if (!materialMatches(movement.Material, { ...filters, search: '' })) return false;
    const fromMatches = technicianMatches(movement.fromTechnician, filters);
    const toMatches = technicianMatches(movement.toTechnician, filters);
    if ((filters.technicianIds.length || filters.companyIds.length) && !fromMatches && !toMatches) return false;
    if (filters.assetStatuses.length && !matchesSelected(movement.SerializedAsset?.status, filters.assetStatuses)) return false;
    if (!betweenValue(movementValue(movement), filters)) return false;
    if (!textIncludes([movement.reference, movement.serialNumber, movement.notes, movement.type, movement.Material?.name, movement.fromTechnician?.name, movement.toTechnician?.name], filters.search)) return false;
    return true;
  });
}

async function getFilterOptions() {
  const [materials, technicians, companies, batches] = await Promise.all([
    Material.findAll({ order: [['name', 'ASC']] }),
    Technician.findAll({ include: [ContractorCompany], order: [['name', 'ASC']] }),
    ContractorCompany.findAll({ order: [['name', 'ASC']] }),
    StockBatch.findAll({ attributes: ['sourceCompany'], order: [['sourceCompany', 'ASC']] }),
  ]);
  return {
    materials: materials.map((m) => ({ id: m.id, name: `${m.name} (${m.sku})`, category: m.category, requiresSerial: m.requiresSerial })),
    technicians: technicians.map((t) => ({ id: t.id, name: `${t.name}${t.ContractorCompany?.name ? ` • ${t.ContractorCompany.name}` : ''}`, companyId: t.companyId })),
    companies: companies.map((c) => ({ id: c.id, name: c.name })),
    categories: [...new Set(materials.map((m) => m.category).filter(Boolean))],
    sourceCompanies: [...new Set(batches.map((b) => b.sourceCompany).filter(Boolean))],
    ownerTypes: ['estoque', 'tecnico', 'cliente', 'fornecedor'],
    assetStatuses: ['em_estoque', 'com_tecnico', 'instalado', 'devolvido', 'manutencao', 'perdido', 'baixado'],
    movementTypes: ['entrada', 'transferencia_tecnico', 'retorno_tecnico', 'baixa_os', 'ajuste', 'perda', 'cancelamento'],
    transferStatuses: ['pendente_assinatura', 'assinado', 'cancelado'],
    orderStatuses: ['aberta', 'concluida', 'cancelada', 'pendente'],
    serviceTypes: ['instalacao', 'manutencao', 'troca_onu', 'retirada', 'outro'],
    fiscalDocumentTypes: ['nota_fiscal', 'termo_entrega', 'romaneio', 'recibo', 'outro'],
    conferenceStatuses: ['pendente_conferencia', 'conferido', 'divergente'],
  };
}

exports.filterOptions = asyncHandler(async (req, res) => ok(res, await getFilterOptions()));

function monthKey(dateValue) {
  const date = dateValue ? new Date(dateValue) : new Date();
  if (Number.isNaN(date.getTime())) return 'sem_data';
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}`;
}

function addToBucket(bucket, key, value) {
  bucket[key] = money(Number(bucket[key] || 0) + Number(value || 0));
  return bucket;
}

function addRowMetric(map, key, patch) {
  if (!map[key]) map[key] = { label: key || 'sem_informacao', entrada: 0, transferencia: 0, baixa: 0, retorno: 0, estoque: 0, tecnico: 0, cliente: 0, perda: 0, total: 0, quantidade: 0 };
  Object.entries(patch || {}).forEach(([field, value]) => {
    map[key][field] = money(Number(map[key][field] || 0) + Number(value || 0));
  });
  return map[key];
}

async function calculateStockPosition(materials, filters = {}) {
  const rows = [];
  const totals = { estoque: 0, tecnico: 0, cliente: 0, manutencao: 0, perdido: 0, totalAtual: 0 };

  for (const material of materials) {
    if (!materialMatches(material, { ...filters, search: '' })) continue;
    const unitCost = Number(material.unitCost || 0);
    let estoqueQty = 0;
    let tecnicoQty = 0;
    let clienteQty = 0;
    let manutencaoQty = 0;
    let perdidoQty = 0;
    let estoqueValue = 0;
    let tecnicoValue = 0;
    let clienteValue = 0;
    let manutencaoValue = 0;
    let perdidoValue = 0;

    if (material.requiresSerial) {
      let assets = await SerializedAsset.findAll({ where: { materialId: material.id }, include: [Technician] });
      assets = assets.filter((asset) => {
        if (!matchesSelected(asset.ownerType, filters.ownerTypes)) return false;
        if (!matchesSelected(asset.status, filters.assetStatuses)) return false;
        if ((filters.technicianIds.length || filters.companyIds.length) && !technicianMatches(asset.Technician, filters)) return false;
        if (!textIncludes([asset.serialNumber, asset.mac, asset.brand, asset.model, asset.customerName, asset.customerCpf, material.name], filters.search)) return false;
        return true;
      });
      assets.forEach((asset) => {
        const value = Number(asset.acquisitionCost || unitCost || 0);
        if (asset.ownerType === 'estoque') { estoqueQty += 1; estoqueValue += value; }
        if (asset.ownerType === 'tecnico') { tecnicoQty += 1; tecnicoValue += value; }
        if (asset.ownerType === 'cliente') { clienteQty += 1; clienteValue += value; }
        if (asset.status === 'manutencao') { manutencaoQty += 1; manutencaoValue += value; }
        if (asset.status === 'perdido' || asset.status === 'baixado') { perdidoQty += 1; perdidoValue += value; }
      });
    } else {
      const balances = await StockBalance.findAll({ where: { materialId: material.id }, include: [Technician] });
      balances.filter((row) => {
        if (!matchesSelected(row.ownerType, filters.ownerTypes)) return false;
        if ((filters.technicianIds.length || filters.companyIds.length) && !technicianMatches(row.Technician, filters)) return false;
        return true;
      }).forEach((row) => {
        const qty = Number(row.quantity || 0);
        if (row.ownerType === 'estoque') { estoqueQty += qty; estoqueValue += qty * unitCost; }
        if (row.ownerType === 'tecnico') { tecnicoQty += qty; tecnicoValue += qty * unitCost; }
      });
    }

    const totalValue = estoqueValue + tecnicoValue + clienteValue + manutencaoValue + perdidoValue;
    totals.estoque += estoqueValue;
    totals.tecnico += tecnicoValue;
    totals.cliente += clienteValue;
    totals.manutencao += manutencaoValue;
    totals.perdido += perdidoValue;
    totals.totalAtual += totalValue;
    rows.push({
      id: material.id,
      sku: material.sku,
      name: material.name,
      category: material.category,
      requiresSerial: material.requiresSerial,
      unitCost: money(unitCost),
      estoqueQty: money(estoqueQty),
      tecnicoQty: money(tecnicoQty),
      clienteQty: money(clienteQty),
      manutencaoQty: money(manutencaoQty),
      perdidoQty: money(perdidoQty),
      estoqueValue: money(estoqueValue),
      tecnicoValue: money(tecnicoValue),
      clienteValue: money(clienteValue),
      manutencaoValue: money(manutencaoValue),
      perdidoValue: money(perdidoValue),
      totalValue: money(totalValue),
      minStock: material.minStock,
    });
  }
  Object.keys(totals).forEach((key) => { totals[key] = money(totals[key]); });
  rows.sort((a, b) => b.totalValue - a.totalValue);
  return { rows, totals };
}

async function loadBiData(filters) {
  let materials = await Material.findAll({ order: [['name', 'ASC']] });
  materials = materials.filter((m) => materialMatches(m, { ...filters, search: filters.search && (filters.materialIds.length || filters.categories.length || filters.requiresSerial !== null) ? filters.search : '' }));
  let [batches, transfers, orders, movements, technicians, materialRequests, approvalRequests] = await Promise.all([
    StockBatch.findAll({ include: [{ model: StockBatchItem, include: [Material] }, { association: 'createdBy' }], order: [['receivedAt', 'DESC'], ['createdAt', 'DESC']], limit: 2000 }),
    Transfer.findAll({ include: [Technician, { model: TransferItem, include: [Material, SerializedAsset] }], order: [['deliveredAt', 'DESC'], ['createdAt', 'DESC']], limit: 2000 }),
    ServiceOrder.findAll({ include: [Technician, { model: ServiceOrderMaterial, include: [Material, SerializedAsset] }], order: [['createdAt', 'DESC']], limit: 2000 }),
    StockMovement.findAll({ include: [Material, SerializedAsset, { model: Technician, as: 'fromTechnician' }, { model: Technician, as: 'toTechnician' }, { association: 'createdBy' }], order: [['movementAt', 'DESC']], limit: 3000 }),
    Technician.findAll({ include: [ContractorCompany], order: [['name', 'ASC']] }),
    MaterialRequest.findAll({ include: [Technician], order: [['createdAt', 'DESC']], limit: 1000 }),
    ApprovalRequest.findAll({ order: [['createdAt', 'DESC']], limit: 1000 }),
  ]);
  batches = filterBatches(batches, filters);
  transfers = filterTransfers(transfers, filters);
  orders = filterOrders(orders, filters);
  movements = filterMovements(movements, filters);
  technicians = technicians.filter((tech) => technicianMatches(tech, filters) && textIncludes([tech.name, tech.document, tech.email, tech.ContractorCompany?.name], filters.search || ''));
  materialRequests = materialRequests.filter((request) => technicianMatches(request.Technician, filters) && inDateRange(request.createdAt, filters));
  approvalRequests = approvalRequests.filter((approval) => inDateRange(approval.createdAt, filters));
  return { materials, batches, transfers, orders, movements, technicians, materialRequests, approvalRequests };
}

async function summarizeMaterials(filters) {
  const materials = (await Material.findAll({ order: [['name', 'ASC']] })).filter((material) => materialMatches(material, { ...filters, search: '' }));
  const stockPosition = await calculateStockPosition(materials, filters);
  return stockPosition.rows.map((row) => ({
    id: row.id,
    name: row.name,
    sku: row.sku,
    category: row.category,
    requiresSerial: row.requiresSerial,
    estoque: row.estoqueQty,
    tecnico: row.tecnicoQty,
    instalado: row.clienteQty,
    valorTecnico: row.tecnicoValue,
  }));
}

exports.executive = asyncHandler(async (req, res) => {
  const filters = buildFilters(req.query);
  const { transfers, orders, movements, technicians } = await loadBiData(filters);
  const materialRows = await summarizeMaterials(filters);
  const stockPosition = await calculateStockPosition(await Material.findAll({ order: [['name', 'ASC']] }), filters);
  const totalAssets = stockPosition.rows.reduce((sum, row) => sum + Number(row.estoqueQty || 0) + Number(row.tecnicoQty || 0) + Number(row.clienteQty || 0), 0);
  const assetsInStock = stockPosition.rows.reduce((sum, row) => sum + Number(row.estoqueQty || 0), 0);
  const assetsWithTechnicians = stockPosition.rows.reduce((sum, row) => sum + Number(row.tecnicoQty || 0), 0);
  const installedAssets = stockPosition.rows.reduce((sum, row) => sum + Number(row.clienteQty || 0), 0);
  const lostAssets = stockPosition.rows.reduce((sum, row) => sum + Number(row.perdidoQty || 0), 0);
  const lostValue = money(stockPosition.totals.perdido || 0);
  const pendingSignatures = transfers.filter((transfer) => transfer.status === 'pendente_assinatura').length;
  const osMonth = orders.length;
  const custodyRiskAssets = await SerializedAsset.findAll({ where: { ownerType: 'tecnico', custodyStartedAt: { [Op.lte]: new Date(Date.now() - 60 * 24 * 60 * 60 * 1000) } }, include: [Material, Technician] });
  const custody60 = custodyRiskAssets.filter((asset) => materialMatches(asset.Material, { ...filters, search: '' }) && technicianMatches(asset.Technician, filters)).length;
  const technicianRows = [];
  for (const tech of technicians) {
    const assets = await SerializedAsset.findAll({ where: { ownerType: 'tecnico', technicianId: tech.id }, include: [Material] });
    const filteredAssets = assets.filter((asset) => materialMatches(asset.Material, { ...filters, search: '' }) && matchesSelected(asset.status, filters.assetStatuses) && textIncludes([asset.serialNumber, asset.mac, asset.Material?.name], filters.search));
    const assetValue = money(filteredAssets.reduce((sum, asset) => sum + Number(asset.acquisitionCost || asset.Material?.unitCost || 0), 0));
    const osCount = orders.filter((order) => order.technicianId === tech.id).length;
    technicianRows.push({ id: tech.id, name: tech.name, company: tech.ContractorCompany?.name || '-', assetCount: filteredAssets.length, assetValue, osCount });
  }
  technicianRows.sort((a, b) => b.assetValue - a.assetValue);
  const assetsByOwner = ['estoque', 'tecnico', 'cliente', 'manutencao', 'perdido'].map((ownerType) => ({ ownerType, total: ownerType === 'estoque' ? assetsInStock : ownerType === 'tecnico' ? assetsWithTechnicians : ownerType === 'cliente' ? installedAssets : stockPosition.totals[ownerType] || 0 }));
  const statusMap = {};
  stockPosition.rows.forEach((row) => {
    statusMap.estoque = Number(statusMap.estoque || 0) + Number(row.estoqueQty || 0);
    statusMap.tecnico = Number(statusMap.tecnico || 0) + Number(row.tecnicoQty || 0);
    statusMap.cliente = Number(statusMap.cliente || 0) + Number(row.clienteQty || 0);
  });
  const assetsByStatus = Object.entries(statusMap).map(([status, total]) => ({ status, total }));
  return ok(res, {
    cards: { totalAssets: money(totalAssets), assetsInStock: money(assetsInStock), assetsWithTechnicians: money(assetsWithTechnicians), installedAssets: money(installedAssets), lostAssets: money(lostAssets), lostValue, patrimonyInTechnicians: stockPosition.totals.tecnico, patrimonyTotal: stockPosition.totals.totalAtual, pendingSignatures, osMonth, custody60 },
    materials: materialRows,
    topTechnicians: technicianRows.slice(0, 10),
    transfers: transfers.map((t) => t.toJSON()),
    orders: orders.map((o) => o.toJSON()),
    movements: movements.map((m) => m.toJSON()),
    assetsByOwner,
    assetsByStatus,
    filtersApplied: { ...req.query, startDate: dateOnly(filters.start), endDate: dateOnly(filters.end) },
    generatedAt: new Date().toISOString(),
  });
});

exports.technicians = asyncHandler(async (req, res) => {
  const filters = buildFilters(req.query);
  const { technicians, transfers, orders } = await loadBiData(filters);
  const rows = [];
  for (const tech of technicians) {
    const assets = await SerializedAsset.findAll({ where: { technicianId: tech.id, ownerType: 'tecnico' }, include: [Material] });
    const filteredAssets = assets.filter((asset) => materialMatches(asset.Material, { ...filters, search: '' }) && matchesSelected(asset.status, filters.assetStatuses) && textIncludes([asset.serialNumber, asset.Material?.name], filters.search));
    const balanceRows = await StockBalance.findAll({ where: { ownerType: 'tecnico', technicianId: tech.id }, include: [Material] });
    const consumables = balanceRows.filter((row) => materialMatches(row.Material, { ...filters, search: '' }));
    const assetValue = money(filteredAssets.reduce((sum, asset) => sum + Number(asset.acquisitionCost || asset.Material?.unitCost || 0), 0) + consumables.reduce((sum, row) => sum + Number(row.quantity || 0) * Number(row.Material?.unitCost || 0), 0));
    const oldAssets = filteredAssets.filter((a) => daysBetween(a.custodyStartedAt) >= 60).length;
    const osForTech = orders.filter((order) => order.technicianId === tech.id);
    const transferForTech = transfers.filter((transfer) => transfer.technicianId === tech.id);
    const osTotal = osForTech.length;
    const osMonth = osForTech.filter((order) => inDateRange(order.createdAt, filters)).length;
    const lastOrder = osForTech[0];
    rows.push({ id: tech.id, name: tech.name, type: tech.type, status: tech.status, company: tech.ContractorCompany?.name || '-', assetCount: filteredAssets.length + consumables.length, assetValue, oldAssets, osTotal, osMonth, transferCount: transferForTech.length, lastOrderAt: lastOrder?.createdAt || null, score: osMonth * 10 - oldAssets * 3 + filteredAssets.length });
  }
  rows.sort((a, b) => b.score - a.score);
  const typeDistribution = rows.reduce((acc, r) => ({ ...acc, [r.type || 'sem_tipo']: (acc[r.type || 'sem_tipo'] || 0) + 1 }), {});
  const statusDistribution = rows.reduce((acc, r) => ({ ...acc, [r.status || 'sem_status']: (acc[r.status || 'sem_status'] || 0) + 1 }), {});
  const companyDistribution = rows.reduce((acc, r) => ({ ...acc, [r.company || '-']: (acc[r.company || '-'] || 0) + 1 }), {});
  return ok(res, {
    technicians: rows,
    averageValue: money(rows.reduce((sum, r) => sum + Number(r.assetValue || 0), 0) / Math.max(rows.length, 1)),
    typeDistribution,
    statusDistribution,
    companyDistribution,
    filtersApplied: { ...req.query, startDate: dateOnly(filters.start), endDate: dateOnly(filters.end) },
    generatedAt: new Date().toISOString(),
  });
});

exports.audit = asyncHandler(async (req, res) => {
  const filters = buildFilters(req.query);
  const { transfers, movements } = await loadBiData(filters);
  const auditRowsRaw = await AuditLog.findAll({ include: [{ association: 'actor' }], order: [['createdAt', 'DESC']], limit: 2000 });
  const auditRows = auditRowsRaw.filter((row) => inDateRange(row.createdAt, filters) && textIncludes([row.action, row.entity, row.entityId, row.message, row.actor?.name, row.actor?.email], filters.search));
  const movementsByTypeMap = movements.reduce((acc, row) => ({ ...acc, [row.type || 'sem_tipo']: (acc[row.type || 'sem_tipo'] || 0) + 1 }), {});
  const auditByActionMap = auditRows.reduce((acc, row) => ({ ...acc, [row.action || 'sem_acao']: (acc[row.action || 'sem_acao'] || 0) + 1 }), {});
  const oldestCustodyRaw = await SerializedAsset.findAll({ where: { ownerType: 'tecnico' }, include: [Material, Technician], order: [['custodyStartedAt', 'ASC']], limit: 500 });
  const oldestCustody = oldestCustodyRaw.filter((asset) => materialMatches(asset.Material, { ...filters, search: '' }) && technicianMatches(asset.Technician, filters) && matchesSelected(asset.status, filters.assetStatuses) && textIncludes([asset.serialNumber, asset.mac, asset.Material?.name, asset.Technician?.name], filters.search));
  const assetsByStatusMap = oldestCustody.reduce((acc, asset) => ({ ...acc, [asset.status || 'sem_status']: (acc[asset.status || 'sem_status'] || 0) + 1 }), {});
  return ok(res, {
    movementsByType: Object.entries(movementsByTypeMap).map(([type, total]) => ({ type, total })),
    auditByAction: Object.entries(auditByActionMap).map(([action, total]) => ({ action, total })),
    recentTransfers: transfers.slice(0, 100),
    assetsByStatus: Object.entries(assetsByStatusMap).map(([status, total]) => ({ status, total })),
    oldestCustody: oldestCustody.slice(0, 100).map((a) => ({ ...a.toJSON(), custodyDays: daysBetween(a.custodyStartedAt) })),
    auditRows: auditRows.slice(0, 250),
    filtersApplied: { ...req.query, startDate: dateOnly(filters.start), endDate: dateOnly(filters.end) },
    generatedAt: new Date().toISOString(),
  });
});

exports.financial = asyncHandler(async (req, res) => {
  const filters = buildFilters(req.query);
  const { materials, batches, transfers, orders, movements, technicians, materialRequests, approvalRequests } = await loadBiData(filters);
  const stockPosition = await calculateStockPosition(materials, filters);
  const confirmedBatches = batches.filter((batch) => batch.status !== 'cancelado');
  const totalEntries = money(confirmedBatches.reduce((sum, batch) => sum + Number(batch.totalValue || 0), 0));
  const totalTransfers = money(transfers.filter((transfer) => transfer.status !== 'cancelado').reduce((sum, transfer) => sum + Number(transfer.totalValue || 0), 0));
  const totalConsumed = money(orders.reduce((sum, order) => sum + orderValue(order), 0));
  const consumedCompleted = money(orders.filter((order) => order.status === 'concluida').reduce((sum, order) => sum + orderValue(order), 0));
  const pendingSignatureValue = money(transfers.filter((transfer) => transfer.status === 'pendente_assinatura').reduce((sum, transfer) => sum + Number(transfer.totalValue || 0), 0));
  const requestPipeline = money(materialRequests.filter((request) => !['cancelado', 'entregue'].includes(request.status)).reduce((sum, request) => sum + Number(request.totalValue || 0), 0));
  const approvalsPendingAmount = money(approvalRequests.filter((approval) => approval.status === 'pendente').reduce((sum, approval) => sum + Number(approval.amount || 0), 0));
  const custodyRiskAssetsRaw = await SerializedAsset.findAll({ where: { ownerType: 'tecnico', custodyStartedAt: { [Op.lte]: new Date(Date.now() - 60 * 24 * 60 * 60 * 1000) } }, include: [Material, Technician], order: [['custodyStartedAt', 'ASC']] });
  const custodyRiskAssets = custodyRiskAssetsRaw.filter((asset) => materialMatches(asset.Material, { ...filters, search: '' }) && technicianMatches(asset.Technician, filters) && matchesSelected(asset.status, filters.assetStatuses) && textIncludes([asset.serialNumber, asset.mac, asset.Material?.name, asset.Technician?.name], filters.search));
  const custodyRiskValue = money(custodyRiskAssets.reduce((sum, asset) => sum + Number(asset.acquisitionCost || asset.Material?.unitCost || 0), 0));
  const lostValue = money(stockPosition.totals.perdido || 0);
  const blockedCapital = money(stockPosition.totals.tecnico + pendingSignatureValue + custodyRiskValue);
  const financialCoverage = totalEntries ? money((stockPosition.totals.totalAtual / totalEntries) * 100) : 0;
  const consumptionRate = totalEntries ? money((totalConsumed / totalEntries) * 100) : 0;

  const monthFlow = {};
  confirmedBatches.forEach((batch) => addToBucket(addRowMetric(monthFlow, monthKey(batch.receivedAt), {}), 'entrada', Number(batch.totalValue || 0)));
  transfers.filter((transfer) => transfer.status !== 'cancelado').forEach((transfer) => addToBucket(addRowMetric(monthFlow, monthKey(transfer.deliveredAt || transfer.createdAt), {}), 'transferencia', Number(transfer.totalValue || 0)));
  orders.forEach((order) => addToBucket(addRowMetric(monthFlow, monthKey(order.completedAt || order.createdAt), {}), 'baixa', orderValue(order)));
  movements.forEach((movement) => {
    const value = movementValue(movement);
    if (movement.type === 'retorno_tecnico') addToBucket(addRowMetric(monthFlow, monthKey(movement.movementAt), {}), 'retorno', value);
    if (movement.type === 'perda') addToBucket(addRowMetric(monthFlow, monthKey(movement.movementAt), {}), 'perda', value);
  });
  const flowByMonth = Object.keys(monthFlow).sort().map((key) => ({ month: key, ...monthFlow[key] }));

  const categoryMap = {};
  confirmedBatches.forEach((batch) => (batch.StockBatchItems || []).forEach((item) => {
    if (materialMatches(item.Material, { ...filters, search: '' })) addRowMetric(categoryMap, item.Material?.category || 'outro', { entrada: Number(item.totalCost || 0), total: Number(item.totalCost || 0), quantidade: Number(item.quantity || 0) });
  }));
  stockPosition.rows.forEach((row) => addRowMetric(categoryMap, row.category || 'outro', { estoque: row.estoqueValue, tecnico: row.tecnicoValue, cliente: row.clienteValue, total: row.totalValue }));
  orders.forEach((order) => (order.ServiceOrderMaterials || []).forEach((item) => {
    if (materialMatches(item.Material, { ...filters, search: '' })) addRowMetric(categoryMap, item.Material?.category || 'outro', { baixa: Number(item.totalCost || 0), total: Number(item.totalCost || 0), quantidade: Number(item.quantity || 0) });
  }));
  const byCategory = Object.values(categoryMap).sort((a, b) => Number(b.total || 0) - Number(a.total || 0));

  const technicianFinance = [];
  for (const tech of technicians) {
    const assets = await SerializedAsset.findAll({ where: { ownerType: 'tecnico', technicianId: tech.id }, include: [Material] });
    const filteredAssets = assets.filter((asset) => materialMatches(asset.Material, { ...filters, search: '' }) && matchesSelected(asset.status, filters.assetStatuses));
    const assetValue = money(filteredAssets.reduce((sum, asset) => sum + Number(asset.acquisitionCost || asset.Material?.unitCost || 0), 0));
    const balanceRows = await StockBalance.findAll({ where: { ownerType: 'tecnico', technicianId: tech.id }, include: [Material] });
    const consumableValue = money(balanceRows.filter((row) => materialMatches(row.Material, { ...filters, search: '' })).reduce((sum, row) => sum + Number(row.quantity || 0) * Number(row.Material?.unitCost || 0), 0));
    const transferValue = money(transfers.filter((transfer) => transfer.technicianId === tech.id && transfer.status !== 'cancelado').reduce((sum, transfer) => sum + Number(transfer.totalValue || 0), 0));
    const consumedValue = money(orders.filter((order) => order.technicianId === tech.id).reduce((sum, order) => sum + orderValue(order), 0));
    const pendingValue = money(transfers.filter((transfer) => transfer.technicianId === tech.id && transfer.status === 'pendente_assinatura').reduce((sum, transfer) => sum + Number(transfer.totalValue || 0), 0));
    const oldValue = money(custodyRiskAssets.filter((asset) => asset.technicianId === tech.id).reduce((sum, asset) => sum + Number(asset.acquisitionCost || 0), 0));
    technicianFinance.push({ id: tech.id, name: tech.name, company: tech.ContractorCompany?.name || '-', status: tech.status, assetValue, consumableValue, custodyValue: money(assetValue + consumableValue), transferValue, consumedValue, pendingSignatureValue: pendingValue, oldCustodyValue: oldValue, openFinancialRisk: money(pendingValue + oldValue) });
  }
  technicianFinance.sort((a, b) => b.custodyValue - a.custodyValue);

  const materialFinance = stockPosition.rows.map((row) => ({
    ...row,
    entryValue: money(confirmedBatches.reduce((sum, batch) => sum + (batch.StockBatchItems || []).filter((item) => item.materialId === row.id).reduce((s, item) => s + Number(item.totalCost || 0), 0), 0)),
    transferValue: money((transfers || []).reduce((sum, transfer) => sum + (transfer.TransferItems || []).filter((item) => item.materialId === row.id).reduce((s, item) => s + Number(item.totalCost || 0), 0), 0)),
    consumedValue: money((orders || []).reduce((sum, order) => sum + (order.ServiceOrderMaterials || []).filter((item) => item.materialId === row.id).reduce((s, item) => s + Number(item.totalCost || 0), 0), 0)),
  })).sort((a, b) => b.entryValue - a.entryValue);

  const transferStatusValue = transfers.reduce((acc, transfer) => addToBucket(acc, transfer.status || 'sem_status', Number(transfer.totalValue || 0)), {});
  const orderStatusCost = orders.reduce((acc, order) => addToBucket(acc, order.status || 'sem_status', orderValue(order)), {});
  const movementTypeValue = movements.reduce((acc, movement) => addToBucket(acc, movement.type || 'sem_tipo', movementValue(movement)), {});
  const sourceCompanyValue = confirmedBatches.reduce((acc, batch) => addToBucket(acc, batch.sourceCompany || 'sem_fornecedor', Number(batch.totalValue || 0)), {});

  const lowStockRows = stockPosition.rows.filter((row) => Number(row.estoqueQty || 0) <= Number(row.minStock || 0) && Number(row.minStock || 0) > 0).map((row) => ({ ...row, missingQty: money(Math.max(0, Number(row.minStock || 0) - Number(row.estoqueQty || 0))), replenishmentValue: money(Math.max(0, Number(row.minStock || 0) - Number(row.estoqueQty || 0)) * Number(row.unitCost || 0)) }));
  const replenishmentNeed = money(lowStockRows.reduce((sum, row) => sum + Number(row.replenishmentValue || 0), 0));
  const recentEntries = batches.slice(0, 50).map((batch) => ({ id: batch.id, receiptNumber: batch.receiptNumber, sourceCompany: batch.sourceCompany, receivedAt: batch.receivedAt, status: batch.status, fiscalDocumentType: batch.fiscalDocumentType, fiscalDocumentNumber: batch.fiscalDocumentNumber, proofAttachmentName: batch.proofAttachmentName, totalItems: money(batch.totalItems || 0), totalValue: money(batch.totalValue || 0) }));
  const recentTransfers = transfers.slice(0, 50).map((transfer) => ({ id: transfer.id, transferNumber: transfer.transferNumber, technician: transfer.Technician?.name || '-', status: transfer.status, deliveredAt: transfer.deliveredAt, signedAt: transfer.signedAt, totalQuantity: money(transfer.totalQuantity || 0), totalValue: money(transfer.totalValue || 0) }));
  const recentConsumption = orders.slice(0, 50).map((order) => ({ id: order.id, osNumber: order.osNumber, technician: order.Technician?.name || '-', customerName: order.customerName, serviceType: order.serviceType, status: order.status, totalCost: money(orderValue(order)), completedAt: order.completedAt, createdAt: order.createdAt }));
  const cards = { totalEntries, totalTransfers, totalConsumed, consumedCompleted, currentStockValue: stockPosition.totals.estoque, technicianBoxValue: stockPosition.totals.tecnico, installedCustomerValue: stockPosition.totals.cliente, currentPositionValue: stockPosition.totals.totalAtual, pendingSignatureValue, requestPipeline, approvalsPendingAmount, custodyRiskValue, lostValue, replenishmentNeed, blockedCapital, financialCoverage, consumptionRate };
  const insights = [];
  if (pendingSignatureValue > 0) insights.push({ tone: 'warning', title: 'Guias pendentes com impacto financeiro', text: `Existem ${new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(pendingSignatureValue)} em guias ainda sem assinatura.` });
  if (custodyRiskValue > 0) insights.push({ tone: 'danger', title: 'Capital parado em campo', text: `Materiais com mais de 60 dias na caixa somam ${new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(custodyRiskValue)}.` });
  if (replenishmentNeed > 0) insights.push({ tone: 'info', title: 'Necessidade de reposição', text: `Estoque abaixo do mínimo sugere reposição estimada de ${new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(replenishmentNeed)}.` });
  if (totalEntries > 0) insights.push({ tone: 'success', title: 'Cobertura financeira rastreada', text: `${Number(financialCoverage).toFixed(1)}% do valor de entrada permanece rastreado em estoque, técnico, cliente ou status patrimonial.` });
  if (filters.search) insights.push({ tone: 'info', title: 'Busca aplicada', text: `Resultados filtrados por “${filters.search}”.` });

  return ok(res, { cards, flowByMonth, byCategory, stockPosition: stockPosition.rows, stockTotals: stockPosition.totals, technicianFinance, materialFinance, transferStatusValue, orderStatusCost, movementTypeValue, sourceCompanyValue, lowStockRows, custodyRiskAssets: custodyRiskAssets.map((asset) => ({ id: asset.id, serialNumber: asset.serialNumber, material: asset.Material?.name || '-', technician: asset.Technician?.name || '-', acquisitionCost: money(asset.acquisitionCost || asset.Material?.unitCost || 0), custodyDays: daysBetween(asset.custodyStartedAt), custodyStartedAt: asset.custodyStartedAt })), recentEntries, recentTransfers, recentConsumption, insights, filtersApplied: { ...req.query, startDate: dateOnly(filters.start), endDate: dateOnly(filters.end) }, generatedAt: new Date().toISOString() });
});
