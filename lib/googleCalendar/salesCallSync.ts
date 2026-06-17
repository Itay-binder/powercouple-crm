import { addMinutes } from "date-fns";
import { FieldValue } from "firebase-admin/firestore";
import { parseTaskInstant } from "@/lib/datetime/taskTimestamps";
import type { SalesCallRecord } from "@/lib/calls/repo";
import { getAuthorizedCalendarClient } from "@/lib/googleCalendar/calendarClient";
import { getGoogleCalendarTokensForTenant } from "@/lib/googleCalendar/tokensRepo";

function callHref(contactId: string): string {
  const base = process.env.NEXT_PUBLIC_APP_URL?.trim().replace(/\/$/, "") || "";
  const path = `/contacts?openContactId=${encodeURIComponent(contactId)}`;
  return base ? `${base}${path}` : path;
}

function buildSalesCallEventBody(rec: SalesCallRecord) {
  const start = parseTaskInstant(rec.scheduledAt ?? "");
  if (!start) throw new Error("Invalid scheduled time for calendar");
  const end = addMinutes(start, 30);
  const titleBase = String(rec.title ?? "").trim();
  const summary =
    titleBase ||
    `שיחה: ${String(rec.contactName ?? "").trim() || "איש קשר"}`;
  const noteLine = String(rec.note ?? "").trim();
  const lines = [
    `שיחת CRM — ${rec.contactName || rec.contactId}`,
    rec.contactPhone ? `טלפון: ${rec.contactPhone}` : null,
    `נציג: ${rec.repName}`,
    noteLine ? `הערה: ${noteLine}` : null,
    callHref(rec.contactId),
  ].filter(Boolean);
  return {
    summary: summary.slice(0, 1024),
    description: lines.join("\n"),
    start: { dateTime: start.toISOString(), timeZone: "Asia/Jerusalem" },
    end: { dateTime: end.toISOString(), timeZone: "Asia/Jerusalem" },
    reminders: {
      useDefault: false as const,
      overrides: [{ method: "popup" as const, minutes: 15 }],
    },
  };
}

export type SalesCallCalendarInput = {
  syncToGoogleCalendar?: boolean;
  googleCalendarId?: string;
};

/**
 * מחזיר שדות למיזוג ל-Firestore אחרי יצירה/עדכון שיחה.
 * דורש חיבור Calendar כשמבקשים סנכרון.
 */
export async function reconcileSalesCallGoogleCalendar(
  prev: SalesCallRecord | null,
  next: SalesCallRecord,
  input: SalesCallCalendarInput
): Promise<Record<string, unknown>> {
  const calIdInput = String(input.googleCalendarId ?? "").trim();
  const calIdPrev = String(prev?.googleCalendarId ?? "").trim();
  const calId = calIdInput || calIdPrev;

  const wantExplicit =
    input.syncToGoogleCalendar !== undefined ? Boolean(input.syncToGoogleCalendar) : undefined;
  const wantStored = Boolean(prev?.syncToGoogleCalendar);
  const wantsSync = wantExplicit !== undefined ? wantExplicit : wantStored;

  const scheduledOk = Boolean(parseTaskInstant(next.scheduledAt ?? ""));
  const effectiveWant =
    wantsSync &&
    Boolean(calId) &&
    scheduledOk &&
    next.status === "pending";

  const oldEv = String(prev?.googleEventId ?? "").trim();
  const oldCal = String(prev?.googleCalendarId ?? "").trim();

  const stored = await getGoogleCalendarTokensForTenant();

  async function deleteOldEvent() {
    if (!oldEv || !oldCal) return;
    if (!stored) return;
    try {
      const { calendar } = await getAuthorizedCalendarClient(stored);
      await calendar.events.delete({ calendarId: oldCal, eventId: oldEv });
    } catch {
      /* אירוע כבר לא קיים */
    }
  }

  if (!effectiveWant) {
    await deleteOldEvent();
    return {
      syncToGoogleCalendar: false,
      googleCalendarId: FieldValue.delete(),
      googleEventId: FieldValue.delete(),
    };
  }

  if (!stored) {
    throw new Error(
      "Google Calendar is not connected. Connect under Calendar in the CRM menu."
    );
  }

  const { calendar } = await getAuthorizedCalendarClient(stored);
  const body = buildSalesCallEventBody(next);
  const targetCal = calId;

  if (oldEv && oldCal && oldCal !== targetCal) {
    try {
      await calendar.events.delete({ calendarId: oldCal, eventId: oldEv });
    } catch {
      /* empty */
    }
  }

  let eventId = String(next.googleEventId ?? "").trim();
  try {
    if (eventId) {
      try {
        await calendar.events.update({
          calendarId: targetCal,
          eventId,
          requestBody: body,
        });
      } catch (upErr: unknown) {
        const o = upErr && typeof upErr === "object" ? (upErr as Record<string, unknown>) : {};
        const resp = o.response as { status?: number } | undefined;
        const status = resp?.status ?? (typeof o.status === "number" ? o.status : 0);
        const notFound =
          status === 404 ||
          (upErr instanceof Error && /404|not found|Not Found/i.test(upErr.message));
        if (!notFound) {
          const msg = upErr instanceof Error ? upErr.message : "Google Calendar error";
          throw new Error(msg);
        }
        const created = await calendar.events.insert({
          calendarId: targetCal,
          requestBody: body,
        });
        eventId = String(created.data.id ?? "");
      }
    } else {
      const created = await calendar.events.insert({
        calendarId: targetCal,
        requestBody: body,
      });
      eventId = String(created.data.id ?? "");
    }
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Google Calendar error";
    throw new Error(msg);
  }

  if (!eventId) {
    throw new Error("Google Calendar did not return an event id");
  }

  return {
    syncToGoogleCalendar: true,
    googleCalendarId: targetCal,
    googleEventId: eventId,
  };
}

/** לפני מחיקת מסמך שיחה — מסיר אירוע מ-Google Calendar אם קיים. */
export async function deleteSalesCallCalendarEventIfAny(prev: {
  googleEventId?: string;
  googleCalendarId?: string;
} | null): Promise<void> {
  const oldEv = String(prev?.googleEventId ?? "").trim();
  const oldCal = String(prev?.googleCalendarId ?? "").trim();
  if (!oldEv || !oldCal) return;
  const stored = await getGoogleCalendarTokensForTenant();
  if (!stored) return;
  try {
    const { calendar } = await getAuthorizedCalendarClient(stored);
    await calendar.events.delete({ calendarId: oldCal, eventId: oldEv });
  } catch {
    /* כבר נמחק או אין הרשאה */
  }
}
