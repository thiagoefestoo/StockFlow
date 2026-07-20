function mimeFromDataUrl(dataUrl = '') {
  const match = String(dataUrl).match(/^data:([^;,]+)[;,]/i);
  return match?.[1] || '';
}

function extensionFromName(name = '') {
  const clean = String(name || '').split('?')[0].toLowerCase();
  const dot = clean.lastIndexOf('.');
  return dot >= 0 ? clean.slice(dot + 1) : '';
}

function isPdfFile(name, dataUrl) {
  const mime = mimeFromDataUrl(dataUrl).toLowerCase();
  return mime.includes('pdf') || extensionFromName(name) === 'pdf';
}

function isImageFile(name, dataUrl) {
  const mime = mimeFromDataUrl(dataUrl).toLowerCase();
  return mime.startsWith('image/') || ['png', 'jpg', 'jpeg', 'webp', 'gif'].includes(extensionFromName(name));
}

function dataUrlToBlobUrl(dataUrl) {
  const value = String(dataUrl || '');
  if (!value.startsWith('data:')) return value;
  const [header, payload] = value.split(',');
  const mime = (header.match(/^data:([^;]+)/i) || [])[1] || 'application/octet-stream';
  const isBase64 = /;base64/i.test(header);
  const binary = isBase64 ? atob(payload || '') : decodeURIComponent(payload || '');
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i += 1) bytes[i] = binary.charCodeAt(i);
  return URL.createObjectURL(new Blob([bytes], { type: mime }));
}

function openAttachment(dataUrl, name) {
  if (!dataUrl) return;
  const url = dataUrlToBlobUrl(dataUrl);
  const win = window.open(url, '_blank', 'noopener,noreferrer');
  if (!win) alert('O navegador bloqueou a visualização. Libere pop-ups para abrir o documento.');
  if (String(url).startsWith('blob:')) setTimeout(() => URL.revokeObjectURL(url), 60000);
}

function downloadAttachment(dataUrl, name) {
  if (!dataUrl) return;
  const url = dataUrlToBlobUrl(dataUrl);
  const a = document.createElement('a');
  a.href = url;
  a.download = name || 'documento-anexo';
  document.body.appendChild(a);
  a.click();
  a.remove();
  if (String(url).startsWith('blob:')) setTimeout(() => URL.revokeObjectURL(url), 30000);
}

export default function AttachmentPreview({ name, data, label = 'Documento anexado', compact = false, showInline = true }) {
  if (!name && !data) return <span className="muted">Sem anexo</span>;
  const fileName = name || 'documento-anexo';
  const hasData = Boolean(data);
  const isPdf = isPdfFile(fileName, data);
  const isImage = isImageFile(fileName, data);

  return (
    <div className={`attachment-preview ${compact ? 'compact' : ''}`}>
      {!compact && <small>{label}</small>}
      <div className="attachment-preview-head">
        <span title={fileName}>{isPdf ? '📄' : isImage ? '🖼️' : '📎'} {fileName}</span>
        {hasData ? <div className="attachment-actions">
          <button type="button" className="info" onClick={() => openAttachment(data, fileName)}>Visualizar</button>
          <button type="button" className="ghost" onClick={() => downloadAttachment(data, fileName)}>Baixar</button>
        </div> : <em>Arquivo registrado, sem dados para visualização.</em>}
      </div>
      {hasData && showInline && !compact && isImage && <img className="signed-img" src={data} alt={fileName} />}
      {hasData && showInline && !compact && isPdf && <div className="pdf-preview-frame"><iframe title={fileName} src={data} /></div>}
    </div>
  );
}
