import Modal from './Modal';
import { formatQuantity } from '../utils/formatQuantity';

function brl(value) {
  return Number(value || 0).toLocaleString('pt-BR', {
    style: 'currency',
    currency: 'BRL',
  });
}

export default function OperationReviewModal({
  open,
  title = 'Revisar operação',
  description = 'Confira os dados antes de confirmar. Nenhuma movimentação ocorre enquanto esta etapa não for aceita.',
  metadata = [],
  items = [],
  totalQuantity,
  totalValue,
  warning,
  confirmLabel = 'Confirmar operação',
  cancelLabel = 'Voltar e corrigir',
  loading = false,
  onRemoveItem,
  removeItemLabel = 'Excluir item',
  onCancel,
  onConfirm,
}) {
  const calculatedQuantity = totalQuantity ?? items.reduce((sum, item) => sum + Number(item.quantity || 0), 0);
  const calculatedValue = totalValue ?? items.reduce((sum, item) => sum + Number(item.totalValue || 0), 0);

  return (
    <Modal
      open={open}
      title={title}
      onClose={() => !loading && onCancel?.()}
      footer={(
        <>
          <button type="button" className="ghost" disabled={loading} onClick={onCancel}>{cancelLabel}</button>
          <button type="button" disabled={loading} onClick={onConfirm}>{loading ? 'Processando...' : confirmLabel}</button>
        </>
      )}
    >
      <div className="operation-review">
        <div className="operation-review-intro">
          <span className="operation-review-icon">✓</span>
          <div>
            <strong>Última conferência antes de movimentar o estoque</strong>
            <p>{description}</p>
          </div>
        </div>

        {metadata.length > 0 && (
          <section className="operation-review-meta">
            {metadata.filter((entry) => entry && entry.label).map((entry, index) => (
              <article key={`${entry.label}-${index}`}>
                <small>{entry.label}</small>
                <strong>{entry.value || '-'}</strong>
                {entry.hint && <span>{entry.hint}</span>}
              </article>
            ))}
          </section>
        )}

        <section className="operation-review-table">
          <div className="subtoolbar">
            <div>
              <h4>Itens da operação</h4>
              <small>{items.length} linha(s) para conferência</small>
            </div>
          </div>
          <div className="table-wrap">
            <table>
              <thead>
                <tr>
                  <th>#</th>
                  <th>Item</th>
                  <th>Quantidade</th>
                  <th>Seriais</th>
                  <th>Valor</th>
                  {onRemoveItem && <th className="action-cell">Ação</th>}
                </tr>
              </thead>
              <tbody>
                {items.map((item, index) => (
                  <tr key={item.key || `${item.name}-${index}`}>
                    <td>{index + 1}</td>
                    <td>
                      <strong>{item.name || 'Item'}</strong>
                      {item.detail && <><br /><small>{item.detail}</small></>}
                    </td>
                    <td>{formatQuantity(item.quantity || 0)} {item.unit || ''}</td>
                    <td>
                      {Number(item.serialCount || 0) > 0 ? (
                        <>
                          <strong>{formatQuantity(item.serialCount)} serial(is)</strong>
                          {item.serialPreview && <><br /><small>{item.serialPreview}</small></>}
                        </>
                      ) : 'Não se aplica'}
                    </td>
                    <td>{brl(item.totalValue)}</td>
                    {onRemoveItem && (
                      <td className="action-cell">
                        <button
                          type="button"
                          className="ghost danger-outline operation-review-remove"
                          disabled={loading}
                          onClick={() => onRemoveItem(item, index)}
                        >
                          🗑️ {removeItemLabel}
                        </button>
                      </td>
                    )}
                  </tr>
                ))}
                {!items.length && <tr><td colSpan={onRemoveItem ? 6 : 5}><div className="empty-state">Nenhum item selecionado.</div></td></tr>}
              </tbody>
            </table>
          </div>
        </section>

        <section className="operation-review-totals">
          <article><small>Quantidade total</small><strong>{formatQuantity(calculatedQuantity)}</strong><span>Soma de todos os itens selecionados</span></article>
          <article><small>Valor total previsto</small><strong>{brl(calculatedValue)}</strong><span>Quantidade × valor unitário ou custo do serial</span></article>
        </section>

        {warning && <div className="alert warning operation-review-warning">{warning}</div>}
      </div>
    </Modal>
  );
}
