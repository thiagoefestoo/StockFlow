const { Op, fn, col } = require('sequelize');
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
  TechnicianTool,
  Warehouse,
} = require('../models');
const asyncHandler = require('../utils/asyncHandler');
const { ok } = require('../utils/response');
const { money, daysBetween } = require('../utils/number');
const { reverseWarehouseIds, warehouseOutsideReverse, movementOutsideReverse } = require('../utils/reverseLogistics');
const { warehouseListWhere, isPrivileged } = require('../utils/warehouseAccess');

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
    city: String(query.city || '').trim(),
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


async function resolveCityScope(filters = {}, user = null) {
  const city = String(filters.city || '').trim();
  const restrictedByAccount = !isPrivileged(user);
  const cityRestricted = restrictedByAccount || Boolean(city);

  if (!cityRestricted) {
    return { ...filters, cityRestricted: false, warehouseIds: [], technicianCityIds: [], cityOsNumbers: [] };
  }

  const warehouseClauses = [
    { isReverseLogistics: false, status: 'ativo' },
  ];
  if (restrictedByAccount) warehouseClauses.push(warehouseListWhere(user));
  if (city) warehouseClauses.push({ city: { [Op.iLike]: city } });

  const warehouses = await Warehouse.findAll({
    where: { [Op.and]: warehouseClauses },
    attributes: ['id'],
    raw: true,
  });
  const warehouseIds = warehouses.map((row) => Number(row.id)).filter(Number.isFinite);
  const technicians = warehouseIds.length
    ? await Technician.findAll({
        where: { defaultWarehouseId: { [Op.in]: warehouseIds } },
        attributes: ['id'],
        raw: true,
      })
    : [];
  const technicianCityIds = technicians.map((row) => Number(row.id)).filter(Number.isFinite);
  const orders = warehouseIds.length
    ? await ServiceOrder.findAll({
        where: { warehouseId: { [Op.in]: warehouseIds } },
        attributes: ['osNumber'],
        raw: true,
      })
    : [];
  const cityOsNumbers = orders.map((row) => String(row.osNumber || '').trim()).filter(Boolean);
  return { ...filters, cityRestricted: true, warehouseIds, technicianCityIds, cityOsNumbers };
}

function cityMatchesTechnician(technician, filters) {
  if (!filters.cityRestricted) return true;
  return filters.technicianCityIds.includes(Number(technician?.id));
}

function cityMatchesWarehouseId(warehouseId, filters) {
  if (!filters.cityRestricted) return true;
  return filters.warehouseIds.includes(Number(warehouseId));
}

