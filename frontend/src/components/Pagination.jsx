export default function Pagination({ page = 1, pageSize = 15, total = 0, totalPages = 1, onPageChange, loading = false }) {
  const currentPage = Math.max(Number(page || 1), 1);
  const pages = Math.max(Number(totalPages || 1), 1);
  const firstItem = total ? ((currentPage - 1) * pageSize) + 1 : 0;
  const lastItem = total ? Math.min(currentPage * pageSize, total) : 0;

  if (pages <= 1 && total <= pageSize) return null;

  return (
    <nav className="pagination" aria-label="Paginação da lista">
      <span>{total ? `${firstItem}-${lastItem} de ${total}` : 'Nenhum registro'}</span>
      <div className="pagination-actions">
        <button type="button" className="ghost" disabled={loading || currentPage <= 1} onClick={() => onPageChange?.(currentPage - 1)}>Anterior</button>
        <strong>Página {currentPage} de {pages}</strong>
        <button type="button" className="ghost" disabled={loading || currentPage >= pages} onClick={() => onPageChange?.(currentPage + 1)}>Próxima</button>
      </div>
    </nav>
  );
}
