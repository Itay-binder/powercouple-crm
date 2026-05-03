import { addHours } from "date-fns";
import { parseTaskInstant } from "@/lib/datetime/taskTimestamps";
import type { RawTaskIn } from "@/lib/tasks/merge";
import { getAuthorizedCalendarClient } from "@/lib/googleCalendar/calendarClient";
import { getGoogleCalendarTokensForTenant } from "@/lib/googleCalendar/tokensRepo";

type EntityMeta = {
  entityType: "contact" | "opportunity";
  entityId: string;
  entityLabel: string;
};

function taskHref(meta: EntityMeta): string {
  const base = process.env.NEXT_PUBLIC_APP_URL?.trim().replace(/\/$/, "") || "";
  const path =
    meta.entityType === "contact"
      ? `/contacts?openContactId=${encodeURIComponent(meta.entityId)}`
      : `/pipeline?openOpportunityId=${encodeURIComponent(meta.entityId)}`;
  return base ? `${base}${path}` : path;
}

function reminderConfig(dueAt: string, reminderAt: string | undefined) {
  const dueD = parseTaskInstant(dueAt);
  const remD = parseTaskInstant(reminderAt);
  if (!dueD || !remD) {
    return { useDefault: true as const };
  }
  const minutesBefore = Math.round((dueD.getTime() - remD.getTime()) / 60000);
  if (minutesBefore < 0 || minutesBefore > 40320) {
    return { useDefault: true as const };
  }
  return {
    useDefault: false as const,
    overrides: [{ method: "popup" as const, minutes: minutesBefore }],
  };
}

function buildEventBody(params: {
  title: string;
  dueAt: string;
  reminderAt?: string;
  meta: EntityMeta;
}) {
  const start = parseTaskInstant(params.dueAt);
  if (!start) throw new Error("Invalid due date for calendar");
  const end = addHours(start, 1);
  const r = reminderConfig(params.dueAt, params.reminderAt);
  return {
    summary: params.title.trim() || "משימת CRM",
    description: `משימה ב-CRM — ${params.meta.entityLabel}\n${taskHref(params.meta)}`,
    start: { dateTime: start.toISOString(), timeZone: "Asia/Jerusalem" },
    end: { dateTime: end.toISOString(), timeZone: "Asia/Jerusalem" },
    reminders: r,
  };
}

export async function reconcileTasksGoogleCalendar(
  prevList: RawTaskIn[] | undefined,
  nextList: RawTaskIn[],
  meta: EntityMeta
): Promise<RawTaskIn[]> {
  const prevById = new Map<string, RawTaskIn>();
  for (const t of prevList ?? []) {
    const id = String(t.id ?? "").trim();
    if (id) prevById.set(id, t);
  }

  const stored = await getGoogleCalendarTokensForTenant();
  const anyWantsSync = nextList.some(
    (t) => t.syncToGoogleCalendar && String(t.googleCalendarId ?? "").trim()
  );
  if (anyWantsSync && !stored) {
    throw new Error("Google Calendar is not connected. Connect under Calendar in the CRM menu.");
  }

  if (!stored) {
    return nextList.map((t) => {
      const c = { ...t };
      delete c.googleEventId;
      delete c.syncToGoogleCalendar;
      delete c.googleCalendarId;
      return c;
    });
  }

  const { calendar } = await getAuthorizedCalendarClient(stored);
  const out: RawTaskIn[] = [];

  for (const t of nextList) {
    const id = String(t.id ?? "").trim();
    const prev = id ? prevById.get(id) : undefined;
    const calId = String(t.googleCalendarId ?? "").trim();
    const wants = Boolean(t.syncToGoogleCalendar && calId);
    const due = String(t.dueAt ?? "").trim();
    const dueOk = Boolean(parseTaskInstant(due));

    let merged: RawTaskIn = { ...t };

    if (!wants || !dueOk) {
      const oldEv = String(prev?.googleEventId ?? merged.googleEventId ?? "").trim();
      const oldCal = String(prev?.googleCalendarId ?? "").trim();
      if (oldEv && oldCal) {
        try {
          await calendar.events.delete({ calendarId: oldCal, eventId: oldEv });
        } catch {
          // ignore if already deleted
        }
      }
      delete merged.googleEventId;
      delete merged.syncToGoogleCalendar;
      delete merged.googleCalendarId;
      out.push(merged);
      continue;
    }

    const title = String(t.title ?? "").trim();
    if (!title) {
      out.push(merged);
      continue;
    }

    const body = buildEventBody({
      title,
      dueAt: due,
      reminderAt: String(t.reminderAt ?? "").trim() || undefined,
      meta,
    });

    const existingEv = String(prev?.googleEventId ?? "").trim();
    const prevCal = String(prev?.googleCalendarId ?? "").trim();
    if (existingEv && prevCal && prevCal !== calId) {
      try {
        await calendar.events.delete({ calendarId: prevCal, eventId: existingEv });
      } catch {
        /* empty */
      }
      delete merged.googleEventId;
    }

    const evId = String(merged.googleEventId ?? "").trim();
    try {
      if (evId) {
        try {
          await calendar.events.update({
            calendarId: calId,
            eventId: evId,
            requestBody: body,
          });
          merged.googleEventId = evId;
        } catch (upErr: unknown) {
          // אירוע נמחק ידנית ב-Google — יוצרים מחדש אחד; בשמירות הבאות נמשיך לעדכן את אותו id
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
            calendarId: calId,
            requestBody: body,
          });
          merged.googleEventId = created.data.id ?? undefined;
        }
      } else {
        const created = await calendar.events.insert({
          calendarId: calId,
          requestBody: body,
        });
        merged.googleEventId = created.data.id ?? undefined;
      }
    } catch (e) {
      const msg = e instanceof Error ? e.message : "Google Calendar error";
      throw new Error(msg);
    }

    out.push(merged);
  }

  return out;
}
