"use client";

import { useEffect, useMemo, useState, type ReactNode } from "react";
import useSWR from "swr";
import { formatIsraelDateTime } from "@/lib/datetime/formatIsrael";
import { formatIsraelYmdUtc, israelTodayAndTomorrowKeys, parseTaskInstant } from "@/lib/datetime/taskTimestamps";

type DashboardMetricsOk = {
  ok: true;
  opportunityCount: number;
  ordersCount: number;
  leadsByUtmSource: Record<string, number>;
  payingCustomersPipelineId: string;
  payingCustomersPipelineName: string;
  payingCustomersInRangeCount: number;
  payingCustomersByUtmSource: Record<string, number>;
  payingCustomersOpenCount: number;
  ordersPerMover: Array<{
    opportunityId: string;
    opportunityName: string;
    orderCount: number;
    isActive: boolean;
  }>;
  activeMoversByRegion: Array<{
    region: string;
    activeMoversCount: number;
    drivers: Array<{
      contactId: string;
      name: string;
      phone: string;
      opportunityId: string;
      opportunityName: string;
    }>;
  }>;
  movingOrdersWorkspace: boolean;
  salesPipelineId: string;
  salesPipelineName: string;
  salesStageCounts: Record<string, number>;
  warning?: string;
};
type DashboardMetricsErr = { ok: false; error: string };

type TaskRow = {
  id: string;
  title: string;
  dueAt: string;
  status: "todo" | "in_progress" | "done";
  entityType: "contact" | "opportunity";
  entityId: string;
  entityName: string;
  assignedRep?: string;
  entityPhone?: string;
};

type WidgetId =
  | "opp_count"
  | "orders_count"
  | "leads_by_channel"
  | "paying_count"
  | "customers_by_channel"
  | "paying_open"
  | "orders_per_mover"
  | "active_movers_by_region"
  | "sales_mvp"
  | "tasks";

type WidgetConfig = { id: WidgetId; title: string; visible: boolean };
const DASHBOARD_WIDGETS_KEY = "crm:dashboard:widgets";

/** בטננט hot-afik הדשבורד מציג רק את המודולים הרלוונטיים ללקוח. */
const HOT_AFIK_DASHBOARD_HIDDEN: ReadonlySet<WidgetId> = new Set([
  "orders_per_mover",
  "orders_count",
  "leads_by_channel",
  "paying_count",
  "customers_by_channel",
  "sales_mvp",
  "active_movers_by_region",
]);

function isDashboardWidgetHiddenForTenant(tenantId: string | null | undefined, id: WidgetId): boolean {
  return tenantId === "hot-afik" && HOT_AFIK_DASHBOARD_HIDDEN.has(id);
}

const DEFAULT_WIDGETS: WidgetConfig[] = [
  { id: "opp_count", title: "כמות לידים (הזדמנויות)", visible: true },
  { id: "orders_count", title: "כמות הזמנות", visible: true },
  { id: "leads_by_channel", title: "לידים לפי ערוצים", visible: true },
  { id: "paying_count", title: "לקוחות במערכת (פייפליין לקוחות משלמים)", visible: true },
  { id: "customers_by_channel", title: "לקוחות לפי ערוצים", visible: true },
  { id: "paying_open", title: "לקוחות פעילים", visible: true },
  { id: "orders_per_mover", title: "לידים פר מוביל (קאונטר)", visible: true },
  { id: "active_movers_by_region", title: "מובילים פעילים לפי אזורים", visible: true },
  { id: "sales_mvp", title: "מכירות (MVP)", visible: true },
  { id: "tasks", title: "משימות (היום · מחר · באיחור)", visible: true },
];

function prettyCount(n: number) {
  return n.toLocaleString("en-US");
}

function sortedEntries(rec: Record<string, number>): [string, number][] {
  return Object.entries(rec).sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0], "he"));
}

const DASH_AUTH_REDIRECT = "CRM_DASH_AUTH_REDIRECT";

type DashboardClientProps = { tenantId?: string | null };