function cityMatchesOrder(order, filters) {
  if (!filters.cityRestricted) return true;
  if (cityMatchesWarehouseId(order?.warehouseId, filters)) return true;
  return Boolean(filters.city)
    && String(order?.city || '').trim().toLowerCase() === String(filters.city).trim().toLowerCase();
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
    if (!cityMatchesWarehouseId(batch.warehouseId, filters)) return false;
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
    if (filters.cityRestricted && !cityMatchesWarehouseId(transfer.warehouseId, filters) && !filters.technicianCityIds.includes(Number(transfer.technicianId))) return false;
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
    if (!cityMatchesOrder(order, filters)) return false;
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
    if (filters.cityRestricted) {
      const warehouseMatch = cityMatchesWarehouseId(movement.fromWarehouseId, filters) || cityMatchesWarehouseId(movement.toWarehouseId, filters);
      const technicianMatch = filters.technicianCityIds.includes(Number(movement.fromTechnicianId)) || filters.technicianCityIds.includes(Number(movement.toTechnicianId));
      const osMatch = filters.cityOsNumbers.includes(String(movement.reference || '').trim());
      if (!warehouseMatch && !technicianMatch && !osMatch) return false;
    }
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

async function getFilterOptions(user) {
  const reverseIds = await reverseWarehouseIds();
  const warehouses = await Warehouse.findAll({
    where: { [Op.and]: [warehouseListWhere(user), { isReverseLogistics: false, status: 'ativo' }] },
    attributes: ['id', 'city'],
    order: [['city', 'ASC']],
  });
  const warehouseIds = warehouses.map((warehouse) => Number(warehouse.id));
  const technicians = warehouseIds.length
    ? await Technician.findAll({
        where: { defaultWarehouseId: { [Op.in]: warehouseIds } },
        include: [ContractorCompany],
        order: [['name', 'ASC']],
      })
    : [];
  const companyIds = [...new Set(technicians.map((technician) => Number(technician.companyId)).filter(Boolean))];
  const [materials, companies, batches] = await Promise.all([
    Material.findAll({ order: [['name', 'ASC']] }),
    companyIds.length ? ContractorCompany.findAll({ where: { id: { [Op.in]: companyIds } }, order: [['name', 'ASC']] }) : Promise.resolve([]),
    warehouseIds.length
      ? StockBatch.findAll({
          where: { [Op.and]: [warehouseOutsideReverse(reverseIds), { warehouseId: { [Op.in]: warehouseIds } }] },
          attributes: ['sourceCompany'],
          order: [['sourceCompany', 'ASC']],
        })
      : Promise.resolve([]),
  ]);
  return {
    materials: materials.map((m) => ({ id: m.id, name: `${m.name} (${m.sku})`, category: m.category, requiresSerial: m.requiresSerial })),
    technicians: technicians.map((t) => ({ id: t.id, name: `${t.name}${t.ContractorCompany?.name ? ` • ${t.ContractorCompany.name}` : ''}`, companyId: t.companyId })),
    companies: companies.map((c) => ({ id: c.id, name: c.name })),
    categories: [...new Set(materials.map((m) => m.category).filter(Boolean))],
    sourceCompanies: [...new Set(batches.map((b) => b.sourceCompany).filter(Boolean))],
    cities: [...new Set(warehouses.map((w) => String(w.city || '').trim()).filter(Boolean))],
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

exports.filterOptions = asyncHandler(async (req, res) => ok(res, await getFilterOptions(req.user)));

exports.warehouseValues = asyncHandler(async (req, res) => {
  const warehouses = await Warehouse.findAll({
    where: { ...warehouseListWhere(req.user), isReverseLogistics: false },
    attributes: ['id', 'name', 'code', 'city', 'region', 'status'],
    order: [['status', 'ASC'], ['city', 'ASC'], ['name', 'ASC']],
  });
  const warehouseIds = warehouses.map((warehouse) => Number(warehouse.id)).filter(Number.isFinite);

  if (!warehouseIds.length) {
    return ok(res, { rows: [], totalQuantity: 0, totalValue: 0, generatedAt: new Date().toISOString() });
  }

  const [balances, assets] = await Promise.all([
    StockBalance.findAll({
      where: {
        ownerType: 'estoque',
        warehouseId: { [Op.in]: warehouseIds },
        quantity: { [Op.gt]: 0 },
      },
      attributes: ['warehouseId', 'materialId', 'quantity'],
      include: [{ model: Material, attributes: ['id', 'unitCost'] }],
    }),
    SerializedAsset.findAll({
      where: {
        ownerType: 'estoque',
        warehouseId: { [Op.in]: warehouseIds },
        status: 'em_estoque',
      },
      attributes: ['id', 'warehouseId', 'materialId', 'acquisitionCost', 'status'],
      include: [{ model: Material, attributes: ['id', 'unitCost'] }],
    }),
  ]);

  const rowsByWarehouse = new Map(warehouses.map((warehouse) => [Number(warehouse.id), {
    id: warehouse.id,
    name: warehouse.name,
    code: warehouse.code,
    city: warehouse.city || warehouse.region || warehouse.code || '',
    status: warehouse.status,
    quantity: 0,
    value: 0,
    materialIds: new Set(),
  }]));

  balances.forEach((balance) => {
    const row = rowsByWarehouse.get(Number(balance.warehouseId));
    if (!row) return;
    const quantity = Number(balance.quantity || 0);
    if (quantity <= 0) return;
    row.quantity += quantity;
    row.value += quantity * Number(balance.Material?.unitCost || 0);
    row.materialIds.add(Number(balance.materialId));
  });

  assets.forEach((asset) => {
    const row = rowsByWarehouse.get(Number(asset.warehouseId));
    if (!row) return;
    row.quantity += 1;
    row.value += Number(asset.acquisitionCost || asset.Material?.unitCost || 0);
    row.materialIds.add(Number(asset.materialId));
  });

  const rows = [...rowsByWarehouse.values()].map((row) => ({
    id: row.id,
    name: row.name,
    code: row.code,
    city: row.city,
    status: row.status,
    quantity: money(row.quantity),
    value: money(row.value),
    activeMaterials: row.materialIds.size,
  }));
  const totalQuantity = money(rows.reduce((sum, row) => sum + Number(row.quantity || 0), 0));
  const totalValue = money(rows.reduce((sum, row) => sum + Number(row.value || 0), 0));

  return ok(res, { rows, totalQuantity, totalValue, generatedAt: new Date().toISOString() });
});


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


function dateWhere(field, filters, dateOnlyField = false) {
  if (!filters.start && !filters.end) return {};
  const range = {};
  if (filters.start) range[Op.gte] = dateOnlyField ? dateOnly(filters.start) : filters.start;
  if (filters.end) range[Op.lte] = dateOnlyField ? dateOnly(filters.end) : filters.end;
  return { [field]: range };
}

function selectedWhere(field, values = []) {
  return values.length ? { [field]: { [Op.in]: values } } : {};
}

function combineWhere(...parts) {
  const valid = parts.filter((part) => part && Reflect.ownKeys(part).length > 0);
  if (!valid.length) return {};
  if (valid.length === 1) return valid[0];
  return { [Op.and]: valid };
}

function materialAttributes() {
  return ['id', 'sku', 'name', 'category', 'unit', 'requiresSerial', 'unitCost', 'minStock', 'active'];
}

async function loadTechnicianInventory(technicians = []) {
  const technicianIds = technicians.map((technician) => Number(technician.id)).filter(Number.isFinite);
  if (!technicianIds.length) {
    return { assets: [], balances: [], tools: [], assetsByTechnician: new Map(), balancesByTechnician: new Map(), toolsByTechnician: new Map() };
  }

  const [assets, balances, tools] = await Promise.all([
    SerializedAsset.findAll({
      where: { ownerType: 'tecnico', technicianId: { [Op.in]: technicianIds }, status: { [Op.notIn]: ['perdido', 'baixado'] } },
      attributes: ['id', 'serialNumber', 'mac', 'status', 'ownerType', 'acquisitionCost', 'custodyStartedAt', 'technicianId', 'materialId'],
      include: [{ model: Material, attributes: materialAttributes() }],
    }),
    StockBalance.findAll({
      where: { ownerType: 'tecnico', technicianId: { [Op.in]: technicianIds } },
      attributes: ['id', 'quantity', 'technicianId', 'materialId', 'ownerType'],
      include: [{ model: Material, attributes: materialAttributes() }],
    }),
    TechnicianTool.findAll({
      where: { technicianId: { [Op.in]: technicianIds }, status: 'com_tecnico' },
      attributes: ['id', 'technicianId', 'name', 'serialNumber', 'referenceValue', 'status', 'deliveredAt'],
    }).catch(() => []),
  ]);

  const groupByTechnician = (rows) => {
    const map = new Map();
    rows.forEach((row) => {
      const key = Number(row.technicianId);
      if (!map.has(key)) map.set(key, []);
      map.get(key).push(row);
    });
    return map;
  };

  return {
    assets,
    balances,
    tools,
    assetsByTechnician: groupByTechnician(assets),
    balancesByTechnician: groupByTechnician(balances),
    toolsByTechnician: groupByTechnician(tools),
  };
}

async function calculateStockPosition(materials, filters = {}) {
  const rows = [];
  const totals = { estoque: 0, tecnico: 0, cliente: 0, manutencao: 0, perdido: 0, totalAtual: 0, totalRastreado: 0 };
  const quantities = { estoque: 0, tecnico: 0, cliente: 0, manutencao: 0, perdido: 0, totalAtual: 0, totalRastreado: 0 };
  const reverseIds = await reverseWarehouseIds();
  const reverseSet = new Set(reverseIds.map(Number));
  const installedSerialsForCity = new Set();
  if (filters.cityRestricted) {
    const cityOrders = await ServiceOrder.findAll({
      where: filters.warehouseIds.length ? { warehouseId: { [Op.in]: filters.warehouseIds } } : { id: -1 },
      attributes: ['id'],
      include: [{ model: ServiceOrderMaterial, attributes: ['serialNumber'] }],
    });
    cityOrders.forEach((order) => (order.ServiceOrderMaterials || []).forEach((item) => {
      if (item.serialNumber) installedSerialsForCity.add(String(item.serialNumber).trim().toUpperCase());
    }));
  }

  const selectedMaterials = materials.filter((material) => materialMatches(material, { ...filters, search: '' }));
  const materialIds = selectedMaterials.map((material) => material.id);

  const [allAssets, allBalances] = materialIds.length
    ? await Promise.all([
        SerializedAsset.findAll({
          where: { materialId: { [Op.in]: materialIds } },
          attributes: ['id', 'serialNumber', 'mac', 'status', 'ownerType', 'acquisitionCost', 'warehouseId', 'technicianId', 'materialId'],
          include: [{ model: Technician, attributes: ['id', 'name', 'companyId', 'status'] }],
        }),
        StockBalance.findAll({
          where: { materialId: { [Op.in]: materialIds } },
          attributes: ['id', 'ownerType', 'quantity', 'warehouseId', 'technicianId', 'materialId'],
          include: [{ model: Technician, attributes: ['id', 'name', 'companyId', 'status'] }],
        }),
      ])
    : [[], []];

  const assetsByMaterial = new Map();
  const balancesByMaterial = new Map();

  for (const asset of allAssets) {
    const key = Number(asset.materialId);
    if (!assetsByMaterial.has(key)) assetsByMaterial.set(key, []);
    assetsByMaterial.get(key).push(asset);
  }

  for (const balance of allBalances) {
    const key = Number(balance.materialId);
    if (!balancesByMaterial.has(key)) balancesByMaterial.set(key, []);
    balancesByMaterial.get(key).push(balance);
  }

  for (const material of selectedMaterials) {
    const unitCost = Number(material.unitCost || 0);
    const quantity = { estoque: 0, tecnico: 0, cliente: 0, manutencao: 0, perdido: 0 };
    const value = { estoque: 0, tecnico: 0, cliente: 0, manutencao: 0, perdido: 0 };

    if (material.requiresSerial) {
      const assets = (assetsByMaterial.get(Number(material.id)) || []).filter((asset) => {
        if (asset.ownerType === 'estoque' && reverseSet.has(Number(asset.warehouseId))) return false;
        if (filters.cityRestricted) {
          if (asset.ownerType === 'estoque' && !cityMatchesWarehouseId(asset.warehouseId, filters)) return false;
          if (asset.ownerType === 'tecnico' && !filters.technicianCityIds.includes(Number(asset.technicianId))) return false;
          if (asset.ownerType === 'cliente' && !installedSerialsForCity.has(String(asset.serialNumber || '').trim().toUpperCase())) return false;
        }
        if (!matchesSelected(asset.ownerType, filters.ownerTypes)) return false;
        if (!matchesSelected(asset.status, filters.assetStatuses)) return false;
        if ((filters.technicianIds.length || filters.companyIds.length) && !technicianMatches(asset.Technician, filters)) return false;
        if (!textIncludes([asset.serialNumber, asset.mac, material.name, material.sku], filters.search)) return false;
        return true;
      });

      assets.forEach((asset) => {
        const assetValue = Number(asset.acquisitionCost || unitCost || 0);
        let bucket = null;

        // Status de perda/manutenção tem prioridade para impedir dupla contabilização
        // simultânea como "com técnico" ou "em estoque".
        if (asset.status === 'perdido' || asset.status === 'baixado') bucket = 'perdido';
        else if (asset.status === 'manutencao') bucket = 'manutencao';
        else if (['estoque', 'tecnico', 'cliente'].includes(asset.ownerType)) bucket = asset.ownerType;

        if (bucket) {
          quantity[bucket] += 1;
          value[bucket] += assetValue;
        }
      });
    } else {
      const balances = (balancesByMaterial.get(Number(material.id)) || []).filter((row) => {
        if (row.ownerType === 'estoque' && reverseSet.has(Number(row.warehouseId))) return false;
        if (filters.cityRestricted) {
          if (row.ownerType === 'estoque' && !cityMatchesWarehouseId(row.warehouseId, filters)) return false;
          if (row.ownerType === 'tecnico' && !filters.technicianCityIds.includes(Number(row.technicianId))) return false;
        }
        if (!matchesSelected(row.ownerType, filters.ownerTypes)) return false;
        if ((filters.technicianIds.length || filters.companyIds.length) && !technicianMatches(row.Technician, filters)) return false;
        return true;
      });

      balances.forEach((row) => {
        const rowQuantity = Number(row.quantity || 0);
        if (row.ownerType === 'estoque' || row.ownerType === 'tecnico') {
          quantity[row.ownerType] += rowQuantity;
          value[row.ownerType] += rowQuantity * unitCost;
        }
      });
    }

    const activeValue = value.estoque + value.tecnico + value.cliente + value.manutencao;
    const trackedValue = activeValue + value.perdido;
    const activeQuantity = quantity.estoque + quantity.tecnico + quantity.cliente + quantity.manutencao;
    const trackedQuantity = activeQuantity + quantity.perdido;

    ['estoque', 'tecnico', 'cliente', 'manutencao', 'perdido'].forEach((key) => {
      totals[key] += value[key];
      quantities[key] += quantity[key];
    });
    totals.totalAtual += activeValue;
    totals.totalRastreado += trackedValue;
    quantities.totalAtual += activeQuantity;
    quantities.totalRastreado += trackedQuantity;

    rows.push({
      id: material.id,
      sku: material.sku,
      name: material.name,
      category: material.category,
      requiresSerial: material.requiresSerial,
      unitCost: money(unitCost),
      estoqueQty: money(quantity.estoque),
      tecnicoQty: money(quantity.tecnico),
      clienteQty: money(quantity.cliente),
      manutencaoQty: money(quantity.manutencao),
      perdidoQty: money(quantity.perdido),
      estoqueValue: money(value.estoque),
      tecnicoValue: money(value.tecnico),
      clienteValue: money(value.cliente),
      manutencaoValue: money(value.manutencao),
      perdidoValue: money(value.perdido),
      totalValue: money(activeValue),
      totalTrackedValue: money(trackedValue),
      minStock: material.minStock,
    });
  }

  Object.keys(totals).forEach((key) => { totals[key] = money(totals[key]); });
  Object.keys(quantities).forEach((key) => { quantities[key] = money(quantities[key]); });
  rows.sort((a, b) => b.totalValue - a.totalValue);
  return { rows, totals, quantities };
}

async function loadBiData(filters, requested = {}) {
  const useAll = requested.all !== false;
  const needs = (key) => useAll || requested[key] === true;
  const needsReverseIds = needs('batches') || needs('movements');
  const reverseIds = needsReverseIds ? await reverseWarehouseIds() : [];
  const materialInclude = () => ({ model: Material, attributes: materialAttributes() });

  let [materials, batches, transfers, orders, movements, technicians, materialRequests, approvalRequests] = await Promise.all([
    needs('materials')
      ? Material.findAll({ attributes: materialAttributes(), order: [['name', 'ASC']] })
      : Promise.resolve([]),
    needs('batches')
      ? StockBatch.findAll({
          where: combineWhere(
            warehouseOutsideReverse(reverseIds),
            dateWhere('receivedAt', filters, true),
            selectedWhere('sourceCompany', filters.sourceCompanies),
            selectedWhere('fiscalDocumentType', filters.fiscalDocumentTypes),
            selectedWhere('conferenceStatus', filters.conferenceStatuses),
          ),
          attributes: { exclude: ['proofAttachmentData'] },
          include: [
            { model: StockBatchItem, attributes: ['id', 'batchId', 'materialId', 'quantity', 'unitCost', 'totalCost', 'condition'], include: [materialInclude()] },
            { association: 'createdBy', attributes: ['id', 'name', 'email'] },
          ],
          order: [['receivedAt', 'DESC'], ['createdAt', 'DESC']],
          limit: 1500,
        })
      : Promise.resolve([]),
    needs('transfers')
      ? Transfer.findAll({
          where: combineWhere(
            dateWhere('deliveredAt', filters),
            selectedWhere('status', filters.transferStatuses),
          ),
          attributes: { exclude: ['attachmentData', 'stampText'] },
          include: [
            { model: Technician, attributes: ['id', 'name', 'companyId', 'status', 'type'] },
            { model: TransferItem, attributes: ['id', 'transferId', 'materialId', 'quantity', 'unitCost', 'totalCost', 'serialNumber', 'itemType'], include: [materialInclude()] },
          ],
          order: [['deliveredAt', 'DESC'], ['createdAt', 'DESC']],
          limit: 1500,
        })
      : Promise.resolve([]),
    needs('orders')
      ? ServiceOrder.findAll({
          where: combineWhere(
            dateWhere('createdAt', filters),
            selectedWhere('status', filters.orderStatuses),
            selectedWhere('serviceType', filters.serviceTypes),
          ),
          include: [
            { model: Technician, attributes: ['id', 'name', 'companyId', 'status', 'type'] },
            { model: ServiceOrderMaterial, attributes: ['id', 'serviceOrderId', 'materialId', 'quantity', 'unitCost', 'totalCost', 'serialNumber'], include: [materialInclude()] },
          ],
          order: [['createdAt', 'DESC']],
          limit: 1500,
        })
      : Promise.resolve([]),
    needs('movements')
      ? StockMovement.findAll({
          where: combineWhere(
            movementOutsideReverse(reverseIds),
            dateWhere('movementAt', filters),
            selectedWhere('type', filters.movementTypes),
          ),
          attributes: ['id', 'type', 'quantity', 'serialNumber', 'fromOwnerType', 'toOwnerType', 'movementAt', 'reference', 'notes', 'materialId', 'assetId', 'fromTechnicianId', 'toTechnicianId', 'fromWarehouseId', 'toWarehouseId', 'createdAt'],
          include: [
            materialInclude(),
            { model: SerializedAsset, attributes: ['id', 'serialNumber', 'status', 'ownerType', 'acquisitionCost'] },
            { model: Technician, as: 'fromTechnician', attributes: ['id', 'name', 'companyId'] },
            { model: Technician, as: 'toTechnician', attributes: ['id', 'name', 'companyId'] },
            { association: 'createdBy', attributes: ['id', 'name', 'email'] },
          ],
          order: [['movementAt', 'DESC']],
          limit: 2000,
        })
      : Promise.resolve([]),
    needs('technicians')
      ? Technician.findAll({
          attributes: ['id', 'name', 'document', 'email', 'type', 'status', 'companyId', 'defaultWarehouseId'],
          include: [{ model: ContractorCompany, attributes: ['id', 'name'] }],
          order: [['name', 'ASC']],
        })
      : Promise.resolve([]),
    needs('materialRequests')
      ? MaterialRequest.findAll({
          where: dateWhere('createdAt', filters),
          attributes: ['id', 'requestNumber', 'status', 'priority', 'totalQuantity', 'totalValue', 'technicianId', 'warehouseId', 'createdAt'],
          include: [{ model: Technician, attributes: ['id', 'name', 'companyId'] }],
          order: [['createdAt', 'DESC']],
          limit: 1000,
        })
      : Promise.resolve([]),
    needs('approvalRequests')
      ? ApprovalRequest.findAll({
          where: dateWhere('createdAt', filters),
          attributes: ['id', 'workflowCode', 'entityType', 'entityId', 'title', 'status', 'priority', 'amount', 'payload', 'createdAt', 'requestedAt', 'decidedAt'],
          order: [['createdAt', 'DESC']],
          limit: 1000,
        })
      : Promise.resolve([]),
  ]);

  materials = materials.filter((m) => materialMatches(m, { ...filters, search: filters.search && (filters.materialIds.length || filters.categories.length || filters.requiresSerial !== null) ? filters.search : '' }));
  batches = filterBatches(batches, filters);
  transfers = filterTransfers(transfers, filters);
  orders = filterOrders(orders, filters);
  movements = filterMovements(movements, filters);
  technicians = technicians.filter((tech) => cityMatchesTechnician(tech, filters) && technicianMatches(tech, filters) && textIncludes([tech.name, tech.document, tech.email, tech.ContractorCompany?.name], filters.search || ''));
  materialRequests = materialRequests.filter((request) => (!filters.cityRestricted || cityMatchesWarehouseId(request.warehouseId, filters) || filters.technicianCityIds.includes(Number(request.technicianId))) && technicianMatches(request.Technician, filters) && inDateRange(request.createdAt, filters));
  const visibleMaterialRequestIds = new Set(materialRequests.map((request) => String(request.id)));
  approvalRequests = approvalRequests.filter((approval) => {
    if (!inDateRange(approval.createdAt, filters)) return false;
    if (!filters.cityRestricted) return true;
    if (approval.entityType === 'material_request') return visibleMaterialRequestIds.has(String(approval.entityId));
    const payload = approval.payload || {};
    if (approval.entityType === 'warehouse_transfer') {
      return cityMatchesWarehouseId(payload.fromWarehouseId, filters) || cityMatchesWarehouseId(payload.toWarehouseId, filters);
    }
    if (approval.entityType === 'warehouse_delete') return cityMatchesWarehouseId(payload.warehouseId || payload.warehouse?.id, filters);
    return false;
  });

  return { materials, batches, transfers, orders, movements, technicians, materialRequests, approvalRequests };
}

async function installedQuantitiesByMaterial(materials = [], stockPosition = null, filters = {}) {
  if (filters.cityRestricted) {
    const orders = await ServiceOrder.findAll({
      where: filters.warehouseIds.length
        ? { warehouseId: { [Op.in]: filters.warehouseIds }, status: 'concluida' }
        : { id: -1, status: 'concluida' },
      attributes: ['id'],
      include: [{ model: ServiceOrderMaterial, attributes: ['materialId', 'quantity'] }],
    });
    const totals = new Map();
    orders.forEach((order) => (order.ServiceOrderMaterials || []).forEach((item) => {
      const id = Number(item.materialId);
      totals.set(id, Number(totals.get(id) || 0) + Number(item.quantity || 0));
    }));
    return totals;
  }
  const positionRows = new Map((stockPosition?.rows || []).map((row) => [Number(row.id), Number(row.clienteQty || 0)]));
  const nonSerializedIds = materials.filter((material) => !material.requiresSerial).map((material) => Number(material.id)).filter(Number.isFinite);
  const movementTotals = new Map();

  if (nonSerializedIds.length) {
    const rows = await StockMovement.findAll({
      attributes: ['materialId', [fn('SUM', col('quantity')), 'installedQuantity']],
      where: {
        type: 'baixa_os',
        toOwnerType: 'cliente',
        materialId: { [Op.in]: nonSerializedIds },
      },
      group: ['materialId'],
      raw: true,
    });
    rows.forEach((row) => movementTotals.set(Number(row.materialId), Number(row.installedQuantity || 0)));
  }

  const result = new Map();
  materials.forEach((material) => {
    const materialId = Number(material.id);
    result.set(materialId, material.requiresSerial
      ? Number(positionRows.get(materialId) || 0)
      : Number(movementTotals.get(materialId) || 0));
  });
  return result;
}

async function summarizeMaterials(filters, materials = null, stockPosition = null) {
  const selectedMaterials = materials || (await Material.findAll({ attributes: materialAttributes(), order: [['name', 'ASC']] }))
    .filter((material) => materialMatches(material, { ...filters, search: '' }));
  const position = stockPosition || await calculateStockPosition(selectedMaterials, filters);
  const installedByMaterial = await installedQuantitiesByMaterial(selectedMaterials, position, filters);
  return position.rows.map((row) => ({
    id: row.id,
    name: row.name,
    sku: row.sku,
    category: row.category,
    requiresSerial: row.requiresSerial,
    estoque: row.estoqueQty,
    tecnico: row.tecnicoQty,
    instalado: money(installedByMaterial.get(Number(row.id)) || 0),
    manutencao: row.manutencaoQty,
    perdido: row.perdidoQty,
    valorTecnico: row.tecnicoValue,
  }));
}

exports.executive = asyncHandler(async (req, res) => {
  const filters = await resolveCityScope(buildFilters(req.query), req.user);
  const { materials, transfers, orders, movements, technicians } = await loadBiData(filters, {
    all: false,
    materials: true,
    transfers: true,
    orders: true,
    movements: true,
    technicians: true,
  });

  const [stockPosition, technicianInventory] = await Promise.all([
    calculateStockPosition(materials, filters),
    loadTechnicianInventory(technicians),
  ]);
  const materialRows = await summarizeMaterials(filters, materials, stockPosition);

  const quantities = stockPosition.quantities;
  const totalAssets = quantities.totalRastreado;
  const assetsInStock = quantities.estoque;
  const assetsWithTechnicians = quantities.tecnico;
  const installedAssets = quantities.cliente;
  const lostAssets = quantities.perdido;
  const lostValue = money(stockPosition.totals.perdido || 0);
  const pendingSignatures = transfers.filter((transfer) => transfer.status === 'pendente_assinatura').length;
  const osMonth = orders.length;
  const custodyLimit = new Date(Date.now() - 60 * 24 * 60 * 60 * 1000);
  const custodyRiskAssets = technicianInventory.assets.filter((asset) =>
    asset.custodyStartedAt &&
    new Date(asset.custodyStartedAt) <= custodyLimit &&
    materialMatches(asset.Material, { ...filters, search: '' }) &&
    matchesSelected(asset.status, filters.assetStatuses) &&
    textIncludes([asset.serialNumber, asset.mac, asset.Material?.name], filters.search)
  );
  const custody60 = custodyRiskAssets.length;

  const technicianRows = technicians.map((tech) => {
    const assets = technicianInventory.assetsByTechnician.get(Number(tech.id)) || [];
    const filteredAssets = assets.filter((asset) =>
      materialMatches(asset.Material, { ...filters, search: '' }) &&
      matchesSelected(asset.status, filters.assetStatuses) &&
      textIncludes([asset.serialNumber, asset.mac, asset.Material?.name], filters.search)
    );
    const balances = (technicianInventory.balancesByTechnician.get(Number(tech.id)) || [])
      .filter((row) => materialMatches(row.Material, { ...filters, search: '' }));
    const tools = technicianInventory.toolsByTechnician.get(Number(tech.id)) || [];
    const serializedValue = money(filteredAssets.reduce((sum, asset) => sum + Number(asset.acquisitionCost || asset.Material?.unitCost || 0), 0));
    const consumableQuantity = money(balances.reduce((sum, row) => sum + Number(row.quantity || 0), 0));
    const consumableValue = money(balances.reduce((sum, row) => sum + Number(row.quantity || 0) * Number(row.Material?.unitCost || 0), 0));
    const toolValue = money(tools.reduce((sum, tool) => sum + Number(tool.referenceValue || 0), 0));
    const osCount = orders.filter((order) => Number(order.technicianId) === Number(tech.id)).length;
    return {
      id: tech.id,
      name: tech.name,
      company: tech.ContractorCompany?.name || '-',
      assetCount: money(filteredAssets.length + consumableQuantity),
      serializedCount: filteredAssets.length,
      consumableQuantity,
      serializedValue,
      consumableValue,
      toolCount: tools.length,
      toolValue,
      assetValue: money(serializedValue + consumableValue + toolValue),
      custodyValue: money(serializedValue + consumableValue + toolValue),
      osCount,
    };
  }).sort((a, b) => b.custodyValue - a.custodyValue);

  const toolsInCustody = technicianRows.reduce((sum, row) => sum + Number(row.toolCount || 0), 0);
  const toolsValue = money(technicianRows.reduce((sum, row) => sum + Number(row.toolValue || 0), 0));
  const assetsByOwner = ['estoque', 'tecnico', 'cliente', 'manutencao', 'perdido']
    .map((ownerType) => ({ ownerType, total: quantities[ownerType] || 0 }));
  const assetsByStatus = assetsByOwner.map(({ ownerType, total }) => ({ status: ownerType, total }));

  return ok(res, {
    cards: {
      totalAssets: money(totalAssets),
      assetsInStock: money(assetsInStock),
      assetsWithTechnicians: money(assetsWithTechnicians),
      installedAssets: money(installedAssets),
      lostAssets: money(lostAssets),
      lostValue,
      patrimonyInTechnicians: stockPosition.totals.tecnico,
      patrimonyTotal: stockPosition.totals.totalAtual,
      pendingSignatures,
      osMonth,
      custody60,
      toolsInCustody,
      toolsValue,
    },
    materials: materialRows,
    topTechnicians: technicianRows.slice(0, 10),
    transfers: transfers.map((transfer) => ({
      id: transfer.id,
      transferNumber: transfer.transferNumber,
      status: transfer.status,
      totalQuantity: money(transfer.totalQuantity || 0),
      totalValue: money(transfer.totalValue || 0),
      deliveredAt: transfer.deliveredAt,
      signedAt: transfer.signedAt,
      createdAt: transfer.createdAt,
    })),
    orders: orders.map((order) => ({
      id: order.id,
      osNumber: order.osNumber,
      status: order.status,
      serviceType: order.serviceType,
      createdAt: order.createdAt,
      completedAt: order.completedAt,
    })),
    movements: movements.map((movement) => ({
      id: movement.id,
      type: movement.type,
      quantity: money(movement.quantity || 0),
      movementAt: movement.movementAt,
      createdAt: movement.createdAt,
    })),
    assetsByOwner,
    assetsByStatus,
    filtersApplied: { ...req.query, startDate: dateOnly(filters.start), endDate: dateOnly(filters.end) },
    selectedCity: filters.city || null,
    generatedAt: new Date().toISOString(),
  });
});

exports.technicians = asyncHandler(async (req, res) => {
  const filters = await resolveCityScope(buildFilters(req.query), req.user);
  const { technicians, transfers, orders } = await loadBiData(filters, {
    all: false,
    technicians: true,
    transfers: true,
    orders: true,
  });
  const inventory = await loadTechnicianInventory(technicians);

  const rows = technicians.map((tech) => {
    const assets = inventory.assetsByTechnician.get(Number(tech.id)) || [];
    const filteredAssets = assets.filter((asset) =>
      materialMatches(asset.Material, { ...filters, search: '' }) &&
      matchesSelected(asset.status, filters.assetStatuses) &&
      textIncludes([asset.serialNumber, asset.Material?.name], filters.search)
    );
    const consumables = (inventory.balancesByTechnician.get(Number(tech.id)) || [])
      .filter((row) => materialMatches(row.Material, { ...filters, search: '' }));
    const activeTools = inventory.toolsByTechnician.get(Number(tech.id)) || [];
    const consumableQuantity = money(consumables.reduce((sum, row) => sum + Number(row.quantity || 0), 0));
    const serializedValue = money(filteredAssets.reduce((sum, asset) => sum + Number(asset.acquisitionCost || asset.Material?.unitCost || 0), 0));
    const consumableValue = money(consumables.reduce((sum, row) => sum + Number(row.quantity || 0) * Number(row.Material?.unitCost || 0), 0));
    const toolValue = money(activeTools.reduce((sum, tool) => sum + Number(tool.referenceValue || 0), 0));
    const assetValue = money(serializedValue + consumableValue);
    const custodyValue = money(assetValue + toolValue);
    const oldAssets = filteredAssets.filter((asset) => daysBetween(asset.custodyStartedAt) >= 60).length;
    const osForTech = orders.filter((order) => Number(order.technicianId) === Number(tech.id));
    const transferForTech = transfers.filter((transfer) => Number(transfer.technicianId) === Number(tech.id));
    const osTotal = osForTech.length;
    const osMonth = osForTech.length;
    const lastOrder = osForTech[0];
    const assetCount = money(filteredAssets.length + consumableQuantity);

    return {
      id: tech.id,
      name: tech.name,
      type: tech.type,
      status: tech.status,
      company: tech.ContractorCompany?.name || '-',
      assetCount,
      serializedCount: filteredAssets.length,
      consumableQuantity,
      assetValue,
      toolCount: activeTools.length,
      toolValue,
      custodyValue,
      oldAssets,
      osTotal,
      osMonth,
      transferCount: transferForTech.length,
      lastOrderAt: lastOrder?.createdAt || null,
      score: money(osMonth * 10 - oldAssets * 3 + assetCount + activeTools.length),
    };
  }).sort((a, b) => b.score - a.score);

  const typeDistribution = rows.reduce((acc, row) => ({ ...acc, [row.type || 'sem_tipo']: (acc[row.type || 'sem_tipo'] || 0) + 1 }), {});
  const statusDistribution = rows.reduce((acc, row) => ({ ...acc, [row.status || 'sem_status']: (acc[row.status || 'sem_status'] || 0) + 1 }), {});
  const companyDistribution = rows.reduce((acc, row) => ({ ...acc, [row.company || '-']: (acc[row.company || '-'] || 0) + 1 }), {});

  return ok(res, {
    technicians: rows,
    averageValue: money(rows.reduce((sum, row) => sum + Number(row.custodyValue || 0), 0) / Math.max(rows.length, 1)),
    typeDistribution,
    statusDistribution,
    companyDistribution,
    filtersApplied: { ...req.query, startDate: dateOnly(filters.start), endDate: dateOnly(filters.end) },
    generatedAt: new Date().toISOString(),
  });
});

exports.audit = asyncHandler(async (req, res) => {
  const filters = await resolveCityScope(buildFilters(req.query), req.user);
  const { transfers, movements } = await loadBiData(filters, {
    all: false,
    transfers: true,
    movements: true,
  });
  const reverseIds = await reverseWarehouseIds();

  const [auditRowsRaw, oldestCustodyRaw, currentAssetsRaw] = await Promise.all([
    AuditLog.findAll({
      where: dateWhere('createdAt', filters),
      attributes: ['id', 'action', 'entity', 'entityId', 'message', 'ip', 'actorId', 'createdAt'],
      include: [{ association: 'actor', attributes: ['id', 'name', 'email'] }],
      order: [['createdAt', 'DESC']],
      limit: 1000,
    }),
    SerializedAsset.findAll({
      where: combineWhere(
        { ownerType: 'tecnico' },
        warehouseOutsideReverse(reverseIds),
      ),
      attributes: ['id', 'serialNumber', 'mac', 'status', 'ownerType', 'acquisitionCost', 'custodyStartedAt', 'technicianId', 'materialId'],
      include: [
        { model: Material, attributes: materialAttributes() },
        { model: Technician, attributes: ['id', 'name', 'companyId'] },
      ],
      order: [['custodyStartedAt', 'ASC']],
      limit: 500,
    }),
    SerializedAsset.findAll({
      where: warehouseOutsideReverse(reverseIds),
      attributes: ['id', 'serialNumber', 'mac', 'status', 'ownerType', 'warehouseId', 'technicianId', 'materialId'],
      include: [
        { model: Material, attributes: materialAttributes() },
        { model: Technician, attributes: ['id', 'name', 'companyId'] },
      ],
    }),
  ]);

  const auditRows = auditRowsRaw.filter((row) =>
    inDateRange(row.createdAt, filters) &&
    textIncludes([row.action, row.entity, row.entityId, row.message, row.actor?.name, row.actor?.email], filters.search)
  );
  const movementsByTypeMap = movements.reduce((acc, row) => ({ ...acc, [row.type || 'sem_tipo']: (acc[row.type || 'sem_tipo'] || 0) + 1 }), {});
  const auditByActionMap = auditRows.reduce((acc, row) => ({ ...acc, [row.action || 'sem_acao']: (acc[row.action || 'sem_acao'] || 0) + 1 }), {});
  const oldestCustody = oldestCustodyRaw.filter((asset) =>
    materialMatches(asset.Material, { ...filters, search: '' }) &&
    technicianMatches(asset.Technician, filters) &&
    matchesSelected(asset.status, filters.assetStatuses) &&
    textIncludes([asset.serialNumber, asset.mac, asset.Material?.name, asset.Technician?.name], filters.search)
  );
  const currentAssets = currentAssetsRaw.filter((asset) =>
    materialMatches(asset.Material, { ...filters, search: '' }) &&
    technicianMatches(asset.Technician, filters) &&
    matchesSelected(asset.status, filters.assetStatuses) &&
    textIncludes([asset.serialNumber, asset.mac, asset.Material?.name, asset.Technician?.name], filters.search)
  );
  const assetsByStatusMap = currentAssets.reduce((acc, asset) => ({ ...acc, [asset.status || 'sem_status']: (acc[asset.status || 'sem_status'] || 0) + 1 }), {});

  return ok(res, {
    movementsByType: Object.entries(movementsByTypeMap).map(([type, total]) => ({ type, total })),
    auditByAction: Object.entries(auditByActionMap).map(([action, total]) => ({ action, total })),
    recentTransfers: transfers.slice(0, 100).map((transfer) => ({
      id: transfer.id,
      transferNumber: transfer.transferNumber,
      status: transfer.status,
      totalQuantity: money(transfer.totalQuantity || 0),
      totalValue: money(transfer.totalValue || 0),
      deliveredAt: transfer.deliveredAt,
      signedAt: transfer.signedAt,
      technician: transfer.Technician?.name || '-',
    })),
    assetsByStatus: Object.entries(assetsByStatusMap).map(([status, total]) => ({ status, total })),
    oldestCustody: oldestCustody.slice(0, 100).map((asset) => ({
      id: asset.id,
      serialNumber: asset.serialNumber,
      status: asset.status,
      custodyStartedAt: asset.custodyStartedAt,
      custodyDays: daysBetween(asset.custodyStartedAt),
      Material: asset.Material ? { id: asset.Material.id, name: asset.Material.name, sku: asset.Material.sku } : null,
      Technician: asset.Technician ? { id: asset.Technician.id, name: asset.Technician.name } : null,
    })),
    auditRows: auditRows.slice(0, 250).map((row) => ({
      id: row.id,
      action: row.action,
      entity: row.entity,
      entityId: row.entityId,
      message: row.message,
      ip: row.ip,
      createdAt: row.createdAt,
      actor: row.actor ? { id: row.actor.id, name: row.actor.name, email: row.actor.email } : null,
    })),
    filtersApplied: { ...req.query, startDate: dateOnly(filters.start), endDate: dateOnly(filters.end) },
    generatedAt: new Date().toISOString(),
  });
});

exports.financial = asyncHandler(async (req, res) => {
  const filters = await resolveCityScope(buildFilters(req.query), req.user);
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
  const technicianIds = technicians.map((technician) => technician.id);
  const [technicianAssets, technicianBalances, technicianTools] = technicianIds.length
    ? await Promise.all([
        SerializedAsset.findAll({
          where: {
            ownerType: 'tecnico',
            technicianId: { [Op.in]: technicianIds },
            status: { [Op.notIn]: ['perdido', 'baixado'] },
          },
          include: [Material, Technician],
        }),
        StockBalance.findAll({
          where: {
            ownerType: 'tecnico',
            technicianId: { [Op.in]: technicianIds },
          },
          include: [Material],
        }),
        TechnicianTool.findAll({
          where: {
            technicianId: { [Op.in]: technicianIds },
            status: 'com_tecnico',
          },
        }).catch(() => []),
      ])
    : [[], [], []];

  const custodyLimit = new Date(Date.now() - 60 * 24 * 60 * 60 * 1000);
  const custodyRiskAssetsRaw = technicianAssets
    .filter((asset) => asset.custodyStartedAt && new Date(asset.custodyStartedAt) <= custodyLimit)
    .sort((a, b) => new Date(a.custodyStartedAt || 0) - new Date(b.custodyStartedAt || 0));
  const custodyRiskAssets = custodyRiskAssetsRaw.filter((asset) => materialMatches(asset.Material, { ...filters, search: '' }) && technicianMatches(asset.Technician, filters) && matchesSelected(asset.status, filters.assetStatuses) && textIncludes([asset.serialNumber, asset.mac, asset.Material?.name, asset.Technician?.name], filters.search));
  const custodyRiskValue = money(custodyRiskAssets.reduce((sum, asset) => sum + Number(asset.acquisitionCost || asset.Material?.unitCost || 0), 0));
  const lostValue = money(stockPosition.totals.perdido || 0);
  const blockedCapital = money(stockPosition.totals.tecnico);
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

  const assetsByTechnician = new Map();
  const balancesByTechnician = new Map();
  const toolsByTechnician = new Map();

  technicianAssets.forEach((asset) => {
    const key = Number(asset.technicianId);
    if (!assetsByTechnician.has(key)) assetsByTechnician.set(key, []);
    assetsByTechnician.get(key).push(asset);
  });
  technicianBalances.forEach((balance) => {
    const key = Number(balance.technicianId);
    if (!balancesByTechnician.has(key)) balancesByTechnician.set(key, []);
    balancesByTechnician.get(key).push(balance);
  });
  technicianTools.forEach((tool) => {
    const key = Number(tool.technicianId);
    if (!toolsByTechnician.has(key)) toolsByTechnician.set(key, []);
    toolsByTechnician.get(key).push(tool);
  });

  const technicianFinance = [];
  for (const tech of technicians) {
    const assets = assetsByTechnician.get(Number(tech.id)) || [];
    const filteredAssets = assets.filter((asset) => materialMatches(asset.Material, { ...filters, search: '' }) && matchesSelected(asset.status, filters.assetStatuses));
    const assetValue = money(filteredAssets.reduce((sum, asset) => sum + Number(asset.acquisitionCost || asset.Material?.unitCost || 0), 0));
    const balanceRows = balancesByTechnician.get(Number(tech.id)) || [];
    const consumableValue = money(balanceRows.filter((row) => materialMatches(row.Material, { ...filters, search: '' })).reduce((sum, row) => sum + Number(row.quantity || 0) * Number(row.Material?.unitCost || 0), 0));
    const activeTools = toolsByTechnician.get(Number(tech.id)) || [];
    const toolValue = money(activeTools.reduce((sum, tool) => sum + Number(tool.referenceValue || 0), 0));
    const transferValue = money(transfers.filter((transfer) => Number(transfer.technicianId) === Number(tech.id) && transfer.status !== 'cancelado').reduce((sum, transfer) => sum + Number(transfer.totalValue || 0), 0));
    const consumedValue = money(orders.filter((order) => Number(order.technicianId) === Number(tech.id)).reduce((sum, order) => sum + orderValue(order), 0));
    const pendingValue = money(transfers.filter((transfer) => Number(transfer.technicianId) === Number(tech.id) && transfer.status === 'pendente_assinatura').reduce((sum, transfer) => sum + Number(transfer.totalValue || 0), 0));
    const oldValue = money(custodyRiskAssets.filter((asset) => Number(asset.technicianId) === Number(tech.id)).reduce((sum, asset) => sum + Number(asset.acquisitionCost || asset.Material?.unitCost || 0), 0));
    technicianFinance.push({ id: tech.id, name: tech.name, company: tech.ContractorCompany?.name || '-', status: tech.status, assetValue, consumableValue, toolCount: activeTools.length, toolValue, custodyValue: money(assetValue + consumableValue + toolValue), transferValue, consumedValue, pendingSignatureValue: pendingValue, oldCustodyValue: oldValue, openFinancialRisk: money(pendingValue + oldValue) });
  }
  technicianFinance.sort((a, b) => b.custodyValue - a.custodyValue);

  const materialFinance = stockPosition.rows.map((row) => ({
    ...row,
    entryValue: money(confirmedBatches.reduce((sum, batch) => sum + (batch.StockBatchItems || []).filter((item) => Number(item.materialId) === Number(row.id)).reduce((s, item) => s + Number(item.totalCost || 0), 0), 0)),
    transferValue: money((transfers || []).reduce((sum, transfer) => sum + (transfer.TransferItems || []).filter((item) => Number(item.materialId) === Number(row.id)).reduce((s, item) => s + Number(item.totalCost || 0), 0), 0)),
    consumedValue: money((orders || []).reduce((sum, order) => sum + (order.ServiceOrderMaterials || []).filter((item) => Number(item.materialId) === Number(row.id)).reduce((s, item) => s + Number(item.totalCost || 0), 0), 0)),
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
