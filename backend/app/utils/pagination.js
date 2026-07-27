function parsePositiveInteger(value, fallback) {
  const parsed = Number.parseInt(value, 10);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
}

function paginationFromQuery(query = {}, options = {}) {
  const requested = query.page !== undefined || query.pageSize !== undefined;
  if (!requested) return { enabled: false };

  const defaultPageSize = parsePositiveInteger(options.defaultPageSize, 15);
  const maxPageSize = parsePositiveInteger(options.maxPageSize, 100);
  const page = parsePositiveInteger(query.page, 1);
  const pageSize = Math.min(parsePositiveInteger(query.pageSize, defaultPageSize), maxPageSize);

  return {
    enabled: true,
    page,
    pageSize,
    limit: pageSize,
    offset: (page - 1) * pageSize,
  };
}

function paginationMeta(total, page, pageSize) {
  const safeTotal = Math.max(Number(total || 0), 0);
  const safePageSize = Math.max(Number(pageSize || 15), 1);
  const totalPages = Math.max(Math.ceil(safeTotal / safePageSize), 1);
  const safePage = Math.min(Math.max(Number(page || 1), 1), totalPages);

  return {
    page: safePage,
    pageSize: safePageSize,
    total: safeTotal,
    totalPages,
    hasPreviousPage: safePage > 1,
    hasNextPage: safePage < totalPages,
  };
}

module.exports = { paginationFromQuery, paginationMeta };
