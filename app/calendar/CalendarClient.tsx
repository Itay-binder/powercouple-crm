"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { useSearchParams } from "next/navigation";
import { addWeeks, endOfWeek, format, startOfWeek } from "date-fns";
import { TZDate } from "@date-fns/tz";
import { formatIsraelDateTime } from "@/lib/datetime/formatIsrael";
import { parseTaskInstant } from "@/lib/datetime/taskTimestamps";

const CRM_TZ = "Asia/Jerusalem";

type ViewTab = "month" | "list";

type GCal = { id: string; summary?: string; primary?: boolean };
type GEvent = { id: string; summary: string; start: string; end: string; htmlLink: string };

type CrmTask = {
  id: string;
  title: string;
  dueAt: string;
  reminderAt?: string;
  entityType: "contact" | "opportunity";
  entityId: string;
  entityName: string;
  syncToGoogleCalendar?: boolean;
  googleCalendarId?: string;
};

function crmTaskKey(t: CrmTask): string {
  return `${t.entityType}|${t.entityId}|${t.id}`;
}

function israelNow(): TZDate {
  return new TZDate(new Date(), CRM_TZ);
}

function weekRangeIsrael(weekOffset: number): { timeMin: string; timeMax: string; label: string } {
  const now = israelNow();
  const start = startOfWeek(addWeeks(now, weekOffset), { weekStartsOn: 0 });
  const end = endOfWeek(addWeeks(now, weekOffset), { weekStartsOn: 0 });
  const timeMin = new Date(start.getTime()).toISOString();
  const timeMax = new Date(end.getTime()).toISOString();
  const label = `${format(start, "d MMM", { locale: undefined })} – ${format(end, "d MMM yyyy")}`;
  return { timeMin, timeMax, label };
}

/** הטמעת iframe רשמית של Google Calendar — דורשת שמשתמש יהיה מחובר ל-Google בדפדפן */
function buildGoogleCalendarEmbedSrc(calId: string, accountEmail: string | null): string | null {
  let raw = calId.trim();
  if (raw === "primary") {
    const em = accountEmail?.trim();
    if (!em) return null;
    raw = em;
  }
  const q = new URLSearchParams();
  q.set("src", raw);
  q.set("ctz", CRM_TZ);
  q.set("mode", "MONTH");
  return `https://calendar.google.com/calendar/embed?${q.toString()}`;
}

