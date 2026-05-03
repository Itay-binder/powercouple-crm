/**
 * תצוגה מקומית ישראלית: 97252… → 052… ; שומר 0 כבר בתחילה.
 * מספרים שלא נראים כמו IL — מוחזרים כפי שהם (אחרי ניקוי רווחים).
 */
export function displayPhoneIsraeliLocal(raw: string): string {
  const trimmed = raw.trim();
  if (!trimmed) return "";
  const digits = trimmed.replace(/\D/g, "");
  if (!digits) return trimmed;

  if (digits.startsWith("972")) {
    const rest = digits.slice(3);
    if (rest.length >= 8 && rest.length <= 10) return `0${rest}`;
    return trimmed;
  }

  if (digits.startsWith("0")) return digits;

  if (digits.length === 9 && digits.startsWith("5")) return `0${digits}`;

  return digits;
}
