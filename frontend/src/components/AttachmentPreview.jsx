import { useState } from 'react';

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

export default function AttachmentPreview({ name, data, loadData, label = 'Documento anexado', compact = false, showInline = true }) {
  const [viewerOpen, setViewerOpen] = useState(false);
  const [loadedData, setLoadedData] = useState('');
  const [loading, setLoading] = useState(false);
  const [loadError, setLoadError] = useState('');

  if (!name && !data) return <span className="muted">Sem anexo</span>;

  const fileName = name || 'documento-anexo';
  const resolvedData = data || loadedData;
  const hasData = Boolean(resolvedData);
  const canLoad = typeof loadData === 'function';
  const isPdf = isPdfFile(fileName, resolvedData);
  const isImage = isImageFile(fileName, resolvedData);
  const canPreview = (hasData || canLoad) && (isPdf || isImage || canLoad);

  async function ensureData() {
    if (resolvedData) return resolvedData;
    if (!canLoad || loading) return '';
    setLoading(true);
    setLoadError('');
    try {
      const result = await loadData();
      const nextData = result?.data || result?.attachmentData || result || '';
      if (!nextData) throw new Error('Arquivo sem conteúdo disponível.');
      setLoadedData(nextData);
      return nextData;
    } catch (error) {
      setLoadError(error?.response?.data?.message || error?.message || 'Não foi possível carregar o arquivo.');
      return '';
    } finally {
      setLoading(false);
    }
  }

  async function openViewer() {
    const value = await ensureData();
    if (value) setViewerOpen(true);
  }

  async function downloadFile() {
    const value = await ensureData();
    if (value) downloadAttachment(value, fileName);
  }

  return (
    <div className={`attachment-preview ${compact ? 'compact' : ''}`}>
      {!compact && <small>{label}</small>}
      <div className="attachment-preview-head">
        <span title={fileName}>{isPdf ? '📄' : isImage ? '🖼️' : '📎'} {fileName}</span>
        {(hasData || canLoad) ? <div className="attachment-actions">
          {canPreview && <button type="button" className="info" disabled={loading} onClick={openViewer}>{loading ? 'Carregando...' : 'Visualizar'}</button>}
          <button type="button" className="ghost" disabled={loading} onClick={downloadFile}>{loading ? 'Carregando...' : 'Baixar'}</button>
        </div> : <em>Arquivo registrado, sem dados para visualização.</em>}
      </div>

      {hasData && showInline && !compact && isImage && <img className="signed-img" src={resolvedData} alt={fileName} />}
      {hasData && showInline && !compact && isPdf && <div className="pdf-preview-frame"><iframe title={fileName} src={resolvedData} /></div>}
      {loadError && <small className="danger-text">{loadError}</small>}

      {viewerOpen && canPreview && (
        <div className="attachment-modal-backdrop" role="presentation" onClick={() => setViewerOpen(false)}>
          <div className="attachment-modal" role="dialog" aria-modal="true" aria-label={`Visualização de ${fileName}`} onClick={(event) => event.stopPropagation()}>
            <div className="attachment-modal-head">
              <div>
                <strong>{isPdf ? 'Visualização do PDF' : 'Visualização do anexo'}</strong>
                <span>{fileName}</span>
              </div>
              <button type="button" className="ghost" onClick={() => setViewerOpen(false)}>Fechar</button>
            </div>
            <div className="attachment-modal-body">
              {isPdf && <iframe title={`PDF ${fileName}`} src={resolvedData} />}
              {isImage && <img src={resolvedData} alt={fileName} />}
            </div>
            <div className="attachment-modal-actions">
              <button type="button" className="primary" onClick={() => downloadAttachment(resolvedData, fileName)}>Baixar documento</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
