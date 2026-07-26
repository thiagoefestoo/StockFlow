export function normalizeSelectionId(value) {
  const normalized = String(value ?? '').trim();
  return normalized || '';
}

export function selectedIdsExcept(items = [], currentIndex = -1, field = 'materialId') {
  return new Set(
    items
      .filter((_, index) => index !== currentIndex)
      .map((item) => normalizeSelectionId(item?.[field]))
      .filter(Boolean)
  );
}

export function optionsWithoutSelected(options = [], items = [], currentIndex = -1, optionField = 'id', itemField = 'materialId') {
  const selected = selectedIdsExcept(items, currentIndex, itemField);
  return options.filter((option) => !selected.has(normalizeSelectionId(option?.[optionField])));
}

export function duplicateItemIds(items = [], field = 'materialId') {
  const seen = new Set();
  const repeated = new Set();
  for (const item of items) {
    const id = normalizeSelectionId(item?.[field]);
    if (!id) continue;
    if (seen.has(id)) repeated.add(id);
    seen.add(id);
  }
  return Array.from(repeated);
}

export function selectedSerialsExcept(items = [], currentIndex = -1, serialExtractor = (item) => item?.serialNumbers || []) {
  const selected = new Set();
  items.forEach((item, index) => {
    if (index === currentIndex) return;
    for (const rawSerial of serialExtractor(item) || []) {
      const serial = String(rawSerial || '').trim().toUpperCase();
      if (serial) selected.add(serial);
    }
  });
  return selected;
}

export function duplicateSerials(items = [], serialExtractor = (item) => item?.serialNumbers || []) {
  const seen = new Set();
  const repeated = new Set();
  for (const item of items) {
    for (const rawSerial of serialExtractor(item) || []) {
      const serial = String(rawSerial || '').trim().toUpperCase();
      if (!serial) continue;
      if (seen.has(serial)) repeated.add(rawSerial);
      seen.add(serial);
    }
  }
  return Array.from(repeated);
}
