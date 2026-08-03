const assert = require('assert');
const {
  resolveExcludedRequestItemIds,
  assertRequestDeliveryCoverage,
} = require('../app/utils/requestDeliveryExclusions');

const requestItems = [
  { id: 11, Material: { name: 'ONU' } },
  { id: 12, Material: { name: 'Conector verde' } },
  { id: 13, Material: { name: 'Fita isolante' } },
];

const excluded = resolveExcludedRequestItemIds({
  requestItems,
  rawExcludedRequestItemIds: [12],
  explicitExclusionsProvided: true,
});
assert.deepStrictEqual([...excluded], [12]);
assert.doesNotThrow(() => assertRequestDeliveryCoverage({
  requestItems,
  submittedRequestItemIds: new Set([11, 13]),
  excludedRequestItemIds: excluded,
  explicitExclusionsProvided: true,
}));

assert.throws(() => resolveExcludedRequestItemIds({
  requestItems,
  rawExcludedRequestItemIds: [999],
  explicitExclusionsProvided: true,
}), /não pertence/);

assert.throws(() => resolveExcludedRequestItemIds({
  requestItems,
  rawExcludedRequestItemIds: [11, 12, 13],
  explicitExclusionsProvided: true,
}), /Mantenha pelo menos um item/);

assert.throws(() => assertRequestDeliveryCoverage({
  requestItems,
  submittedRequestItemIds: new Set([11, 12]),
  excludedRequestItemIds: new Set([12]),
  explicitExclusionsProvided: true,
}), /enviado e excluído/);

assert.throws(() => assertRequestDeliveryCoverage({
  requestItems,
  submittedRequestItemIds: new Set([11]),
  excludedRequestItemIds: new Set([12]),
  explicitExclusionsProvided: true,
}), /Fita isolante/);

assert.doesNotThrow(() => assertRequestDeliveryCoverage({
  requestItems,
  submittedRequestItemIds: new Set([11]),
  excludedRequestItemIds: new Set(),
  explicitExclusionsProvided: false,
}));

console.log('✅ Exclusão parcial da solicitação validada: item removido, demais mantidos, cobertura explícita e compatibilidade legada preservadas.');
