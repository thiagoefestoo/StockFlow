function timestamp(value) {
  if (!value) return 0;
  const parsed = new Date(value).getTime();
  return Number.isFinite(parsed) ? parsed : 0;
}

function numericId(value) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : 0;
}

export function sortRecentFirst(items, dateFields = ['updatedAt', 'createdAt']) {
  if (!Array.isArray(items)) return [];

  return [...items].sort((left, right) => {
    for (const field of dateFields) {
      const difference = timestamp(right?.[field]) - timestamp(left?.[field]);
      if (difference) return difference;
    }

    return numericId(right?.id) - numericId(left?.id);
  });
}

export function sortNestedRecentFirst(payload, definitions = {}) {
  if (!payload || typeof payload !== 'object') return payload;

  const sorted = { ...payload };

  Object.entries(definitions).forEach(([key, dateFields]) => {
    sorted[key] = sortRecentFirst(payload[key], dateFields);
  });

  return sorted;
}
