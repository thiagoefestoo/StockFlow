import Modal from './Modal';

function formatValue(value) {
  if (value === null || value === undefined || value === '') return '-';
  if (typeof value === 'boolean') return value ? 'Sim' : 'Não';
  if (typeof value === 'number') return String(value);
  if (value instanceof Date) return value.toLocaleString('pt-BR');
  if (typeof value === 'string' && /^\d{4}-\d{2}-\d{2}T/.test(value)) return new Date(value).toLocaleString('pt-BR');
  if (Array.isArray(value)) return value.length ? `${value.length} registro(s)` : 'Nenhum';
  if (typeof value === 'object') return value.name || value.title || value.serialNumber || value.requestNumber || value.transferNumber || JSON.stringify(value);
  return String(value);
}

export function DetailGrid({ fields = [] }) {
  return (
    <div className="detail-grid">
      {fields.map(([label, value]) => (
        <div className="detail-item" key={label}>
          <small>{label}</small>
          <strong>{formatValue(value)}</strong>
        </div>
      ))}
    </div>
  );
}

export function DetailList({ title, items = [], render }) {
  return (
    <section className="detail-section">
      <h4>{title}</h4>
      {items.length === 0 && <div className="empty-state">Nenhum registro vinculado.</div>}
      {items.map((item, index) => (
        <div className="detail-row" key={item.id || `${title}-${index}`}>
          {render ? render(item, index) : <span>{formatValue(item)}</span>}
        </div>
      ))}
    </section>
  );
}

export default function DetailsModal({ open, title = 'Detalhes', onClose, children, footer }) {
  return (
    <Modal open={open} title={title} onClose={onClose} footer={footer || <button className="ghost" onClick={onClose}>Fechar</button>}>
      <div className="details-modal">{children}</div>
    </Modal>
  );
}
