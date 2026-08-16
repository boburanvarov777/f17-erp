/** Whitelisted sort builder — prevents arbitrary column injection through query params. */
export function buildOrderBy(
  sortBy: string | undefined,
  sortOrder: 'asc' | 'desc',
  allowed: string[],
  fallback: Record<string, 'asc' | 'desc'>,
): Record<string, unknown> {
  if (sortBy && allowed.includes(sortBy)) {
    if (sortBy.includes('.')) {
      const [rel, field] = sortBy.split('.');
      return { [rel]: { [field]: sortOrder } };
    }
    return { [sortBy]: sortOrder };
  }
  return fallback;
}

export function dateRange(from?: string, to?: string) {
  const r: { gte?: Date; lte?: Date } = {};
  if (from) r.gte = new Date(from);
  if (to) { const d = new Date(to); d.setHours(23, 59, 59, 999); r.lte = d; }
  return Object.keys(r).length ? r : undefined;
}
