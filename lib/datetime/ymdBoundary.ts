/** YYYY-MM-DD boundaries in UTC (same semantics as lead filtering). */
export function parseYmdBoundary(dateStr: string, mode: "from" | "to"): Date {
  const [y, m, d] = dateStr.split("-").map((x) => Number.parseInt(x, 10));
  if (!y || !m || !d) return new Date(0);
  if (mode === "from") return new Date(Date.UTC(y, m - 1, d, 0, 0, 0));
  return new Date(Date.UTC(y, m - 1, d, 23, 59, 59, 999));
}

export function createdAtInYmdRange(
  createdAt: Date | null,
  dateFrom?: string | null,
  dateTo?: string | null
): boolean {
  const from = dateFrom?.trim();
  const to = dateTo?.trim();
  if (!from && !to) return true;
  if (!createdAt) return false;
  const t = createdAt.getTime();
  const fromDate = from ? parseYmdBoundary(from, "from") : null;
  const toDate = to ? parseYmdBoundary(to, "to") : null;
  if (fromDate && t < fromDate.getTime()) return false;
  if (toDate && t > toDate.getTime()) return false;
  return true;
}

export function isoCreatedAtInYmdRange(
  createdAtIso: string | null | undefined,
  dateFrom?: string | null,
  dateTo?: string | null
): boolean {
  if (!createdAtIso?.trim()) return false;
  const d = new Date(createdAtIso);
  if (Number.isNaN(d.getTime())) return false;
  return createdAtInYmdRange(d, dateFrom, dateTo);
}
