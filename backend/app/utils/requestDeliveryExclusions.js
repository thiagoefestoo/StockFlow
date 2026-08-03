function validationError(message) {
  const error = new Error(message);
  error.statusCode = 400;
  return error;
}

function requestItemIdSet(requestItems = []) {
  return new Set(
    requestItems
      .map((item) => Number(item?.id))
      .filter((id) => Number.isInteger(id) && id > 0),
  );
}

function resolveExcludedRequestItemIds({
  requestItems = [],
  rawExcludedRequestItemIds,
  explicitExclusionsProvided = false,
} = {}) {
  if (!explicitExclusionsProvided) return new Set();
  if (!Array.isArray(rawExcludedRequestItemIds)) {
    throw validationError('A lista de itens excluídos da entrega é inválida.');
  }

  const validRequestItemIds = requestItemIdSet(requestItems);
  const excludedRequestItemIds = new Set();

  for (const rawRequestItemId of rawExcludedRequestItemIds) {
    const requestItemId = Number(rawRequestItemId);
    if (!Number.isInteger(requestItemId) || requestItemId <= 0) {
      throw validationError('Existe item inválido na lista de exclusões da entrega.');
    }
    if (!validRequestItemIds.has(requestItemId)) {
      throw validationError('Não é possível excluir um item que não pertence à solicitação aprovada.');
    }
    excludedRequestItemIds.add(requestItemId);
  }

  if (validRequestItemIds.size > 0 && excludedRequestItemIds.size >= validRequestItemIds.size) {
    throw validationError('Mantenha pelo menos um item na solicitação. Para não entregar nenhum material, informe quantidade zero ou cancele a solicitação.');
  }

  return excludedRequestItemIds;
}

function assertRequestDeliveryCoverage({
  requestItems = [],
  submittedRequestItemIds = [],
  excludedRequestItemIds = new Set(),
  explicitExclusionsProvided = false,
} = {}) {
  const submittedIds = submittedRequestItemIds instanceof Set
    ? submittedRequestItemIds
    : new Set(submittedRequestItemIds.map(Number));
  const excludedIds = excludedRequestItemIds instanceof Set
    ? excludedRequestItemIds
    : new Set(excludedRequestItemIds.map(Number));

  for (const submittedId of submittedIds) {
    if (excludedIds.has(Number(submittedId))) {
      throw validationError('O mesmo item não pode ser enviado e excluído da entrega ao mesmo tempo.');
    }
  }

  if (!explicitExclusionsProvided) return;

  for (const requestItem of requestItems) {
    const requestItemId = Number(requestItem?.id);
    if (submittedIds.has(requestItemId) || excludedIds.has(requestItemId)) continue;
    const materialName = requestItem?.Material?.name || requestItemId;
    throw validationError(`O item ${materialName} não foi enviado nem marcado como excluído. Reabra a solicitação e revise os itens.`);
  }
}

module.exports = {
  resolveExcludedRequestItemIds,
  assertRequestDeliveryCoverage,
};
