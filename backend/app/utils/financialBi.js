function roundMoney(value) {
  return Number(Number(value || 0).toFixed(2));
}

function itemValue(item) {
  const hasExplicit = item?.totalCost !== null && item?.totalCost !== undefined && item?.totalCost !== '';
  const explicit = Number(item?.totalCost);
  if (hasExplicit && Number.isFinite(explicit)) return explicit;
  return Number(item?.quantity || 0) * Number(item?.unitCost || item?.Material?.unitCost || 0);
}

function isCompletedOrder(order) {
  return String(order?.status || '').trim().toLowerCase() === 'concluida';
}

function splitCompletedOrderValues(orders = []) {
  const completedOrders = orders.filter(isCompletedOrder);
  let serializedValue = 0;
  let consumableValue = 0;

  completedOrders.forEach((order) => {
    (order.ServiceOrderMaterials || []).forEach((item) => {
      const value = itemValue(item);
      const serialized = Boolean(item?.Material?.requiresSerial || item?.serialNumber);
      if (serialized) serializedValue += value;
      else consumableValue += value;
    });
  });

  serializedValue = roundMoney(serializedValue);
  consumableValue = roundMoney(consumableValue);

  return {
    completedOrders,
    serializedValue,
    consumableValue,
    totalValue: roundMoney(serializedValue + consumableValue),
  };
}

function nonSerializedLossValue(movements = []) {
  return roundMoney(movements.reduce((sum, movement) => {
    if (String(movement?.type || '') !== 'perda') return sum;
    if (movement?.Material?.requiresSerial) return sum;
    return sum + Number(movement?.quantity || 0) * Number(movement?.Material?.unitCost || 0);
  }, 0));
}

function hasUnsupportedCoverageFilters(filters = {}) {
  return Boolean(
    (filters.technicianIds || []).length
    || (filters.companyIds || []).length
    || (filters.ownerTypes || []).length
    || (filters.assetStatuses || []).length
    || (filters.movementTypes || []).length
    || (filters.transferStatuses || []).length
    || (filters.orderStatuses || []).length
    || (filters.serviceTypes || []).length
    || (filters.sourceCompanies || []).length
    || (filters.fiscalDocumentTypes || []).length
    || (filters.conferenceStatuses || []).length
    || (filters.minValue !== null && filters.minValue !== undefined)
    || (filters.maxValue !== null && filters.maxValue !== undefined)
    || Boolean(filters.search)
  );
}

function calculateDocumentedCoverage({
  entryValue = 0,
  currentPositionValue = 0,
  consumablesAppliedValue = 0,
  serializedLossValue = 0,
  consumableLossValue = 0,
  available = true,
  unavailableReason = '',
} = {}) {
  const entries = roundMoney(entryValue);
  const documentedLossValue = roundMoney(Number(serializedLossValue || 0) + Number(consumableLossValue || 0));
  const documentedValue = roundMoney(
    Number(currentPositionValue || 0)
    + Number(consumablesAppliedValue || 0)
    + documentedLossValue
  );

  if (!available) {
    return {
      available: false,
      reason: unavailableReason || 'A cobertura fica indisponível com os filtros atuais.',
      entryValue: entries,
      documentedValue,
      documentedLossValue,
      differenceValue: null,
      percentage: null,
    };
  }

  if (entries <= 0) {
    return {
      available: false,
      reason: 'Não existem entradas confirmadas no histórico do escopo selecionado.',
      entryValue: entries,
      documentedValue,
      documentedLossValue,
      differenceValue: null,
      percentage: null,
    };
  }

  return {
    available: true,
    reason: '',
    entryValue: entries,
    documentedValue,
    documentedLossValue,
    differenceValue: roundMoney(entries - documentedValue),
    percentage: roundMoney((documentedValue / entries) * 100),
  };
}

module.exports = {
  calculateDocumentedCoverage,
  hasUnsupportedCoverageFilters,
  isCompletedOrder,
  nonSerializedLossValue,
  splitCompletedOrderValues,
};
