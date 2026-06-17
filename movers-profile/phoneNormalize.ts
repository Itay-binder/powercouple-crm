/**
 * מספר אחיד לפרופיל מוביל ולהשוואה מול Firebase Phone Auth (+972…).
 * נשמר בלי + — ספרות בלבד, תמיד 972… לנייד ישראלי.
 */
export function normalizePhoneForAuth(raw: string): string {
  const cleaned = String(raw ?? "").replace(/[^\d+]/g, "");
  if (!cleaned) return "";
  if (cleaned.startsWith("+")) {
    return cleaned.slice(1);
  }
  if (cleaned.startsWith("972")) return cleaned;
  if (cleaned.startsWith("0")) return `972${cleaned.slice(1)}`;
  if (cleaned.length === 9 && /^5/.test(cleaned)) return `972${cleaned}`;
  return cleaned;
}
