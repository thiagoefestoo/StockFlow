export function getTransferAttachments(transfer) {
  if (Array.isArray(transfer?.attachments)) {
    return transfer.attachments.filter((item) => item?.name || item?.data);
  }

  if (Array.isArray(transfer?.attachmentNames) && transfer.attachmentNames.length) {
    return transfer.attachmentNames.map((name) => ({ name, data: '' }));
  }

  if (transfer?.attachmentName || transfer?.attachmentData) {
    const summary = String(transfer.attachmentName || '').trim();
    const multiple = summary.match(/^(\d+)\s+arquivos?\s+anexados?$/i);
    if (multiple) {
      return Array.from({ length: Number(multiple[1]) }, (_, index) => ({
        name: `Anexo ${index + 1}`,
        data: '',
      }));
    }
    return [{ name: summary || 'documento-anexado', data: transfer.attachmentData || '' }];
  }

  const count = Number(transfer?.attachmentCount || 0);
  return Array.from({ length: count }, (_, index) => ({ name: `Anexo ${index + 1}`, data: '' }));
}

export function transferAttachmentSummary(transfer) {
  const attachments = getTransferAttachments(transfer);
  if (attachments.length > 1) return `${attachments.length} arquivos anexados`;
  if (attachments.length === 1) return attachments[0].name || '1 arquivo anexado';
  if (Number(transfer?.attachmentCount || 0) > 1) return `${transfer.attachmentCount} arquivos anexados`;
  return transfer?.attachmentName || 'Sem anexo';
}
