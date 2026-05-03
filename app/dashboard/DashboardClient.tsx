"use client";

import { useEffect, useMemo, useState, type ReactNode } from "react";
import useSWR from "swr";
import { formatIsraelDateTime } from "@/lib/datetime/formatIsrael";
import { formatIsraelYmdUtc, israelTodayAndTomorrowKeys, parseTaskInstant } from "@/lib/datetime/taskTimestamps";

type DashboardMetricsOk = {
  ok: true;
  opportunityCount: number;
  leadsByUtmSource: Record<string, number>;
  payingCustomersPipelineId: string;
  payingCustomersPipelineName: string;
  payingCustomersInRangeCount: number;
  payingCustomersByUtmSource: Record<string, number>;
  payingCustomersOpenCount: number;
  propertyDealsOpenCount: number;
  propertyDealsPurchaseCount: number;
  propertyDealsSoldCount: number;
  salesPipelineId: string;
  salesPipelineName: string;
  salesStageCounts: Record<string, number>;
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
  | "deals_open"
  | "deals_purchase"
  | "deals_sold"
  | "leads_by_channel"
  | "paying_count"
  | "customers_by_channel"
  | "paying_open"
  | "tasks";

type WidgetConfig = { id: WidgetId; title: string; visible: boolean };
const DASHBOARD_WIDGETS_KEY = "crm:dashboard:widgets";

/** בטננט hot-afik הדשבורד מציג רק את המודולים הרלוונטיים ללקוח. */
const HOT_AFIK_DASHBOARD_HIDDEN: ReadonlySet<WidgetId> = new Set([
  "leads_by_channel",
  "paying_count",
  "customers_by_channel",
]);

function isDashboardWidgetHiddenForTenant(tenantId: string | null | undefined, id: WidgetId): boolean {
  return tenantId === "hot-afik" && HOT_AFIK_DASHBOARD_HIDDEN.has(id);
}

const DEFAULT_WIDGETS: WidgetConfig[] = [
  { id: "opp_count", title: "כמות לקוחות (בטווח)", visible: true },
  { id: "deals_open", title: "עסקאות פתוחות (בטווח)", visible: true },
  { id: "deals_purchase", title: "עסקאות — סיום רכישה (בטווח)", visible: true },
  { id: "deals_sold", title: "עסקאות — נמכר (בטווח)", visible: true },
  { id: "leads_by_channel", title: "לידים לפי ערוצים", visible: true },
  { id: "paying_count", title: "לקוחות במערכת (פייפליין לקוחות משלמים)", visible: true },
  { id: "customers_by_channel", title: "לקוחות לפי ערוצים", visible: true },
  { id: "paying_open", title: "לקוחות פעילים", visible: true },
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
      ? `/contacts/${encodeURIComponent(t.entityId)}`
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

  function kpiCard(
    label: string,
    value: string | number,
    hint?: string,
    valueColor: string = "#6d28d9"
  ) {
    return (
      <div style={{ background: "#fff", border: "1px solid #e5e7eb", borderRadius: 16, padding: 16 }}>
        <div style={{ fontSize: 12, color: "#6b7280", fontWeight: 800, textAlign: "right" }}>{label}</div>
        <div style={{ fontSize: 36, fontWeight: 900, color: valueColor, marginTop: 6, textAlign: "right" }}>{value}</div>
        {hint ? (
          <div style={{ marginTop: 6, fontSize: 11, color: "#9ca3af", fontWeight: 600, textAlign: "right" }}>{hint}</div>
        ) : null}
      </div>
    );
  }

  function renderWidget(id: WidgetId) {
    const m = metrics;

    if (id === "opp_count") {
      return (
        <div key={id}>
          {kpiCard(
            "כמות לקוחות",
            m ? prettyCount(m.opportunityCount) : "—",
            "לקוחות שנוצרו בטווח התאריכים (כל הפייפליינים)"
          )}
        </div>
      );
    }
    if (id === "deals_open") {
      const green = "#15803d";
      return (
        <div key={id}>
          {kpiCard(
            "עסקאות פתוחות",
            m ? prettyCount(m.propertyDealsOpenCount) : "—",
            "סטטוס בהתאמה / נחתם · עסקאות שנוצרו בטווח התאריכים",
            green
          )}
        </div>
      );
    }
    if (id === "deals_purchase") {
      const green = "#15803d";
      return (
        <div key={id}>
          {kpiCard(
            "עסקאות — סיום רכישה",
            m ? prettyCount(m.propertyDealsPurchaseCount) : "—",
            "סטטוס «סיום רכישה» · יצירת הרשומה בטווח התאריכים",
            green
          )}
        </div>
      );
    }
    if (id === "deals_sold") {
      const green = "#15803d";
      return (
        <div key={id}>
          {kpiCard(
            "עסקאות — נמכר (מכירה)",
            m ? prettyCount(m.propertyDealsSoldCount) : "—",
            "סטטוס «נמכר» · יצירת הרשומה בטווח התאריכים",
            green
          )}
        </div>
      );
    }
    if (id === "leads_by_channel") {
      return (
        <div key={id}>
          {tableShell("לקוחות לפי ערוץ", "לפי utm_source של רשומת הלקוח בטווח התאריכים", renderUtmTable(m ? sortedEntries(m.leadsByUtmSource) : []))}
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
              ? `פייפליין: ${m.payingCustomersPipelineName} · לפי תאריך יצירת הלקוח בטווח`
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
            "רשומות בפייפליין «לקוחות משלמים» עם סטטוס פתוח (ללא סינון תאריכים)"
          )}
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
                          {t.entityType === "contact" ? "איש קשר" : "לקוח"} · {t.entityName}
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
    id === "opp_count" ||
    id === "deals_open" ||
    id === "deals_purchase" ||
    id === "deals_sold" ||
    id === "paying_count" ||
    id === "paying_open";

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

      {metrics && Object.keys(metrics.salesStageCounts ?? {}).length > 0 && (
        <div style={{ marginTop: 18 }}>
          <div style={{ fontWeight: 900, fontSize: 18, marginBottom: 10 }}>
            ניהול לקוחות · {metrics.salesPipelineName}
          </div>
          <div style={{ fontSize: 13, color: "#6b7280", marginBottom: 12, lineHeight: 1.45 }}>
            ספירת לקוחות לפי שלב בפייפליין. לחיצה פותחת את לוח הניהול מסונן לשלב.
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
    </div>
  );
}
