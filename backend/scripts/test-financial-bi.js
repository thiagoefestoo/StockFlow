const assert = require('assert');
const {
  calculateDocumentedCoverage,
  hasUnsupportedCoverageFilters,
  nonSerializedLossValue,
  splitCompletedOrderValues,
} = require('../app/utils/financialBi');

const orders = [
  {
    status: 'concluida',
    ServiceOrderMaterials: [
      { totalCost: 100, serialNumber: 'ONU-1', Material: { requiresSerial: true } },
      { totalCost: 20, quantity: 2, Material: { requiresSerial: false } },
    ],
  },
  {
    status: 'cancelada',
    ServiceOrderMaterials: [{ totalCost: 999, Material: { requiresSerial: false } }],
  },
  {
    status: 'aberta',
    ServiceOrderMaterials: [{ totalCost: 777, Material: { requiresSerial: false } }],
  },
];

const split = splitCompletedOrderValues(orders);
assert.strictEqual(split.completedOrders.length, 1);
assert.strictEqual(split.serializedValue, 100);
assert.strictEqual(split.consumableValue, 20);
assert.strictEqual(split.totalValue, 120);

assert.strictEqual(nonSerializedLossValue([
  { type: 'perda', quantity: 2, Material: { requiresSerial: false, unitCost: 3 } },
  { type: 'perda', quantity: 1, Material: { requiresSerial: true, unitCost: 500 } },
  { type: 'ajuste', quantity: 5, Material: { requiresSerial: false, unitCost: 2 } },
]), 6);

const coverage = calculateDocumentedCoverage({
  entryValue: 200,
  currentPositionValue: 100,
  consumablesAppliedValue: 70,
  serializedLossValue: 20,
  consumableLossValue: 10,
});
assert.strictEqual(coverage.available, true);
assert.strictEqual(coverage.documentedValue, 200);
assert.strictEqual(coverage.percentage, 100);
assert.strictEqual(coverage.differenceValue, 0);

assert.strictEqual(hasUnsupportedCoverageFilters({
  technicianIds: [], companyIds: [], ownerTypes: [], assetStatuses: [], movementTypes: [],
  transferStatuses: [], orderStatuses: [], serviceTypes: [], sourceCompanies: [],
  fiscalDocumentTypes: [], conferenceStatuses: [], minValue: null, maxValue: null, search: '',
}), false);
assert.strictEqual(hasUnsupportedCoverageFilters({ technicianIds: ['9'] }), true);

console.log('BI financeiro validado: OS concluídas, separação de consumíveis e cobertura documentada.');