export default function CalendarClient() {
  const searchParams = useSearchParams();
  const [viewTab, setViewTab] = useState<ViewTab>("list");
  const [connected, setConnected] = useState(false);
  const [accountEmail, setAccountEmail] = useState<string | null>(null);
  const [calendars, setCalendars] = useState<GCal[]>([]);
  const [calId, setCalId] = useState("primary");
  const [weekOffset, setWeekOffset] = useState(0);
  const [events, setEvents] = useState<GEvent[]>([]);
  const [crmTasks, setCrmTasks] = useState<CrmTask[]>([]);
  const [loading, setLoading] = useState(true);
  const [eventsLoading, setEventsLoading] = useState(false);
  const [syncing, setSyncing] = useState(false);
  const [crmCardSyncKey, setCrmCardSyncKey] = useState<string | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [syncMsg, setSyncMsg] = useState<string | null>(null);

  const weekRange = useMemo(() => weekRangeIsrael(weekOffset), [weekOffset]);
  const { timeMin, timeMax, label: rangeLabel } = weekRange;

  const embedSrc = useMemo(
    () => (connected ? buildGoogleCalendarEmbedSrc(calId, accountEmail) : null),
    [connected, calId, accountEmail]
  );

  const loadStatus = useCallback(async () => {
    const res = await fetch("/api/google-calendar/status", { credentials: "include", cache: "no-store" });
    const j = (await res.json().catch(() => ({}))) as {
      ok?: boolean;
      connected?: boolean;
      accountEmail?: string | null;
    };
    if (res.ok && j.ok) {
      setConnected(Boolean(j.connected));
      setAccountEmail(j.accountEmail ?? null);
    }
  }, []);

  const loadCalendars = useCallback(async () => {
    const res = await fetch("/api/google-calendar/calendars", { credentials: "include", cache: "no-store" });
    const j = (await res.json().catch(() => ({}))) as { ok?: boolean; calendars?: GCal[] };
    if (res.ok && j.ok && j.calendars?.length) {
      setCalendars(j.calendars);
      const primary = j.calendars.find((c) => c.primary);
      setCalId((prev) => {
        if (prev !== "primary" && j.calendars!.some((c) => c.id === prev)) return prev;
        return primary?.id ?? j.calendars![0]!.id;
      });
    }
  }, []);

  const loadEvents = useCallback(async () => {
    if (!connected || !calId || viewTab !== "list") return;
    setEventsLoading(true);
    setErr(null);
    try {
      const u = new URL("/api/google-calendar/events", window.location.origin);
      u.searchParams.set("calendarId", calId);
      u.searchParams.set("timeMin", timeMin);
      u.searchParams.set("timeMax", timeMax);
      const res = await fetch(u.toString(), { credentials: "include", cache: "no-store" });
      const j = (await res.json().catch(() => ({}))) as { ok?: boolean; events?: GEvent[]; error?: string };
      if (!res.ok || !j.ok) throw new Error(j.error ?? "טעינת אירועים נכשלה");
      setEvents(j.events ?? []);
    } catch (e) {
      setErr(e instanceof Error ? e.message : "טעינת אירועים נכשלה");
      setEvents([]);
    } finally {
      setEventsLoading(false);
    }
  }, [connected, calId, timeMin, timeMax, viewTab]);

  const loadCrmTasks = useCallback(async () => {
    const res = await fetch("/api/tasks", { credentials: "include", cache: "no-store" });
    const j = (await res.json().catch(() => ({}))) as { ok?: boolean; tasks?: CrmTask[] };
    if (res.ok && j.ok) setCrmTasks(j.tasks ?? []);
  }, []);

  useEffect(() => {
    void (async () => {
      setLoading(true);
      await loadStatus();
      await loadCrmTasks();
      setLoading(false);
    })();
  }, [loadStatus, loadCrmTasks]);

  useEffect(() => {
    if (!connected) return;
    void loadCalendars();
  }, [connected, loadCalendars]);

  useEffect(() => {
    void loadEvents();
  }, [loadEvents]);

  useEffect(() => {
    const e = searchParams.get("gcal_error");
    const ok = searchParams.get("gcal_connected");
    if (e) setErr(decodeURIComponent(e));
    if (ok) setSyncMsg("החיבור ל-Google Calendar הושלם.");
  }, [searchParams]);

  const tasksThisWeek = useMemo(() => {
    const t0 = new Date(weekRange.timeMin).getTime();
    const t1 = new Date(weekRange.timeMax).getTime();
    return crmTasks.filter((t) => {
      const d = parseTaskInstant(t.dueAt);
      if (!d) return false;
      const x = d.getTime();
      return x >= t0 && x <= t1;
    });
  }, [crmTasks, weekRange.timeMin, weekRange.timeMax]);

  async function onSyncTasks() {
    setSyncing(true);
    setSyncMsg(null);
    setErr(null);
    try {
      const res = await fetch("/api/google-calendar/sync-tasks", {
        method: "POST",
        credentials: "include",
      });
      const j = (await res.json().catch(() => ({}))) as {
        ok?: boolean;
        synced?: number;
        considered?: number;
        errors?: string[];
        error?: string;
      };
      if (!res.ok || !j.ok) throw new Error(j.error ?? "סנכרון נכשל");
      const extra = j.errors?.length ? ` (${j.errors.slice(0, 2).join("; ")})` : "";
      setSyncMsg(`סונכרנו ${j.synced ?? 0} מתוך ${j.considered ?? 0} משימות.${extra}`);
      await loadCrmTasks();
      await loadEvents();
    } catch (e) {
      setErr(e instanceof Error ? e.message : "סנכרון נכשל");
    } finally {
      setSyncing(false);
    }
  }

  async function syncSingleCrmTaskToCalendar(t: CrmTask) {
    if (!connected) return;
    const dueOk = Boolean(parseTaskInstant(String(t.dueAt ?? "").trim()));
    if (!dueOk) {
      setErr("לסנכרון ללוח שנה נדרש דדליין למשימה. ערכו את המשימה והוסיפו דדליין.");
      return;
    }
    const gcal = calId.trim();
    if (!gcal) {
      setErr("בחרו לוח יעד למעלה.");
      return;
    }
    const k = crmTaskKey(t);
    setCrmCardSyncKey(k);
    setErr(null);
    try {
      const res = await fetch("/api/tasks", {
        method: "PATCH",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          entityType: t.entityType,
          entityId: t.entityId,
          taskId: t.id,
          syncToGoogleCalendar: true,
          googleCalendarId: gcal,
        }),
      });
      const j = (await res.json().catch(() => ({}))) as {
        ok?: boolean;
        error?: string;
        task?: CrmTask;
      };
      if (!res.ok || !j.ok || !j.task) throw new Error(j.error ?? "סנכרון נכשל");
      setCrmTasks((arr) =>
        arr.map((x) => (crmTaskKey(x) === k ? { ...x, ...j.task } : x))
      );
      setSyncMsg(`המשימה "${j.task.title}" סונכרנה ללוח.`);
      await loadEvents();
    } catch (e) {
      setErr(e instanceof Error ? e.message : "סנכרון נכשל");
    } finally {
      setCrmCardSyncKey(null);
    }
  }

  async function onDisconnect() {
    if (!window.confirm("לנתק את Google Calendar מעסק זה?")) return;
    const res = await fetch("/api/google-calendar/disconnect", {
      method: "POST",
      credentials: "include",
    });
    const j = (await res.json().catch(() => ({}))) as { ok?: boolean };
    if (res.ok && j.ok) {
      setConnected(false);
      setAccountEmail(null);
      setCalendars([]);
      setEvents([]);
      setSyncMsg("החיבור נותק.");
    }
  }

  const tabBtn = (id: ViewTab, label: string) => (
    <button
      key={id}
      type="button"
      onClick={() => setViewTab(id)}
      style={{
        padding: "10px 18px",
        borderRadius: 999,
        border: viewTab === id ? "2px solid #6d28d9" : "1px solid #e5e7eb",
        background: viewTab === id ? "#f5f3ff" : "#fff",
        fontWeight: 800,
        cursor: "pointer",
        fontSize: 14,
      }}
    >
      {label}
    </button>
  );

  return (
    <div style={{ width: "100%", maxWidth: 1200, minWidth: 0 }}>
      <h1 style={{ margin: "0 0 8px", fontSize: 26, fontWeight: 900 }}>לוח שנה</h1>
      <p style={{ margin: "0 0 16px", color: "#6b7280", fontSize: 14, lineHeight: 1.5 }}>
        חברו חשבון Google של העסק כדי לראות אירועים ולסנכרן משימות מה-CRM ללוח השנה (לפי דדליין ותזכורת).
      </p>
      <p style={{ margin: "0 0 20px", fontSize: 12, color: "#6b7280", lineHeight: 1.45 }}>
        <strong>עדכון משימה מסונכרנת:</strong> נשמר אותו אירוע ב-Google — מתעדכן תאריך/שעה וכותרת. אירוע חדש נוצר רק בפעם
        הראשונה או אם נמחק האירוע ידנית ב-Google (אז ניווצר אחד חדש פעם אחת).
      </p>

      {err && (
        <div
          style={{
            marginBottom: 14,
            padding: 12,
            borderRadius: 12,
            background: "#fef2f2",
            border: "1px solid #fecaca",
            color: "#b91c1c",
            fontSize: 14,
          }}
        >
          {err}
        </div>
      )}
      {syncMsg && (
        <div
          style={{
            marginBottom: 14,
            padding: 12,
            borderRadius: 12,
            background: "#ecfdf5",
            border: "1px solid #a7f3d0",
            color: "#065f46",
            fontSize: 14,
          }}
        >
          {syncMsg}
        </div>
      )}

      <div
        style={{
          display: "flex",
          flexWrap: "wrap",
          gap: 12,
          alignItems: "center",
          marginBottom: 20,
          padding: 16,
          background: "#fff",
          borderRadius: 16,
          border: "1px solid #e5e7eb",
        }}
      >
        {loading ? (
          <span style={{ color: "#6b7280" }}>טוען...</span>
        ) : connected ? (
          <>
            <span style={{ fontWeight: 800 }}>
              מחובר{accountEmail ? ` (${accountEmail})` : ""}
            </span>
            <button
              type="button"
              onClick={() => void onDisconnect()}
              style={{
                padding: "8px 14px",
                borderRadius: 10,
                border: "1px solid #e5e7eb",
                background: "#fff",
                cursor: "pointer",
                fontWeight: 700,
              }}
            >
              נתק
            </button>
            <button
              type="button"
              onClick={() => void onSyncTasks()}
              disabled={syncing}
              style={{
                padding: "8px 14px",
                borderRadius: 10,
                border: "none",
                background: "linear-gradient(180deg, #a78bfa 0%, #6d28d9 100%)",
                color: "#fff",
                cursor: syncing ? "wait" : "pointer",
                fontWeight: 800,
              }}
            >
              {syncing ? "מסנכרן..." : "סנכרן משימות ללוח שנה"}
            </button>
          </>
        ) : (
          <a
            href="/api/google-calendar/connect"
            style={{
              display: "inline-block",
              padding: "10px 18px",
              borderRadius: 10,
              background: "#2563eb",
              color: "#fff",
              fontWeight: 800,
              textDecoration: "none",
            }}
          >
            התחברות ל-Google Calendar
          </a>
        )}
      </div>

      {connected && (
        <>
          <div style={{ display: "flex", flexWrap: "wrap", gap: 10, marginBottom: 16 }}>
            {tabBtn("list", "תצוגה שבועית")}
            {tabBtn("month", "לוח Google (הטמעה)")}
          </div>

          <div
            style={{
              display: "flex",
              flexWrap: "wrap",
              gap: 12,
              alignItems: "center",
              marginBottom: 16,
            }}
          >
            <label style={{ fontWeight: 700, fontSize: 13 }}>לוח לתצוגה</label>
            <select
              value={calId}
              onChange={(e) => setCalId(e.target.value)}
              style={{ padding: "8px 12px", borderRadius: 10, border: "1px solid #e5e7eb", minWidth: 200 }}
            >
              {calendars.length === 0 ? (
                <option value="primary">ראשי (primary)</option>
              ) : (
                calendars.map((c) => (
                  <option key={c.id} value={c.id}>
                    {(c.summary ?? c.id) + (c.primary ? " ★" : "")}
                  </option>
                ))
              )}
            </select>

            {viewTab === "list" ? (
              <div style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap" }}>
                <button
                  type="button"
                  onClick={() => setWeekOffset((w) => w - 1)}
                  style={{
                    padding: "8px 12px",
                    borderRadius: 10,
                    border: "1px solid #e5e7eb",
                    background: "#fff",
                    cursor: "pointer",
                    fontWeight: 700,
                  }}
                >
                  ← שבוע קודם
                </button>
                <span style={{ fontWeight: 800, minWidth: 140, textAlign: "center" }}>{rangeLabel}</span>
                <button
                  type="button"
                  onClick={() => setWeekOffset((w) => w + 1)}
                  style={{
                    padding: "8px 12px",
                    borderRadius: 10,
                    border: "1px solid #e5e7eb",
                    background: "#fff",
                    cursor: "pointer",
                    fontWeight: 700,
                  }}
                >
                  שבוע הבא →
                </button>
                <button
                  type="button"
                  onClick={() => setWeekOffset(0)}
                  style={{
                    padding: "8px 12px",
                    borderRadius: 10,
                    border: "1px solid #c4b5fd",
                    background: "#f5f3ff",
                    cursor: "pointer",
                    fontWeight: 700,
                  }}
                >
                  היום
                </button>
              </div>
            ) : null}
          </div>

          {viewTab === "month" && (
            <div
              style={{
                border: "1px solid #e5e7eb",
                borderRadius: 16,
                background: "#fff",
                overflow: "hidden",
                marginBottom: 20,
              }}
            >
              <div style={{ fontWeight: 900, padding: "12px 14px 0", fontSize: 16 }}>
                לוח Google Calendar (חודש)
              </div>
              <p style={{ margin: "6px 14px 10px", fontSize: 12, color: "#6b7280", lineHeight: 1.45 }}>
                התצוגה היא של Google. כדי לראות אירועים צריך להיות מחוברים ל-Google בדפדפן (בדרך כלל אותו משתמש שחיברתם
                ב-CRM). אפשר לעבור חודשים מתוך הממשק המוטמע.
              </p>
              {embedSrc ? (
                <iframe
                  title="Google Calendar"
                  src={embedSrc}
                  style={{
                    width: "100%",
                    height: "min(78vh, 820px)",
                    minHeight: 560,
                    border: "none",
                    display: "block",
                  }}
                />
              ) : (
                <div style={{ padding: 20, color: "#92400e", background: "#fffbeb", fontSize: 14 }}>
                  לא ניתן להטמיע את לוח &quot;ראשי&quot; בלי כתובת המייל של החשבון. בחרו לוח אחר מהרשימה, או ודאו שהחיבור
                  ב-CRM החזיר מייל חשבון.
                </div>
              )}
            </div>
          )}

          {viewTab === "list" && (
            <div
              style={{
                display: "grid",
                gridTemplateColumns: "repeat(auto-fit, minmax(min(100%, 340px), 1fr))",
                gap: 16,
              }}
            >
              <div
                style={{
                  border: "1px solid #e5e7eb",
                  borderRadius: 16,
                  background: "#fff",
                  padding: 16,
                  minHeight: 420,
                }}
              >
                <div style={{ fontWeight: 900, marginBottom: 12, fontSize: 16 }}>אירועים ב-Google</div>
                {eventsLoading ? (
                  <div style={{ color: "#6b7280" }}>טוען אירועים...</div>
                ) : events.length === 0 ? (
                  <div style={{ color: "#9ca3af" }}>אין אירועים בשבוע זה בלוח שנבחר.</div>
                ) : (
                  <ul style={{ margin: 0, padding: 0, listStyle: "none", display: "grid", gap: 10 }}>
                    {events.map((ev) => (
                      <li
                        key={ev.id}
                        style={{
                          border: "1px solid #f3f4f6",
                          borderRadius: 12,
                          padding: 12,
                          background: "#fafafa",
                        }}
                      >
                        <div style={{ fontWeight: 800 }}>{ev.summary}</div>
                        <div style={{ fontSize: 12, color: "#6b7280", marginTop: 4 }}>
                          {ev.start ? formatIsraelDateTime(ev.start) : "—"} —{" "}
                          {ev.end ? formatIsraelDateTime(ev.end) : "—"}
                        </div>
                        {ev.htmlLink ? (
                          <a
                            href={ev.htmlLink}
                            target="_blank"
                            rel="noreferrer"
                            style={{ fontSize: 12, color: "#4c1d95", marginTop: 6, display: "inline-block" }}
                          >
                            פתח ב-Google
                          </a>
                        ) : null}
                      </li>
                    ))}
                  </ul>
                )}
              </div>

              <div
                style={{
                  border: "1px solid #e5e7eb",
                  borderRadius: 16,
                  background: "#fff",
                  padding: 16,
                  minHeight: 420,
                }}
              >
                <div style={{ fontWeight: 900, marginBottom: 4, fontSize: 16 }}>משימות CRM (דדליין בשבוע)</div>
                <p style={{ margin: "0 0 10px", fontSize: 11, color: "#6b7280", lineHeight: 1.4 }}>
                  הלוח לסנכרון הוא זה שבחרתם למעלה (&quot;לוח לתצוגה&quot;).
                </p>
                {tasksThisWeek.length === 0 ? (
                  <div style={{ color: "#9ca3af" }}>אין משימות עם דדליין בשבוע זה.</div>
                ) : (
                  <ul style={{ margin: 0, padding: 0, listStyle: "none", display: "grid", gap: 10 }}>
                    {tasksThisWeek.map((t) => {
                      const k = crmTaskKey(t);
                      const dueOk = Boolean(parseTaskInstant(String(t.dueAt ?? "").trim()));
                      const canSync = connected && dueOk && Boolean(calId.trim());
                      const cardBusy = crmCardSyncKey === k;
                      return (
                        <li
                          key={k}
                          style={{
                            border: "1px solid #f3f4f6",
                            borderRadius: 12,
                            padding: 12,
                            background: "#fafafa",
                            display: "flex",
                            flexDirection: "column",
                            gap: 8,
                          }}
                        >
                          <div style={{ fontWeight: 800 }}>{t.title}</div>
                          <div style={{ fontSize: 12, color: "#6b7280" }}>
                            {formatIsraelDateTime(t.dueAt)} · {t.entityName}
                          </div>
                          {t.syncToGoogleCalendar ? (
                            <div style={{ fontSize: 11, color: "#059669", fontWeight: 700 }}>
                              מסונכרן ל-Google
                            </div>
                          ) : null}
                          <div>
                            <button
                              type="button"
                              disabled={!canSync || cardBusy}
                              title={
                                !connected
                                  ? "חברו Google Calendar למעלה"
                                  : !dueOk
                                    ? "נדרש דדליין"
                                    : "שולח את המשימה ללוח שנבחר"
                              }
                              onClick={() => void syncSingleCrmTaskToCalendar(t)}
                              style={{
                                padding: "4px 10px",
                                borderRadius: 8,
                                border: "1px solid #c4b5fd",
                                background: canSync && !cardBusy ? "#f5f3ff" : "#f3f4f6",
                                color: canSync && !cardBusy ? "#5b21b6" : "#9ca3af",
                                fontWeight: 800,
                                fontSize: 11,
                                cursor: canSync && !cardBusy ? "pointer" : "not-allowed",
                              }}
                            >
                              {cardBusy ? "מסנכרן…" : t.syncToGoogleCalendar ? "עדכן בלוח" : "סנכרן ללוח"}
                            </button>
                          </div>
                        </li>
                      );
                    })}
                  </ul>
                )}
              </div>
            </div>
          )}
        </>
      )}
    </div>
  );
}
