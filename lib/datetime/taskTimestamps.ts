import { addDays } from "date-fns";
import { TZDate } from "@date-fns/tz";

/** שעון ישראל לכל ערכי datetime-local ולמחרוזות תאריך בלי אזור (במערכת CRM זו). */
export const CRM_TASK_TIMEZONE = "Asia/Jerusalem";

/**
 * מחרוזת שמורה (ISO עם Z/offset, או ערך "נאיבי" YYYY-MM-DDTHH:mm) → מועד UTC אבסולוטי.
 * בלי סיומת אזור — נחשב כשעון קיר בישראל (DST כלול ב-TZDate).
 */
export function parseTaskInstant(raw: string | undefined): Date | null {
  const s = String(raw ?? "").trim();
  if (!s) return null;

  const trimmed = s.trim();
  const hasExplicitZone =
    /Z$/i.test(trimmed) ||
    /[+-]\d{2}:\d{2}$/.test(trimmed) ||
    /[+-]\d{4}$/.test(trimmed);
  if (hasExplicitZone) {
    const d = new Date(trimmed);
    if (!Number.isNaN(d.getTime())) return d;
  }

  const m = /^(\d{4})-(\d{2})-(\d{2})[T ](\d{2}):(\d{2})(?::(\d{2}))?(?:\.(\d{1,3}))?/.exec(trimmed);
  if (m) {
    const y = Number(m[1]);
    const mo = Number(m[2]);
    const d = Number(m[3]);
    const h = Number(m[4]);
    const mi = Number(m[5]);
    const sec = m[6] ? Number(m[6]) : 0;
    const msPart = m[7] ? m[7].padEnd(3, "0").slice(0, 3) : "000";
    const ms = Number(msPart);
    const z = new TZDate(y, mo - 1, d, h, mi, sec, ms, CRM_TASK_TIMEZONE);
    return new Date(z.getTime());
  }

  const d = new Date(trimmed);
  if (!Number.isNaN(d.getTime())) return d;
  const alt = new Date(trimmed.replace(" ", "T"));
  return Number.isNaN(alt.getTime()) ? null : alt;
}

/** ערך מ-<input type="datetime-local"> שמייצג שעון ישראל → ISO לשמירה ב-Firestore */
export function naiveLocalInputToStoredIso(v: string): string {
  const s = v.trim();
  if (!s) return "";
  const m = /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})(?::(\d{2}))?/.exec(s);
  if (m) {
    const y = Number(m[1]);
    const mo = Number(m[2]);
    const d = Number(m[3]);
    const h = Number(m[4]);
    const mi = Number(m[5]);
    const sec = m[6] ? Number(m[6]) : 0;
    const z = new TZDate(y, mo - 1, d, h, mi, sec, 0, CRM_TASK_TIMEZONE);
    return new Date(z.getTime()).toISOString();
  }
  const fallback = new Date(s);
  return Number.isNaN(fallback.getTime()) ? s : fallback.toISOString();
}

/** ISO שמור (UTC) → מחרוזת datetime-local לפי שעון ישראל */
export function utcIsoToJerusalemDatetimeLocal(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "";
  const z = new TZDate(d, CRM_TASK_TIMEZONE);
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${z.getFullYear()}-${pad(z.getMonth() + 1)}-${pad(z.getDate())}T${pad(z.getHours())}:${pad(z.getMinutes())}`;
}

/** YYYY-MM-DD לפי לוח שנה בישראל */
export function formatIsraelYmdUtc(instant: Date): string {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: CRM_TASK_TIMEZONE,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(instant);
}

export function israelTodayAndTomorrowKeys(now = new Date()): { today: string; tomorrow: string } {
  const today = formatIsraelYmdUtc(now);
  const z = new TZDate(now.getTime(), CRM_TASK_TIMEZONE);
  const next = addDays(z, 1);
  const pad = (n: number) => String(n).padStart(2, "0");
  const tomorrow = `${next.getFullYear()}-${pad(next.getMonth() + 1)}-${pad(next.getDate())}`;
  return { today, tomorrow };
}
