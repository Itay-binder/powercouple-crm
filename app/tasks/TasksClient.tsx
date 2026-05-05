"use client";

import { useEffect, useMemo, useState, type DragEvent } from "react";
import { formatIsraelDateTime } from "@/lib/datetime/formatIsrael";
import { InlineFieldShell } from "@/app/components/InlineFieldShell";
import {
  naiveLocalInputToStoredIso,
  parseTaskInstant,
  utcIsoToJerusalemDatetimeLocal,
} from "@/lib/datetime/taskTimestamps";

type TaskStatus = "todo" | "in_progress" | "done";
type TaskComment = { id: string; text: string; createdAt: string };
type Task = {
  id: string;
  title: string;
  dueAt: string;
  reminderAt?: string;
  status: TaskStatus;
  done: boolean;
  comments: TaskComment[];
  assignedRep?: string;
  entityType: "contact" | "opportunity" | "deal";
  entityId: string;
  entityName: string;
  entityPhone?: string;
  createdAt: string;
  pipelineId: string;
  pipelineName: string;
  syncToGoogleCalendar?: boolean;
  googleCalendarId?: string;
};

type GCalOptTask = { id: string; summary?: string; primary?: boolean };

type PipelineRow = { id: string; name: string; stages: string[] };

type ViewMode = "pipeline" | "table";

const COLUMNS: Array<{ id: TaskStatus; label: string }> = [
  { id: "todo", label: "To Do" },
  { id: "in_progress", label: "In Progress" },
  { id: "done", label: "Done" },
];

function toLocalInput(iso: string): string {
  return utcIsoToJerusalemDatetimeLocal(String(iso ?? ""));
}

function fromLocalInput(v: string): string {
  return naiveLocalInputToStoredIso(v);
}

function entityHref(t: Task): string {
  if (t.entityType === "contact") return `/contacts/${encodeURIComponent(t.entityId)}`;
  if (t.entityType === "deal") return `/deals/${encodeURIComponent(t.entityId)}`;
  return `/pipeline?openOpportunityId=${encodeURIComponent(t.entityId)}`;
}

function taskRowKey(t: Task): string {
  return `${t.entityType}|${t.entityId}|${t.id}`;
}

type TableSortKey =
  | "title"
  | "status"
  | "dueAt"
  | "reminderAt"
  | "entityPhone"
  | "createdAt"
  | "pipelineName"
  | "entityName";

function compareTasksForSort(a: Task, b: Task, key: TableSortKey, dir: "asc" | "desc"): number {
  const sign = dir === "asc" ? 1 : -1;
  const ttime = (raw: string | undefined) => parseTaskInstant(raw)?.getTime() ?? 0;
  switch (key) {
    case "dueAt":
      return sign * (ttime(a.dueAt) - ttime(b.dueAt));
    case "reminderAt":
      return sign * (ttime(a.reminderAt) - ttime(b.reminderAt));
    case "createdAt":
      return sign * (ttime(a.createdAt) - ttime(b.createdAt));
    default: {
      const va = String((a as Record<string, unknown>)[key] ?? "");
      const vb = String((b as Record<string, unknown>)[key] ?? "");
      return sign * va.localeCompare(vb, "he");
    }
  }
}

function taskDeadlinePassed(t: Task): boolean {
  if (t.status === "done") return false;
  const du = parseTaskInstant(t.dueAt);
  if (!du) return false;
  return du.getTime() < Date.now();
}

