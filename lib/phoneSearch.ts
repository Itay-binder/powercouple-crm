import { normalizePhone } from "@/lib/leads/repo";

/** Match stored phone against a search string (supports 05…, +972, partial digits). */
export function phoneSearchMatches(stored: string | undefined, queryRaw: string): boolean {
  const q = normalizePhone(queryRaw.trim());
  if (!q) return false;
  const s = normalizePhone(stored) ?? (stored?.replace(/\D/g, "") || "");
  if (!s) return false;
  return s === q || s.includes(q) || q.includes(s);
}
