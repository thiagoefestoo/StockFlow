export function getTransferAttachments(transfer) {
  if (Array.isArray(transfer?.attachments)) {
    return transfer.attachments.filter((item) => item?.name || item?.data);
  }
  if (transfer?.attachmentName || transfer?.attachmentData) {
    return [{ name: transfer.attachmentName || 'documento-anexado', data: transfer.attachmentData || '' }];
  }
  return [];
}

export function transferAttachmentSummary(transfer) {
  const attachments = getTransferAttachments(transfer);
  if (attachments.length > 1) return `${attachments.length} arquivos anexados`;
  if (attachments.length === 1) return attachments[0].name || '1 arquivo anexado';
  if (Number(transfer?.attachmentCount || 0) > 1) return `${transfer.attachmentCount} arquivos anexados`;
  return transfer?.attachmentName || 'Sem anexo';
}