export default function DashboardClient({ tenantId = null }: DashboardClientProps) {
  const [err, setErr] = useState<string | null>(null);
  const [widgets, setWidgets] = useState<WidgetConfig[]>(DEFAULT_WIDGETS);
  const [manageOpen, setManageOpen] = useState(false);
  const [driversRegionOpen, setDriversRegionOpen] = useState<{
    region: string;
    drivers: Array<{
      contactId: string;
      name: string;
      phone: string;
      opportunityId: string;
      opportunityName: string;
    }>;
  } | null>(null);

  const [dateFrom, setDateFrom] = useState("");
  const [dateTo, setDateTo] = useState("");

  const query = useMemo(() => {
    const params = new URLSearchParams();
    if (dateFrom.trim()) params.set("date_from", dateFrom.trim());
    if (dateTo.trim()) params.set("date_to", dateTo.trim());
    const q = params.toString();
    return q ? `?${q}` : "";
  }, [dateFrom, dateTo]);

  const metricsUrl = `/api/dashboard/metrics${query}`;

  const {
    data: metrics,
    error: metricsSwrError,
    isLoading: metricsLoading,
    mutate: mutateMetrics,
  } = useSWR(
    metricsUrl,
    async (url: string): Promise<DashboardMetricsOk> => {
      const res = await fetch(url, { cache: "no-store", credentials: "include" });
      if (res.status === 401) {
        window.location.href = `/login?returnTo=${encodeURIComponent("/dashboard")}`;
        throw new Error(DASH_AUTH_REDIRECT);
      }
      if (res.status === 403) {
        window.location.href = `/pending?returnTo=${encodeURIComponent("/dashboard")}`;
        throw new Error(DASH_AUTH_REDIRECT);
      }
      const json = (await res.json().catch(() => ({}))) as DashboardMetricsOk | DashboardMetricsErr;
      if (!json || !("ok" in json) || json.ok !== true) {
        throw new Error("שגיאה בטעינת מדדים");
      }
      return json;
    },
    { revalidateOnFocus: true, dedupingInterval: 5000 }
  );

  const { data: tasks = [], isLoading: tasksLoading, mutate: mutateTasks } = useSWR(
    "crm-dashboard-tasks",
    async (): Promise<TaskRow[]> => {
      const tasksRes = await fetch("/api/tasks", { cache: "no-store", credentials: "include" });
      if (!tasksRes.ok) return [];
      const tasksJson = (await tasksRes.json().catch(() => ({}))) as {
        ok?: boolean;
        tasks?: TaskRow[];
      };
      return tasksJson.ok ? tasksJson.tasks ?? [] : [];
    },
    { revalidateOnFocus: true, dedupingInterval: 5000 }
  );

  const loading = Boolean((metricsLoading && !metrics) || (tasksLoading && !tasks.length));

  useEffect(() => {
    if (metricsSwrError && metricsSwrError.message !== DASH_AUTH_REDIRECT) {
      setErr(metricsSwrError.message);
    } else {
      setErr(null);
    }
  }, [metricsSwrError]);

  async function refreshDashboard() {
    await Promise.all([mutateMetrics(), mutateTasks()]);
  }

  useEffect(() => {
    try {
      const raw = window.localStorage.getItem(DASHBOARD_WIDGETS_KEY);
      if (!raw) return;
      const parsed = JSON.parse(raw) as WidgetConfig[];
      if (!Array.isArray(parsed) || parsed.length === 0) return;
      const valid = parsed.filter((w) => DEFAULT_WIDGETS.some((d) => d.id === w.id));
      const missing = DEFAULT_WIDGETS.filter((d) => !valid.some((w) => w.id === d.id));
      const merged = [...valid, ...missing].map((w) => {
        const def = DEFAULT_WIDGETS.find((d) => d.id === w.id);
        return def ? { ...w, title: def.title } : w;
      });
      setWidgets(merged);
    } catch {}
  }, []);

  useEffect(() => {
    try {
      window.localStorage.setItem(DASHBOARD_WIDGETS_KEY, JSON.stringify(widgets));
    } catch {}
  }, [widgets]);

  function moveWidgetById(id: WidgetId, dir: -1 | 1) {
    setWidgets((arr) => {
      const hidden = (wid: WidgetId) => isDashboardWidgetHiddenForTenant(tenantId, wid);
      const orderIds = arr.filter((w) => !hidden(w.id)).map((w) => w.id);
      const idx = orderIds.indexOf(id);
      const to = idx + dir;
      if (idx < 0 || to < 0 || to >= orderIds.length) return arr;
      const swapWithId = orderIds[to];
      const i = arr.findIndex((w) => w.id === id);
      const j = arr.findIndex((w) => w.id === swapWithId);
      if (i < 0 || j < 0) return arr;
      const next = [...arr];
      [next[i], next[j]] = [next[j], next[i]];
      return next;
    });
  }

  const dashboardTasksFiltered = useMemo(() => {
    const { today, tomorrow } = israelTodayAndTomorrowKeys();
    return tasks
      .filter((t) => {
        if (t.status === "done") return false;
        if (!t.dueAt?.trim()) return false;
        const du = parseTaskInstant(t.dueAt);
        if (!du) return false;
        const ymd = formatIsraelYmdUtc(du);
        if (ymd < today) return true;
        if (ymd === today || ymd === tomorrow) return true;
        return false;
      })
      .sort((a, b) => {
        const ta = parseTaskInstant(a.dueAt)?.getTime() ?? 0;
        const tb = parseTaskInstant(b.dueAt)?.getTime() ?? 0;
        return ta - tb;
      });
  }, [tasks]);

  function taskEntityHref(t: TaskRow) {
    return t.entityType === "contact"
      ? `/contacts?openContactId=${encodeURIComponent(t.entityId)}`
      : `/pipeline?openOpportunityId=${encodeURIComponent(t.entityId)}`;
  }

  function dashboardTaskOverdue(t: TaskRow): boolean {
    if (t.status === "done") return false;
    const du = parseTaskInstant(t.dueAt);
    if (!du) return false;
    return du.getTime() < Date.now();
  }

  function tableShell(title: string, subtitle: string | undefined, children: ReactNode) {
    return (
      <div style={{ marginTop: 16, background: "#fff", border: "1px solid #e5e7eb", borderRadius: 16, overflow: "hidden" }}>
        <div style={{ padding: "12px 14px", borderBottom: "1px solid #f3f4f6", fontWeight: 900 }}>
          {title}
          {subtitle ? (
            <div style={{ marginTop: 4, fontSize: 12, fontWeight: 600, color: "#6b7280" }}>{subtitle}</div>
          ) : null}
        </div>
        <div style={{ overflowX: "auto", maxWidth: "100%" }}>{children}</div>
      </div>
    );
  }

  function renderUtmTable(rows: [string, number][]) {
    if (rows.length === 0) {
      return <div style={{ padding: 14, color: "#6b7280", fontWeight: 600 }}>אין נתונים בטווח התאריכים.</div>;
    }
    return (
      <table style={{ width: "100%", minWidth: 360, borderCollapse: "collapse" }}>
        <thead>
          <tr>
            <th style={{ textAlign: "right", padding: "10px 12px", borderBottom: "2px solid #e5e7eb", background: "#f8fafc", fontSize: 12, fontWeight: 900 }}>
              utm_source
            </th>
            <th style={{ textAlign: "right", padding: "10px 12px", borderBottom: "2px solid #e5e7eb", background: "#f8fafc", fontSize: 12, fontWeight: 900 }}>
              כמות
            </th>
          </tr>
        </thead>
        <tbody>
          {rows.map(([src, count]) => (
            <tr key={src} style={{ borderBottom: "1px solid #f3f4f6" }}>
              <td style={{ padding: "10px 12px", wordBreak: "break-word" }}>{src}</td>
              <td style={{ padding: "10px 12px", fontWeight: 800 }}>{prettyCount(count)}</td>
            </tr>
          ))}
        </tbody>
      </table>
    );
  }

  function kpiCard(label: string, value: string | number, hint?: string) {
    return (
      <div style={{ background: "#fff", border: "1px solid #e5e7eb", borderRadius: 16, padding: 16 }}>
        <div style={{ fontSize: 12, color: "#6b7280", fontWeight: 800 }}>{label}</div>
        <div style={{ fontSize: 36, fontWeight: 900, color: "#6d28d9", marginTop: 6 }}>{value}</div>
        {hint ? <div style={{ marginTop: 6, fontSize: 11, color: "#9ca3af", fontWeight: 600 }}>{hint}</div> : null}
      </div>
    );
  }

  function renderWidget(id: WidgetId) {
    const m = metrics;

    if (id === "opp_count") {
      return (
        <div key={id}>
          {kpiCard(
            "כמות לידים",
            m ? prettyCount(m.opportunityCount) : "—",
            "הזדמנויות שנוצרו בטווח התאריכים (כל הפייפליינים)"
          )}
        </div>
      );
    }
    if (id === "orders_count") {
      return (
        <div key={id}>
          {kpiCard(
            "כמות הזמנות",
            m ? prettyCount(m.ordersCount) : "—",
            m && !m.movingOrdersWorkspace ? "הזמנות זמינות רק כשמודול ההזמנות מופעל בעסק" : "הזמנות שנוצרו בטווח התאריכים"
          )}
        </div>
      );
    }
    if (id === "leads_by_channel") {
      return (
        <div key={id}>
          {tableShell("לידים לפי ערוצים", "לפי utm_source של ההזדמנות בטווח התאריכים", renderUtmTable(m ? sortedEntries(m.leadsByUtmSource) : []))}
        </div>
      );
    }
    if (id === "paying_count") {
      return (
        <div key={id}>
          {kpiCard(
            "לקוחות במערכת",
            m ? prettyCount(m.payingCustomersInRangeCount) : "—",
            m
              ? `פייפליין: ${m.payingCustomersPipelineName} · לפי תאריך יצירת ההזדמנות בטווח`
              : undefined
          )}
        </div>
      );
    }
    if (id === "customers_by_channel") {
      return (
        <div key={id}>
          {tableShell(
            "לקוחות לפי ערוצים",
            m ? `utm_source בפייפליין ${m.payingCustomersPipelineName} (יצירה בטווח)` : undefined,
            renderUtmTable(m ? sortedEntries(m.payingCustomersByUtmSource) : [])
          )}
        </div>
      );
    }
    if (id === "paying_open") {
      return (
        <div key={id}>
          {kpiCard(
            "לקוחות פעילים",
            m ? prettyCount(m.payingCustomersOpenCount) : "—",
            "הזדמנויות בפייפליין לקוחות משלמים עם סטטוס פתוח (ללא סינון תאריכים)"
          )}
        </div>
      );
    }
    if (id === "orders_per_mover") {
      const rows = m?.ordersPerMover ?? [];
      const subtitle =
        "המספר לפי שדה opportunity_leads_count בפייפליין (כמו עמודת הקאונטר בניהול הזדמנויות). ממוין: פעילים (סטטוס פתוח) לפי כמות יורד, אחריהם לא פעילים. רקע אדום עדין = לא פעיל.";
      const body =
        rows.length === 0 ? (
          <div style={{ padding: 14, color: "#6b7280", fontWeight: 600 }}>אין מובילים או אין הזמנות משויכות.</div>
        ) : (
          <table style={{ width: "100%", minWidth: 420, borderCollapse: "collapse" }}>
            <thead>
              <tr>
                <th style={{ textAlign: "right", padding: "10px 12px", borderBottom: "2px solid #e5e7eb", background: "#f8fafc", fontSize: 12, fontWeight: 900 }}>
                  מוביל / הזדמנות
                </th>
                <th style={{ textAlign: "right", padding: "10px 12px", borderBottom: "2px solid #e5e7eb", background: "#f8fafc", fontSize: 12, fontWeight: 900 }}>
                  לידים (קאונטר)
                </th>
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => {
                const inactive = !r.isActive;
                return (
                  <tr
                    key={r.opportunityId}
                    style={{
                      borderBottom: "1px solid #f3f4f6",
                      background: inactive ? "rgba(254, 226, 226, 0.35)" : undefined,
                      boxShadow: inactive ? "inset 3px 0 0 rgba(248, 113, 113, 0.45)" : undefined,
                    }}
                  >
                    <td style={{ padding: "10px 12px" }}>
                      <a
                        href={`/pipeline?openOpportunityId=${encodeURIComponent(r.opportunityId)}`}
                        style={{
                          color: inactive ? "#b91c1c" : "#4c1d95",
                          fontWeight: 700,
                        }}
                      >
                        {r.opportunityName}
                        {inactive ? (
                          <span style={{ fontSize: 11, fontWeight: 600, color: "#991b1b", marginInlineStart: 6 }}> · לא פעיל</span>
                        ) : null}
                      </a>
                    </td>
                    <td style={{ padding: "10px 12px", fontWeight: 800, color: inactive ? "#9f1239" : undefined }}>
                      {prettyCount(r.orderCount)}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        );
      return <div key={id}>{tableShell("לידים פר מוביל (קאונטר)", subtitle, body)}</div>;
    }
    if (id === "active_movers_by_region") {
      const rows = m?.activeMoversByRegion ?? [];
      const body =
        rows.length === 0 ? (
          <div style={{ padding: 14, color: "#6b7280", fontWeight: 600 }}>אין נתונים להצגה.</div>
        ) : (
          <table style={{ width: "100%", minWidth: 460, borderCollapse: "collapse" }}>
            <thead>
              <tr>
                <th style={{ textAlign: "right", padding: "10px 12px", borderBottom: "2px solid #e5e7eb", background: "#f8fafc", fontSize: 12, fontWeight: 900 }}>
                  אזור
                </th>
                <th style={{ textAlign: "right", padding: "10px 12px", borderBottom: "2px solid #e5e7eb", background: "#f8fafc", fontSize: 12, fontWeight: 900 }}>
                  כמות מובילים פעילים
                </th>
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => (
                <tr key={r.region} style={{ borderBottom: "1px solid #f3f4f6" }}>
                  <td style={{ padding: "10px 12px", fontWeight: 700 }}>{r.region}</td>
                  <td style={{ padding: "10px 12px" }}>
                    <button
                      type="button"
                      onClick={() => setDriversRegionOpen({ region: r.region, drivers: r.drivers })}
                      style={{
                        border: "1px solid #ddd6fe",
                        background: "#faf5ff",
                        color: "#5b21b6",
                        borderRadius: 10,
                        padding: "6px 10px",
                        fontWeight: 800,
                        cursor: "pointer",
                      }}
                    >
                      {prettyCount(r.activeMoversCount)}
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        );
      return (
        <div key={id}>
          {tableShell("מובילים פעילים לפי אזורים", "כל האזורים מהגדרות אזורי פעילות. לחיצה על הכמות פותחת רשימת נהגים.", body)}
        </div>
      );
    }
    if (id === "sales_mvp") {
      return (
        <div key={id}>
          {kpiCard("מכירות", "—", "בקרוב: סכום מכירות לפי טווח תאריכים (אין עדיין שדות נתונים מתאימים)")}
        </div>
      );
    }
    if (id === "tasks") {
      return (
        <div key={id} style={{ background: "#fff", border: "1px solid #e5e7eb", borderRadius: 16, overflow: "hidden" }}>
          <div style={{ padding: "12px 14px", borderBottom: "1px solid #f3f4f6", fontWeight: 900 }}>
            משימות — היום, מחר ובאיחור
            <div style={{ marginTop: 4, fontSize: 12, fontWeight: 600, color: "#6b7280" }}>
              <a href="/tasks" style={{ color: "#5b21b6" }}>
                לכל המשימות
              </a>
            </div>
          </div>
          <div style={{ overflowX: "auto", maxWidth: "100%" }}>
            <table style={{ width: "100%", minWidth: 800, borderCollapse: "collapse" }}>
              <thead>
                <tr>
                  {["כותרת", "סטטוס", "קשור ל", "פלאפון", "אחראי", "דדליין"].map((h) => (
                    <th key={h} style={{ textAlign: "right", padding: "10px 12px", borderBottom: "2px solid #e5e7eb", background: "#f8fafc", fontSize: 12, fontWeight: 900 }}>
                      {h}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {dashboardTasksFiltered.slice(0, 40).map((t) => {
                  const overdue = dashboardTaskOverdue(t);
                  const phone = t.entityPhone?.replace(/[^\d+]/g, "").trim();
                  return (
                    <tr
                      key={`${t.entityType}-${t.entityId}-${t.id}`}
                      style={{
                        borderBottom: "1px solid #f3f4f6",
                        background: overdue ? "rgba(254, 242, 242, 0.65)" : undefined,
                        boxShadow: overdue ? "inset 3px 0 0 #f87171" : undefined,
                      }}
                    >
                      <td style={{ padding: "10px 12px" }}>{t.title}</td>
                      <td style={{ padding: "10px 12px" }}>{t.status}</td>
                      <td style={{ padding: "10px 12px" }}>
                        <a href={taskEntityHref(t)} style={{ color: "#4c1d95", fontWeight: 700 }}>
                          {t.entityType === "contact" ? "איש קשר" : "הזדמנות"} · {t.entityName}
                        </a>
                      </td>
                      <td style={{ padding: "10px 12px" }}>
                        {phone ? (
                          <a href={`tel:${phone}`} style={{ color: "#2563eb", fontWeight: 700 }}>
                            {t.entityPhone}
                          </a>
                        ) : (
                          "—"
                        )}
                      </td>
                      <td style={{ padding: "10px 12px" }}>{t.assignedRep ?? "—"}</td>
                      <td style={{ padding: "10px 12px", fontWeight: overdue ? 800 : 600, color: overdue ? "#b91c1c" : undefined }}>
                        {t.dueAt ? formatIsraelDateTime(t.dueAt) : "—"}
                      </td>
                    </tr>
                  );
                })}
                {!loading && dashboardTasksFiltered.length === 0 && (
                  <tr>
                    <td colSpan={6} style={{ padding: 12, color: "#6b7280", fontWeight: 700 }}>
                      אין משימות פתוחות עם דדליין היום, מחר או שעברו.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </div>
      );
    }
    return null;
  }

  const manageableWidgets = useMemo(
    () => widgets.filter((w) => !isDashboardWidgetHiddenForTenant(tenantId, w.id)),
    [widgets, tenantId]
  );

  /** Group consecutive KPI-style widgets into one responsive row */
  const visibleWidgets = useMemo(
    () => widgets.filter((w) => w.visible && !isDashboardWidgetHiddenForTenant(tenantId, w.id)),
    [widgets, tenantId]
  );
  const renderedBlocks: ReactNode[] = [];
  let kpiRun: WidgetId[] = [];
  const flushKpiRun = () => {
    if (kpiRun.length === 0) return;
    renderedBlocks.push(
      <div
        key={`kpi-row-${kpiRun.join("-")}`}
        style={{ display: "grid", gap: 12, gridTemplateColumns: "repeat(auto-fit, minmax(200px, 1fr))" }}
      >
        {kpiRun.map((id) => renderWidget(id))}
      </div>
    );
    kpiRun = [];
  };
  const isKpiWidget = (id: WidgetId) =>
    id === "opp_count" || id === "orders_count" || id === "paying_count" || id === "paying_open" || id === "sales_mvp";

  for (const w of visibleWidgets) {
    if (isKpiWidget(w.id)) {
      kpiRun.push(w.id);
    } else {
      flushKpiRun();
      renderedBlocks.push(renderWidget(w.id));
    }
  }
  flushKpiRun();

  return (
    <div>
      <div style={{ display: "flex", gap: 12, alignItems: "flex-end", flexWrap: "wrap" }}>
        <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
          <label style={{ fontSize: 12, fontWeight: 800, color: "#6b7280" }}>מתאריך</label>
          <input
            type="date"
            value={dateFrom}
            onChange={(e) => setDateFrom(e.target.value)}
            style={{
              padding: "10px 12px",
              borderRadius: 12,
              border: "1px solid #e5e7eb",
              background: "#fff",
            }}
          />
        </div>
        <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
          <label style={{ fontSize: 12, fontWeight: 800, color: "#6b7280" }}>עד תאריך</label>
          <input
            type="date"
            value={dateTo}
            onChange={(e) => setDateTo(e.target.value)}
            style={{
              padding: "10px 12px",
              borderRadius: 12,
              border: "1px solid #e5e7eb",
              background: "#fff",
            }}
          />
        </div>

        <button
          type="button"
          onClick={() => void refreshDashboard()}
          disabled={loading}
          style={{
            padding: "10px 16px",
            borderRadius: 12,
            border: "none",
            cursor: "pointer",
            fontWeight: 800,
            background: "linear-gradient(180deg, #a78bfa 0%, #6d28d9 100%)",
            color: "#fff",
            height: 42,
          }}
        >
          {loading ? "טוען…" : "רענן"}
        </button>
        <button
          type="button"
          onClick={() => setManageOpen((x) => !x)}
          style={{
            padding: "10px 16px",
            borderRadius: 12,
            border: "1px solid #e5e7eb",
            cursor: "pointer",
            fontWeight: 800,
            background: "#fff",
            height: 42,
          }}
        >
          ניהול דשבורד
        </button>
      </div>

      {manageOpen && (
        <div style={{ marginTop: 12, background: "#fff", border: "1px solid #e5e7eb", borderRadius: 12, padding: 12 }}>
          <div style={{ fontWeight: 900, marginBottom: 8 }}>בחירת חלוניות וסדר</div>
          <div style={{ display: "grid", gap: 8 }}>
            {manageableWidgets.map((w) => (
              <div key={w.id} style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
                <input
                  type="checkbox"
                  checked={w.visible}
                  onChange={(e) =>
                    setWidgets((arr) =>
                      arr.map((x) => (x.id === w.id ? { ...x, visible: e.target.checked } : x))
                    )
                  }
                />
                <span style={{ minWidth: 200, flex: "1 1 200px" }}>{w.title}</span>
                <button type="button" onClick={() => moveWidgetById(w.id, -1)} style={{ border: "1px solid #e5e7eb", borderRadius: 8, background: "#fff", cursor: "pointer" }}>
                  ↑
                </button>
                <button type="button" onClick={() => moveWidgetById(w.id, 1)} style={{ border: "1px solid #e5e7eb", borderRadius: 8, background: "#fff", cursor: "pointer" }}>
                  ↓
                </button>
              </div>
            ))}
          </div>
        </div>
      )}

      {metrics?.warning && (
        <div style={{ marginTop: 14, background: "#fef2f2", border: "1px solid #fecaca", color: "#b91c1c", padding: 12, borderRadius: 12 }}>
          {metrics.warning}
        </div>
      )}

      {metrics && Object.keys(metrics.salesStageCounts ?? {}).length > 0 && (
        <div style={{ marginTop: 18 }}>
          <div style={{ fontWeight: 900, fontSize: 18, marginBottom: 10 }}>
            ניהול לקוחות · {metrics.salesPipelineName}
          </div>
          <div style={{ fontSize: 13, color: "#6b7280", marginBottom: 12, lineHeight: 1.45 }}>
            ספירת לקוחות (הזדמנויות) לפי שלב בפייפליין. לחיצה פותחת את לוח הניהול מסונן לשלב.
          </div>
          <div style={{ display: "grid", gap: 12, gridTemplateColumns: "repeat(auto-fit, minmax(160px, 1fr))" }}>
            {Object.entries(metrics.salesStageCounts).map(([stage, count]) => (
              <a
                key={stage}
                href={`/pipeline?pipelineId=${encodeURIComponent(metrics.salesPipelineId)}&stage=${encodeURIComponent(stage)}`}
                style={{
                  textDecoration: "none",
                  background: "#fff",
                  border: "1px solid #e5e7eb",
                  borderRadius: 14,
                  padding: 14,
                  color: "inherit",
                }}
              >
                <div style={{ fontSize: 12, color: "#6b7280", fontWeight: 800 }}>{stage}</div>
                <div style={{ fontSize: 28, fontWeight: 900, color: "#059669", marginTop: 6 }}>{prettyCount(count)}</div>
              </a>
            ))}
          </div>
        </div>
      )}

      {err && (
        <div style={{ marginTop: 14, background: "#fef2f2", border: "1px solid #fecaca", color: "#b91c1c", padding: 12, borderRadius: 12 }}>
          {err}
        </div>
      )}

      <div style={{ marginTop: 18, display: "flex", flexDirection: "column", gap: 20 }}>{renderedBlocks}</div>

      {driversRegionOpen && (
        <div
          role="dialog"
          aria-modal="true"
          onClick={() => setDriversRegionOpen(null)}
          style={{
            position: "fixed",
            inset: 0,
            background: "rgba(17,24,39,0.45)",
            zIndex: 60,
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            padding: 16,
          }}
        >
          <div
            onClick={(e) => e.stopPropagation()}
            style={{
              width: "min(760px, 96vw)",
              maxHeight: "88vh",
              overflow: "auto",
              background: "#fff",
              borderRadius: 14,
              border: "1px solid #e5e7eb",
            }}
          >
            <div style={{ padding: "14px 16px", borderBottom: "1px solid #f3f4f6", display: "flex", justifyContent: "space-between", alignItems: "center", gap: 8 }}>
              <div style={{ fontWeight: 900 }}>
                נהגים באזור: {driversRegionOpen.region}
                <div style={{ marginTop: 4, fontSize: 12, color: "#6b7280", fontWeight: 600 }}>
                  סה״כ: {prettyCount(driversRegionOpen.drivers.length)}
                </div>
              </div>
              <button
                type="button"
                onClick={() => setDriversRegionOpen(null)}
                style={{ border: "1px solid #e5e7eb", background: "#fff", borderRadius: 10, padding: "6px 10px", cursor: "pointer", fontWeight: 700 }}
              >
                סגור
              </button>
            </div>
            {driversRegionOpen.drivers.length === 0 ? (
              <div style={{ padding: 14, color: "#6b7280", fontWeight: 600 }}>אין נהגים פעילים באזור זה.</div>
            ) : (
              <table style={{ width: "100%", minWidth: 560, borderCollapse: "collapse" }}>
                <thead>
                  <tr>
                    {["שם נהג", "טלפון", "הזדמנות"].map((h) => (
                      <th key={h} style={{ textAlign: "right", padding: "10px 12px", borderBottom: "2px solid #e5e7eb", background: "#f8fafc", fontSize: 12, fontWeight: 900 }}>
                        {h}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {driversRegionOpen.drivers.map((d) => (
                    <tr key={d.contactId} style={{ borderBottom: "1px solid #f3f4f6" }}>
                      <td style={{ padding: "10px 12px", fontWeight: 700 }}>{d.name || "ללא שם"}</td>
                      <td style={{ padding: "10px 12px" }}>{d.phone || "—"}</td>
                      <td style={{ padding: "10px 12px" }}>
                        <a
                          href={`/pipeline?openOpportunityId=${encodeURIComponent(d.opportunityId)}`}
                          style={{ color: "#4c1d95", fontWeight: 700 }}
                        >
                          {d.opportunityName || "הזדמנות"}
                        </a>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
