/** Raw task shape as stored on lead/opportunity documents (client + server). */
export type RawTaskIn = {
  id?: string;
  title?: string;
  dueAt?: string;
  done?: boolean;
  status?: string;
  comments?: unknown[];
  createdAt?: string;
  reminderAt?: string;
  reminderWebhookFiredAt?: string;
  deadline15mWebhookFiredAt?: string;
  /** סנכרון ל-Google Calendar (לוח שנבחר ב-googleCalendarId) */
  syncToGoogleCalendar?: boolean;
  /** מזהה לוח ב-Google (calendarList id) */
  googleCalendarId?: string;
  /** מזהה אירוע לאחר יצירה/עדכון */
  googleEventId?: string;
};

/**
 * Merge incoming tasks with previous doc tasks so webhook "fired" flags survive UI saves.
 * Resets flags when dueAt or reminderAt change.
 */
export function mergeTaskArrays(prevList: RawTaskIn[] | undefined, incoming: RawTaskIn[]): RawTaskIn[] {
  const prevById = new Map<string, RawTaskIn>();
  for (const t of prevList ?? []) {
    const id = String(t.id ?? "").trim();
    if (id) prevById.set(id, t);
  }
  return incoming.map((inc) => {
    const id = String(inc.id ?? "").trim();
    const prev = id ? prevById.get(id) : undefined;
    const merged: RawTaskIn = { ...(prev ?? {}), ...inc };
    const prevDue = String(prev?.dueAt ?? "").trim();
    const nextDue = String(merged.dueAt ?? "").trim();
    const prevRem = String(prev?.reminderAt ?? "").trim();
    const nextRem = String(merged.reminderAt ?? "").trim();
    if (prevDue !== nextDue || prevRem !== nextRem) {
      delete merged.reminderWebhookFiredAt;
      delete merged.deadline15mWebhookFiredAt;
    } else if (prev) {
      if (prev.reminderWebhookFiredAt) merged.reminderWebhookFiredAt = prev.reminderWebhookFiredAt;
      if (prev.deadline15mWebhookFiredAt) merged.deadline15mWebhookFiredAt = prev.deadline15mWebhookFiredAt;
    }
    return merged;
  });
}
