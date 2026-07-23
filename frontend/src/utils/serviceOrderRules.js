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
