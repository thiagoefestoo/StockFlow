export const SERVICE_TYPE_OPTIONS = [
  { value: 'instalacao', label: 'Ativação' },
  { value: 'manutencao', label: 'Reparo' },
  { value: 'troca_onu', label: 'Upgrade' },
  { value: 'outro', label: 'Mudança de endereço' },
];

export const ADDRESS_CHANGE_OPTIONS = [
  { value: 'com_troca', label: 'Com troca de equipamento' },
  { value: 'sem_troca', label: 'Sem troca de equipamento' },
];

export function serviceRequiresSerial(serviceType, addressChangeType) {
  return serviceType === 'instalacao'
    || serviceType === 'troca_onu'
    || (serviceType === 'outro' && addressChangeType === 'com_troca');
}

export function serviceTypeLabel(serviceType) {
  return SERVICE_TYPE_OPTIONS.find((option) => option.value === serviceType)?.label || serviceType || '-';
}

export function addressChangeLabel(addressChangeType) {
  return ADDRESS_CHANGE_OPTIONS.find((option) => option.value === addressChangeType)?.label || '';
}

export function composeServiceNotes(notes, serviceType, addressChangeType) {
  const addressNote = serviceType === 'outro' && addressChangeType
    ? `Mudança de endereço: ${addressChangeLabel(addressChangeType).toLowerCase()}.`
    : '';
  return [addressNote, String(notes || '').trim()].filter(Boolean).join(' | ');
}

const PROTECTED_SERVICE_ORDER_LIMITS = Object.freeze({
  ATFX200571: 2,
});

export function materialServiceOrderQuantityLimit(material) {
  if (!material || material.requiresSerial) return null;
  const parsed = Number(material.maxQuantityPerServiceOrder);
  if (Number.isFinite(parsed) && parsed > 0) return parsed;
  const sku = String(material.sku || '').trim().toUpperCase();
  return PROTECTED_SERVICE_ORDER_LIMITS[sku] || null;
}

export function validateMaterialServiceOrderQuantity(material, quantity) {
  if (!material || material.requiresSerial) return null;
  const parsedQuantity = Number(quantity || 0);
  if (!Number.isFinite(parsedQuantity) || parsedQuantity <= 0) {
    return `Informe uma quantidade válida para ${material.name}.`;
  }
  const limit = materialServiceOrderQuantityLimit(material);
  if (limit !== null && parsedQuantity > limit) {
    return `O material ${material.name} permite no máximo ${limit} unidade(s) por ordem de serviço. Quantidade informada: ${parsedQuantity}.`;
  }
  return null;
}

export function serviceOrderQuantityInputMax(material, availableQuantity) {
  const available = Number(availableQuantity || 0);
  const limit = materialServiceOrderQuantityLimit(material);
  if (limit === null) return available > 0 ? available : undefined;
  if (available <= 0) return limit;
  return Math.min(available, limit);
}
