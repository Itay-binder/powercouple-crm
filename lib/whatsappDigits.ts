/** מספר ספרות ל-wa.me (972… או מספר בלי קידומת בינלאומית כשאפשר) */
export function digitsForWhatsAppMe(raw: string): string | null {
  let d = raw.replace(/\D/g, "");
  if (!d) return null;
  if (d.startsWith("972")) return d;
  if (d.startsWith("0") && d.length >= 9) return `972${d.slice(1)}`;
  if (d.length >= 8) return d;
  return null;
}
