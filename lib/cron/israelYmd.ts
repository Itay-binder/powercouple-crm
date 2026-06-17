import { format } from "date-fns";
import { TZDate } from "@date-fns/tz";
import { CRM_TASK_TIMEZONE } from "@/lib/datetime/taskTimestamps";

/** תאריך לוח שנה (YYYY-MM-DD) בשעון ישראל — לסינון "היום" בהזמנות. */
export function israelCalendarYmd(now: Date = new Date()): string {
  const z = new TZDate(now.getTime(), CRM_TASK_TIMEZONE);
  return format(z, "yyyy-MM-dd");
}

export function createdAtYmdInIsrael(createdAtIso: string | null | undefined): string | null {
  if (!createdAtIso?.trim()) return null;
  const d = new Date(createdAtIso.trim());
  if (Number.isNaN(d.getTime())) return null;
  const z = new TZDate(d.getTime(), CRM_TASK_TIMEZONE);
  return format(z, "yyyy-MM-dd");
}
