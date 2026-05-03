/** מחלץ YYYY-MM-DD מתא בגיליון (תומך ISO, תאריך בלבד, ועוד) — להשוואה לטווח. */
export function parseCellToYmd(value: string): string | null {
  const t = value.trim();
  if (!t) return null;

  const isoDate = t.match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (isoDate) {
    return `${isoDate[1]}-${isoDate[2]}-${isoDate[3]}`;
  }

  const slash = t.match(/^(\d{1,2})[/.](\d{1,2})[/.](\d{4})/);
  if (slash) {
    const d = slash[1].padStart(2, "0");
    const m = slash[2].padStart(2, "0");
    const y = slash[3];
    return `${y}-${m}-${d}`;
  }

  const d = new Date(t);
  if (Number.isNaN(d.getTime())) return null;
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Jerusalem",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(d);
}