export default function TasksClient() {
  const [loading, setLoading] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [tasks, setTasks] = useState<Task[]>([]);
  const [pipelines, setPipelines] = useState<PipelineRow[]>([]);
  const [viewMode, setViewMode] = useState<ViewMode>("pipeline");
  const [active, setActive] = useState<Task | null>(null);
  const [dueLocal, setDueLocal] = useState("");
  const [reminderLocal, setReminderLocal] = useState("");
  const [commentText, setCommentText] = useState("");
  const [tableSortKey, setTableSortKey] = useState<TableSortKey>("createdAt");
  const [tableSortDir, setTableSortDir] = useState<"asc" | "desc">("desc");
  const [inlineEdit, setInlineEdit] = useState<{
    key: string;
    field: "title" | "status" | "dueAt" | "reminderAt";
    draft: string;
  } | null>(null);
  const [gcalLoading, setGcalLoading] = useState(false);
  const [gcalConnected, setGcalConnected] = useState(false);
  const [gcalList, setGcalList] = useState<GCalOptTask[]>([]);
  const [calSync, setCalSync] = useState(false);
  const [calIdPick, setCalIdPick] = useState("primary");

  useEffect(() => {
    if (!active) {
      setDueLocal("");
      setReminderLocal("");
      return;
    }
    setDueLocal(toLocalInput(active.dueAt));
    setReminderLocal(toLocalInput(active.reminderAt ?? ""));
  }, [active]);

  useEffect(() => {
    if (!active) return;
    let cancelled = false;
    void (async () => {
      setGcalLoading(true);
      try {
        const stRes = await fetch("/api/google-calendar/status", {
          credentials: "include",
          cache: "no-store",
        });
        const st = (await stRes.json().catch(() => ({}))) as {
          ok?: boolean;
          connected?: boolean;
        };
        const connected = Boolean(stRes.ok && st.ok && st.connected);
        let cals: GCalOptTask[] = [];
        if (connected) {
          const cRes = await fetch("/api/google-calendar/calendars", {
            credentials: "include",
            cache: "no-store",
          });
          const cj = (await cRes.json().catch(() => ({}))) as {
            ok?: boolean;
            calendars?: GCalOptTask[];
          };
          if (cRes.ok && cj.ok) cals = cj.calendars ?? [];
        }
        if (cancelled) return;
        setGcalConnected(connected);
        setGcalList(cals);
        const defaultCal =
          cals.find((c) => c.primary)?.id ?? cals[0]?.id ?? "primary";
        setCalSync(Boolean(active.syncToGoogleCalendar));
        setCalIdPick(String(active.googleCalendarId ?? "").trim() || defaultCal);
      } catch {
        if (!cancelled) {
          setGcalConnected(false);
          setGcalList([]);
          setCalSync(false);
        }
      } finally {
        if (!cancelled) setGcalLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [active]);

  async function load() {
    setLoading(true);
    setErr(null);
    try {
      const [res, pres] = await Promise.all([
        fetch("/api/tasks", { credentials: "include", cache: "no-store" }),
        fetch("/api/opportunities/pipelines", { credentials: "include", cache: "no-store" }),
      ]);
      if (res.status === 401) {
        window.location.href = `/login?returnTo=${encodeURIComponent("/tasks")}`;
        return;
      }
      if (res.status === 403) {
        window.location.href = `/pending?returnTo=${encodeURIComponent("/tasks")}`;
        return;
      }
      const j = (await res.json().catch(() => ({}))) as {
        ok?: boolean;
        error?: string;
        tasks?: Task[];
      };
      if (!res.ok || !j.ok) throw new Error(j.error ?? "טעינת משימות נכשלה");
      setTasks(j.tasks ?? []);

      const pj = (await pres.json().catch(() => ({}))) as {
        ok?: boolean;
        pipelines?: PipelineRow[];
      };
      if (pres.ok && pj.ok) setPipelines(pj.pipelines ?? []);
    } catch (e) {
      setErr(e instanceof Error ? e.message : "טעינת משימות נכשלה");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    void load();
  }, []);

  const grouped = useMemo(() => {
    return {
      todo: tasks.filter((t) => t.status === "todo"),
      in_progress: tasks.filter((t) => t.status === "in_progress"),
      done: tasks.filter((t) => t.status === "done"),
    };
  }, [tasks]);

  const tableRowsSorted = useMemo(() => {
    const copy = [...tasks];
    copy.sort((a, b) => compareTasksForSort(a, b, tableSortKey, tableSortDir));
    return copy;
  }, [tasks, tableSortKey, tableSortDir]);

  function onTableSortClick(key: TableSortKey) {
    if (tableSortKey === key) {
      setTableSortDir((d) => (d === "asc" ? "desc" : "asc"));
    } else {
      setTableSortKey(key);
      const alpha =
        key === "title" ||
        key === "entityName" ||
        key === "pipelineName" ||
        key === "entityPhone" ||
        key === "status";
      setTableSortDir(alpha ? "asc" : "desc");
    }
  }

  function sortIndicator(key: TableSortKey): string {
    if (tableSortKey !== key) return "";
    return tableSortDir === "asc" ? " ▲" : " ▼";
  }

  async function commitInlineEditIfNeeded(t: Task) {
    if (!inlineEdit || inlineEdit.key !== taskRowKey(t)) return;
    const field = inlineEdit.field;
    const d = inlineEdit.draft.trim();
    let ok = false;
    if (field === "title") {
      if (!d) {
        setInlineEdit(null);
        return;
      }
      ok = await patchTask(t, { title: d });
    } else if (field === "dueAt") {
      ok = await patchTask(t, { dueAt: d ? fromLocalInput(d) : "" });
    } else if (field === "reminderAt") {
      ok = await patchTask(t, { reminderAt: d ? fromLocalInput(d) : "" });
    }
    if (ok) setInlineEdit(null);
  }

  const pipelineSections = useMemo(() => {
    const seen = new Map<string, string>();
    for (const t of tasks) {
      if (!seen.has(t.pipelineId)) seen.set(t.pipelineId, t.pipelineName);
    }
    const ordered: { id: string; name: string }[] = [];
    if (seen.has("__contact__")) {
      ordered.push({ id: "__contact__", name: seen.get("__contact__") ?? "אנשי קשר" });
    }
    const rest = [...pipelines]
      .sort((a, b) => a.name.localeCompare(b.name, "he"))
      .filter((p) => seen.has(p.id))
      .map((p) => ({ id: p.id, name: p.name }));
    for (const p of rest) {
      if (!ordered.some((x) => x.id === p.id)) ordered.push(p);
    }
    for (const [id, name] of seen) {
      if (!ordered.some((x) => x.id === id)) ordered.push({ id, name });
    }
    return ordered;
  }, [tasks, pipelines]);

  async function patchTask(
    task: Task,
    patch: {
      status?: TaskStatus;
      title?: string;
      dueAt?: string;
      reminderAt?: string;
      commentText?: string;
      syncToGoogleCalendar?: boolean;
      googleCalendarId?: string;
    }
  ): Promise<boolean> {
    const res = await fetch("/api/tasks", {
      method: "PATCH",
      credentials: "include",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        entityType: task.entityType,
        entityId: task.entityId,
        taskId: task.id,
        ...patch,
      }),
    });
    const j = (await res.json().catch(() => ({}))) as {
      ok?: boolean;
      error?: string;
      task?: Task;
    };
    if (!res.ok || !j.ok || !j.task) {
      setErr(j.error ?? "עדכון משימה נכשל");
      return false;
    }
    setTasks((arr) =>
      arr.map((t) => (t.id === task.id && t.entityId === task.entityId ? j.task! : t))
    );
    setActive((cur) =>
      cur && cur.id === task.id && cur.entityId === task.entityId ? j.task! : cur
    );
    return true;
  }

  function renderTaskCard(t: Task, opts?: { pipelineScope?: string }) {
    const blocked =
      opts?.pipelineScope !== undefined && t.pipelineId !== opts.pipelineScope;
    return (
      <div
        key={`${t.entityType}-${t.entityId}-${t.id}`}
        draggable={!blocked}
        onDragStart={(e) => {
          if (blocked) return;
          e.dataTransfer.setData("text/task-key", `${t.entityType}|${t.entityId}|${t.id}`);
        }}
        style={{
          border: "1px solid #f3f4f6",
          background: taskDeadlinePassed(t) ? "rgba(254, 242, 242, 0.75)" : "#fafafa",
          boxShadow: taskDeadlinePassed(t) ? "inset 3px 0 0 #f87171" : undefined,
          borderRadius: 12,
          padding: 10,
          cursor: blocked ? "default" : "grab",
          opacity: blocked ? 0.5 : 1,
        }}
      >
        <button
          type="button"
          onClick={() => setActive(t)}
          style={{
            border: "none",
            background: "transparent",
            padding: 0,
            textAlign: "right",
            width: "100%",
            cursor: "pointer",
          }}
        >
          <div style={{ fontWeight: 900, fontSize: 13 }}>{t.title}</div>
          <div style={{ marginTop: 4, fontSize: 12, color: "#6b7280" }}>
            {t.entityType === "contact" ? "איש קשר" : t.entityType === "deal" ? "עסקה" : "לקוח"}:{" "}
            <span
              role="link"
              tabIndex={0}
              onClick={(ev) => {
                ev.stopPropagation();
                window.location.href = entityHref(t);
              }}
              onKeyDown={(ev) => {
                if (ev.key === "Enter") {
                  ev.stopPropagation();
                  window.location.href = entityHref(t);
                }
              }}
              style={{ color: "#4c1d95", fontWeight: 800, textDecoration: "underline" }}
            >
              {t.entityName}
            </span>
          </div>
          <div style={{ marginTop: 2, fontSize: 12, color: "#6b7280" }}>
            דדליין: {formatIsraelDateTime(t.dueAt)}
          </div>
          {t.reminderAt ? (
            <div style={{ marginTop: 2, fontSize: 11, color: "#7c3aed" }}>
              תזכורת: {formatIsraelDateTime(t.reminderAt)}
            </div>
          ) : null}
          <div style={{ marginTop: 2, fontSize: 11, color: "#9ca3af" }}>{t.pipelineName}</div>
        </button>
      </div>
    );
  }

  function onColumnDrop(col: TaskStatus, pipelineScope?: string) {
    return (e: DragEvent) => {
      const payload = e.dataTransfer.getData("text/task-key");
      if (!payload) return;
      const [entityType, entityId, taskId] = payload.split("|") as [
        Task["entityType"],
        string,
        string,
      ];
      const task = tasks.find(
        (x) => x.entityType === entityType && x.entityId === entityId && x.id === taskId
      );
      if (!task || task.status === col) return;
      if (pipelineScope !== undefined && task.pipelineId !== pipelineScope) return;
      void patchTask(task, { status: col });
    };
  }

  const viewToggle = (
    <div style={{ display: "flex", flexWrap: "wrap", gap: 8, marginBottom: 12 }}>
      {(
        [
          ["pipeline", "לפי פייפליין (דראג אנד דרופ)"],
          ["table", "טבלה"],
        ] as const
      ).map(([id, label]) => (
        <button
          key={id}
          type="button"
          onClick={() => setViewMode(id)}
          style={{
            padding: "8px 14px",
            borderRadius: 999,
            border: viewMode === id ? "2px solid #6d28d9" : "1px solid #e5e7eb",
            background: viewMode === id ? "#f5f3ff" : "#fff",
            fontWeight: 800,
            cursor: "pointer",
            fontSize: 13,
          }}
        >
          {label}
        </button>
      ))}
    </div>
  );

  return (
    <div style={{ width: "100%", maxWidth: "100%", minWidth: 0 }}>
      <div style={{ display: "flex", alignItems: "center", gap: 12, marginBottom: 12 }}>
        <h1 style={{ margin: 0, fontSize: 24, fontWeight: 900 }}>משימות</h1>
        <span
          style={{
            background: "#e0f2fe",
            color: "#0c4a6e",
            borderRadius: 999,
            padding: "4px 10px",
            fontWeight: 800,
            fontSize: 12,
          }}
        >
          {`${tasks.length} סה"כ`}
        </span>
      </div>

      {viewToggle}

      {err && (
        <div
          style={{
            marginBottom: 12,
            background: "#fef2f2",
            border: "1px solid #fecaca",
            color: "#b91c1c",
            padding: 12,
            borderRadius: 12,
          }}
        >
          {err}
        </div>
      )}
      {loading && <div style={{ color: "#6b7280", fontWeight: 700 }}>טוען...</div>}

      {viewMode === "pipeline" && (
        <div style={{ display: "grid", gap: 20 }}>
          {pipelineSections.map((sec) => (
            <div
              key={sec.id}
              style={{
                border: "1px solid #e5e7eb",
                borderRadius: 16,
                padding: 12,
                background: "#fff",
              }}
            >
              <div style={{ fontWeight: 900, marginBottom: 10, fontSize: 15 }}>{sec.name}</div>
              <div style={{ overflowX: "auto" }}>
                <div style={{ display: "flex", gap: 10, minWidth: 900 }}>
                  {COLUMNS.map((col) => {
                    const list = tasks.filter((t) => t.pipelineId === sec.id && t.status === col.id);
                    return (
                      <div
                        key={col.id}
                        style={{
                          width: 280,
                          flexShrink: 0,
                          background: "#fafafa",
                          border: "1px dashed #e5e7eb",
                          borderRadius: 12,
                          padding: 10,
                        }}
                        onDragOver={(e) => e.preventDefault()}
                        onDrop={onColumnDrop(col.id, sec.id)}
                      >
                        <div style={{ fontWeight: 800, fontSize: 12, marginBottom: 8, color: "#6b7280" }}>
                          {col.label} · {list.length}
                        </div>
                        <div style={{ display: "grid", gap: 8, minHeight: 80 }}>
                          {list.map((t) => renderTaskCard(t, { pipelineScope: sec.id }))}
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            </div>
          ))}
        </div>
      )}

      {viewMode === "table" && (
        <div style={{ overflowX: "auto", border: "1px solid #e5e7eb", borderRadius: 12 }}>
          <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 13 }}>
            <thead>
              <tr style={{ background: "#f9fafb", textAlign: "right" }}>
                {(
                  [
                    ["title", "משימה"],
                    ["status", "סטטוס"],
                    ["dueAt", "דדליין"],
                    ["reminderAt", "תזכורת"],
                    ["createdAt", "נוצרה"],
                    ["entityPhone", "פלאפון"],
                    ["pipelineName", "פייפליין"],
                    ["entityName", "קשור ל"],
                  ] as const
                ).map(([key, label]) => (
                  <th key={key} style={{ padding: 10, borderBottom: "1px solid #e5e7eb", whiteSpace: "nowrap" }}>
                    <button
                      type="button"
                      onClick={() => onTableSortClick(key)}
                      style={{
                        border: "none",
                        background: "transparent",
                        cursor: "pointer",
                        fontWeight: 800,
                        fontSize: 13,
                        color: tableSortKey === key ? "#5b21b6" : "#111827",
                        padding: 0,
                      }}
                    >
                      {label}
                      {sortIndicator(key)}
                    </button>
                  </th>
                ))}
                <th style={{ padding: 10, borderBottom: "1px solid #e5e7eb" }}>פרטים</th>
              </tr>
            </thead>
            <tbody>
              {tableRowsSorted.map((t) => {
                const rk = taskRowKey(t);
                const overdue = taskDeadlinePassed(t);
                return (
                  <tr
                    key={rk}
                    style={{
                      borderBottom: "1px solid #f3f4f6",
                      background: overdue ? "rgba(254, 242, 242, 0.5)" : undefined,
                      boxShadow: overdue ? "inset 3px 0 0 #fca5a5" : undefined,
                    }}
                  >
                    <td style={{ padding: 6, verticalAlign: "middle", minWidth: 160 }}>
                      {inlineEdit?.key === rk && inlineEdit.field === "title" ? (
                        <input
                          autoFocus
                          value={inlineEdit.draft}
                          onChange={(e) =>
                            setInlineEdit((s) => (s && s.key === rk ? { ...s, draft: e.target.value } : s))
                          }
                          onBlur={() => void commitInlineEditIfNeeded(t)}
                          onKeyDown={(e) => {
                            if (e.key === "Enter") void commitInlineEditIfNeeded(t);
                            if (e.key === "Escape") setInlineEdit(null);
                          }}
                          style={{ width: "100%", padding: "8px 10px", borderRadius: 8, border: "1px solid #c4b5fd" }}
                        />
                      ) : (
                        <InlineFieldShell
                          rawValue={t.title}
                          label={t.title}
                          onEdit={() =>
                            setInlineEdit({ key: rk, field: "title", draft: t.title })
                          }
                        />
                      )}
                    </td>
                    <td style={{ padding: 6, verticalAlign: "middle", minWidth: 120 }}>
                      {inlineEdit?.key === rk && inlineEdit.field === "status" ? (
                        <select
                          autoFocus
                          value={inlineEdit.draft}
                          onChange={(e) => {
                            const v = e.target.value as TaskStatus;
                            void (async () => {
                              const ok = await patchTask(t, { status: v });
                              if (ok) setInlineEdit(null);
                            })();
                          }}
                          style={{ width: "100%", padding: "8px 10px", borderRadius: 8, border: "1px solid #c4b5fd" }}
                        >
                          <option value="todo">To Do</option>
                          <option value="in_progress">In Progress</option>
                          <option value="done">Done</option>
                        </select>
                      ) : (
                        <InlineFieldShell
                          rawValue={t.status}
                          label={t.status}
                          onEdit={() =>
                            setInlineEdit({ key: rk, field: "status", draft: t.status })
                          }
                        />
                      )}
                    </td>
                    <td style={{ padding: 6, verticalAlign: "middle", minWidth: 130 }}>
                      {inlineEdit?.key === rk && inlineEdit.field === "dueAt" ? (
                        <input
                          type="datetime-local"
                          autoFocus
                          value={inlineEdit.draft}
                          onChange={(e) =>
                            setInlineEdit((s) => (s && s.key === rk ? { ...s, draft: e.target.value } : s))
                          }
                          onBlur={() => void commitInlineEditIfNeeded(t)}
                          style={{ width: "100%", padding: "8px 10px", borderRadius: 8, border: "1px solid #c4b5fd" }}
                        />
                      ) : (
                        <InlineFieldShell
                          rawValue={t.dueAt}
                          label={formatIsraelDateTime(t.dueAt)}
                          onEdit={() =>
                            setInlineEdit({
                              key: rk,
                              field: "dueAt",
                              draft: toLocalInput(t.dueAt),
                            })
                          }
                        />
                      )}
                    </td>
                    <td style={{ padding: 6, verticalAlign: "middle", minWidth: 130 }}>
                      {inlineEdit?.key === rk && inlineEdit.field === "reminderAt" ? (
                        <input
                          type="datetime-local"
                          autoFocus
                          value={inlineEdit.draft}
                          onChange={(e) =>
                            setInlineEdit((s) => (s && s.key === rk ? { ...s, draft: e.target.value } : s))
                          }
                          onBlur={() => void commitInlineEditIfNeeded(t)}
                          style={{ width: "100%", padding: "8px 10px", borderRadius: 8, border: "1px solid #c4b5fd" }}
                        />
                      ) : (
                        <InlineFieldShell
                          rawValue={t.reminderAt ?? ""}
                          label={t.reminderAt ? formatIsraelDateTime(t.reminderAt) : "—"}
                          onEdit={() =>
                            setInlineEdit({
                              key: rk,
                              field: "reminderAt",
                              draft: toLocalInput(t.reminderAt ?? ""),
                            })
                          }
                        />
                      )}
                    </td>
                    <td style={{ padding: 10, verticalAlign: "middle", fontSize: 12, color: "#374151" }}>
                      {t.createdAt ? formatIsraelDateTime(t.createdAt) : "—"}
                    </td>
                    <td style={{ padding: 6, verticalAlign: "middle", minWidth: 120 }}>
                      {t.entityPhone?.trim() ? (
                        <InlineFieldShell
                          readonly
                          integration="phone"
                          rawValue={t.entityPhone}
                          label={t.entityPhone}
                          onEdit={() => {}}
                        />
                      ) : (
                        <span style={{ color: "#9ca3af" }}>—</span>
                      )}
                    </td>
                    <td style={{ padding: 10, verticalAlign: "middle" }}>{t.pipelineName}</td>
                    <td style={{ padding: 10, verticalAlign: "middle" }}>
                      <a href={entityHref(t)} style={{ color: "#4c1d95", fontWeight: 700 }}>
                        {t.entityName}
                      </a>
                    </td>
                    <td style={{ padding: 10, verticalAlign: "middle" }}>
                      <button
                        type="button"
                        onClick={() => setActive(t)}
                        style={{
                          border: "1px solid #e5e7eb",
                          background: "#fff",
                          borderRadius: 8,
                          padding: "6px 10px",
                          cursor: "pointer",
                          fontWeight: 700,
                          fontSize: 12,
                        }}
                      >
                        פתח
                      </button>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      {active && (
        <div style={{ position: "fixed", inset: 0, zIndex: 95 }}>
          <div
            style={{ position: "absolute", inset: 0, background: "rgba(0,0,0,0.25)" }}
            onMouseDown={() => setActive(null)}
          />
          <div
            style={{
              position: "absolute",
              top: 0,
              left: 0,
              height: "100%",
              width: "min(520px, 94vw)",
              background: "#fff",
              borderRight: "1px solid #e5e7eb",
              boxShadow: "12px 0 30px rgba(0,0,0,0.08)",
              padding: 16,
              overflow: "auto",
            }}
            onMouseDown={(e) => e.stopPropagation()}
          >
            <h3 style={{ margin: 0, marginBottom: 10 }}>{active.title}</h3>
            <div style={{ display: "flex", flexWrap: "wrap", gap: 8, marginBottom: 12 }}>
              <a
                href={entityHref(active)}
                style={{
                  display: "inline-block",
                  padding: "6px 10px",
                  borderRadius: 8,
                  background: "#ede9fe",
                  color: "#5b21b6",
                  fontWeight: 800,
                  fontSize: 12,
                  textDecoration: "none",
                }}
              >
                {active.entityType === "contact" ? "פתח איש קשר" : active.entityType === "deal" ? "פתח עסקה" : "פתח לקוח"}
              </a>
              <span style={{ fontSize: 12, color: "#6b7280", alignSelf: "center" }}>
                {active.pipelineName}
              </span>
            </div>
            <div style={{ display: "grid", gap: 8 }}>
              <label style={{ fontWeight: 700, fontSize: 12 }}>כותרת</label>
              <input
                value={active.title}
                onChange={(e) => setActive((x) => (x ? { ...x, title: e.target.value } : x))}
                style={{ padding: "8px 10px", borderRadius: 10, border: "1px solid #e5e7eb" }}
              />
              <label style={{ fontWeight: 700, fontSize: 12 }}>דדליין (אופציונלי)</label>
              <input
                type="datetime-local"
                value={dueLocal}
                onChange={(e) => setDueLocal(e.target.value)}
                style={{ padding: "8px 10px", borderRadius: 10, border: "1px solid #e5e7eb" }}
              />
              <label style={{ fontWeight: 700, fontSize: 12 }}>תזכורת — תאריך ושעה (אופציונלי)</label>
              <input
                type="datetime-local"
                value={reminderLocal}
                onChange={(e) => setReminderLocal(e.target.value)}
                style={{ padding: "8px 10px", borderRadius: 10, border: "1px solid #e5e7eb" }}
              />
              <p style={{ margin: 0, fontSize: 11, color: "#6b7280", lineHeight: 1.4 }}>
                15 דקות לפני הדדליין נשלחת תזכורת אוטומטית (בנוסף לתזכורת שתקבעו כאן).
              </p>
              {gcalLoading ? (
                <p style={{ margin: 0, fontSize: 11, color: "#6b7280" }}>בודק חיבור ל-Google Calendar...</p>
              ) : gcalConnected ? (
                <div
                  style={{
                    border: "1px solid #e9d5ff",
                    borderRadius: 12,
                    padding: 10,
                    background: "#faf5ff",
                  }}
                >
                  <label style={{ display: "flex", alignItems: "center", gap: 8, fontWeight: 700, fontSize: 12 }}>
                    <input
                      type="checkbox"
                      checked={calSync}
                      onChange={(e) => setCalSync(e.target.checked)}
                    />
                    סנכרן ל-Google Calendar
                  </label>
                  <p style={{ margin: "6px 0 8px", fontSize: 11, color: "#6b7280" }}>
                    דדליין חובה לסנכרון. תזכורת — התראה ב-Google לפני הדדליין.
                  </p>
                  <label style={{ fontWeight: 700, fontSize: 12 }}>לוח יעד</label>
                  <select
                    value={calIdPick}
                    onChange={(e) => setCalIdPick(e.target.value)}
                    style={{
                      width: "100%",
                      marginTop: 4,
                      padding: "8px 10px",
                      borderRadius: 10,
                      border: "1px solid #e5e7eb",
                    }}
                  >
                    {gcalList.length === 0 ? (
                      <option value="primary">ראשי (primary)</option>
                    ) : (
                      gcalList.map((c) => (
                        <option key={c.id} value={c.id}>
                          {(c.summary ?? c.id) + (c.primary ? " ★" : "")}
                        </option>
                      ))
                    )}
                  </select>
                </div>
              ) : (
                <p style={{ margin: 0, fontSize: 11, color: "#6b7280" }}>
                  <a href="/calendar" style={{ color: "#5b21b6", fontWeight: 700 }}>
                    חברו Google Calendar
                  </a>{" "}
                  לסנכרון.
                </p>
              )}
              <label style={{ fontWeight: 700, fontSize: 12 }}>סטטוס</label>
              <select
                value={active.status}
                onChange={(e) =>
                  setActive((x) => (x ? { ...x, status: e.target.value as TaskStatus } : x))
                }
                style={{ padding: "8px 10px", borderRadius: 10, border: "1px solid #e5e7eb" }}
              >
                <option value="todo">To Do</option>
                <option value="in_progress">In Progress</option>
                <option value="done">Done</option>
              </select>
              <button
                type="button"
                onClick={() => {
                  const dueIso = fromLocalInput(dueLocal);
                  const syncOk =
                    gcalConnected && calSync && Boolean(String(dueIso ?? "").trim());
                  void patchTask(active, {
                    title: active.title,
                    dueAt: dueIso,
                    reminderAt: reminderLocal.trim() ? fromLocalInput(reminderLocal) : "",
                    status: active.status,
                    ...(syncOk
                      ? { syncToGoogleCalendar: true, googleCalendarId: calIdPick }
                      : { syncToGoogleCalendar: false, googleCalendarId: "" }),
                  });
                }}
                style={{
                  padding: "9px 12px",
                  borderRadius: 10,
                  border: "none",
                  background: "linear-gradient(180deg, #a78bfa 0%, #6d28d9 100%)",
                  color: "#fff",
                  fontWeight: 800,
                  cursor: "pointer",
                }}
              >
                שמור משימה
              </button>
            </div>

            <div style={{ marginTop: 12 }}>
              <div style={{ fontWeight: 900, marginBottom: 6 }}>תיעוד על משימה</div>
              <div style={{ display: "grid", gap: 8 }}>
                {(active.comments ?? []).map((c) => (
                  <div
                    key={c.id}
                    style={{
                      border: "1px solid #f3f4f6",
                      borderRadius: 10,
                      padding: 8,
                      background: "#fafafa",
                    }}
                  >
                    <div style={{ fontSize: 12 }}>{c.text}</div>
                    <div style={{ marginTop: 4, fontSize: 11, color: "#6b7280" }}>
                      {formatIsraelDateTime(c.createdAt)}
                    </div>
                  </div>
                ))}
                <textarea
                  value={commentText}
                  onChange={(e) => setCommentText(e.target.value)}
                  placeholder="כתוב תיעוד..."
                  style={{
                    minHeight: 80,
                    padding: "8px 10px",
                    borderRadius: 10,
                    border: "1px solid #e5e7eb",
                  }}
                />
                <button
                  type="button"
                  onClick={async () => {
                    const text = commentText.trim();
                    if (!text) return;
                    await patchTask(active, { commentText: text });
                    setCommentText("");
                  }}
                  style={{
                    padding: "8px 10px",
                    borderRadius: 10,
                    border: "1px solid #e5e7eb",
                    background: "#fff",
                    cursor: "pointer",
                  }}
                >
                  הוסף תיעוד
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
