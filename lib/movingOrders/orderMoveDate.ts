import type { MovingOrderPayload } from "@/lib/movingOrders/types";

/**
 * מפרש תאריך הובלה ממחרוזת (YYYY-MM-DD או DD/MM/YYYY וכו׳) ל־Date בצהריים +03:00
 */
export function parseMovingOrderDateToNoon(raw: string | undefined | null): Date | null {
  if (!raw?.trim()) return null;
  const t = raw.trim();
  const iso = /^(\d{4})-(\d{2})-(\d{2})$/.exec(t);
  if (iso) return new Date(`${iso[1]}-${iso[2]}-${iso[3]}T12:00:00+03:00`);
  const dmy = /^(\d{1,2})[./-](\d{1,2})[./-](\d{4})$/.exec(t);
  if (dmy) {
    const day = dmy[1].padStart(2, "0");
    const month = dmy[2].padStart(2, "0");
    const year = dmy[3];
    return new Date(`${year}-${month}-${day}T12:00:00+03:00`);
  }
  const tryMs = Date.parse(t);
  if (!Number.isNaN(tryMs)) return new Date(tryMs);
  return null;
}

/** YYYY-MM-DD בלוח ירושלים (להשוואת «היום / מחר») */
export function movingOrderDateYmdIsrael(raw: string | undefined | null): string {
  const dt = parseMovingOrderDateToNoon(raw);
  if (!dt || Number.isNaN(dt.getTime())) return "";
  return dt.toLocaleDateString("en-CA", { timeZone: "Asia/Jerusalem" });
}

/** יום בשבוע בעברית מתאריך ההובלה (או טקסט שדה יום אם קיים) */
export function hebrewWeekdayMovingOrder(
  payload: MovingOrderPayload,
  cv: Record<string, unknown> | undefined
): string {
  const label = String(cv?.moving_order_day_order ?? payload.day_order ?? "").trim();
  if (label) return label;
  const raw = String(cv?.moving_order_date ?? payload.date ?? "").trim();
  const dt = parseMovingOrderDateToNoon(raw);
  if (!dt || Number.isNaN(dt.getTime())) return "";
  return dt.toLocaleDateString("he-IL", { weekday: "long", timeZone: "Asia/Jerusalem" });
}
