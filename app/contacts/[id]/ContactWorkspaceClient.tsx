"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useState, type ReactNode } from "react";
import { useRouter } from "next/navigation";
import { formatIsraelDateTime } from "@/lib/datetime/formatIsrael";
import {
  naiveLocalInputToStoredIso,
  utcIsoToJerusalemDatetimeLocal,
} from "@/lib/datetime/taskTimestamps";
import { PC_NOTE_CATEGORIES } from "@/lib/product/powercoupleSpec";
import { WhatsAppIconLink } from "@/app/components/InlineFieldShell";
type ContactCustomFieldDef = {
  id: string;
  fieldId: string;
  label: string;
  type: "text" | "number" | "date" | "select" | "boolean" | "phone" | "email";
  options?: string[];
  isActive: boolean;
};

type NoteItem = {
  id: string;
  text: string;
  createdAt: string;
  createdBy?: string;
  category?: string;
  attachments?: Array<{ id: string; fileName: string; url: string }>;
};

type TaskItem = {
  id: string;
  title: string;
  dueAt: string;
  reminderAt?: string;
  done: boolean;
  status?: "todo" | "in_progress" | "done";
  comments?: Array<{ id: string; text: string; createdAt: string }>;
  createdAt: string;
  syncToGoogleCalendar?: boolean;
  googleCalendarId?: string;
};

type LeadPayload = {
  id: string;
  contactCode?: string;
  name?: string;
  email?: string;
  phone?: string;
  stage?: string;
  status?: "פתוח" | "זכיה" | "הפסד";
  pipelineId?: string;
  assignedRep?: string;
  customFields?: Record<string, unknown>;
  notes?: NoteItem[];
  tasks?: TaskItem[];
};

type OppSummary = {
  id: string;
  name: string;
  pipelineId: string;
  pipelineName?: string;
  stage: string;
  status?: "פתוח" | "זכיה" | "הפסד";
  notes?: NoteItem[];
};

type GCalOpt = { id: string; summary?: string; primary?: boolean };

function toLocalInputTask(iso: string): string {
  return utcIsoToJerusalemDatetimeLocal(String(iso ?? ""));
}
function fromLocalInputTask(v: string): string {
  return naiveLocalInputToStoredIso(v);
}

function taskOpen(t: TaskItem): boolean {
  const st = t.status ?? (t.done ? "done" : "todo");
  return st !== "done" && !t.done;
}

function buildTimelineNotes(lead: LeadPayload, opps: OppSummary[]): Array<NoteItem & { key: string; sourceLabel: string }> {
  const map = new Map<string, NoteItem & { key: string; sourceLabel: string }>();
  for (const n of lead.notes ?? []) {
    map.set(n.id, { ...n, key: `c-${n.id}`, sourceLabel: "איש קשר" });
  }
  for (const o of opps) {
    const label = o.pipelineName ? `${o.pipelineName} · ${o.stage}` : o.stage;
    for (const n of o.notes ?? []) {
      if (!map.has(n.id)) {
        map.set(n.id, { ...n, key: `o-${o.id}-${n.id}`, sourceLabel: label });
      }
    }
  }
  return Array.from(map.values()).sort(
    (a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()
  );
}

function mergeOpenTasks(lead: LeadPayload, aggregated: TaskItem[]): Array<TaskItem & { scope: "contact" | "opportunity" }> {
  const fromLead = (lead.tasks ?? []).map((t) => ({ ...t, scope: "contact" as const }));
  const seen = new Set(fromLead.map((t) => t.id));
  const fromAgg = aggregated
    .filter((t) => !seen.has(t.id))
    .map((t) => ({ ...t, scope: "opportunity" as const }));
  return [...fromLead, ...fromAgg].filter(taskOpen);
}

function renderCustomControl(
  field: ContactCustomFieldDef,
  raw: unknown,
  onChange: (v: unknown) => void
): ReactNode {
  const fid = field.fieldId;
  const label = field.label || fid;
  const base = { padding: "8px 10px", borderRadius: 10, border: "1px solid #e5e7eb", width: "100%" as const };

  const valStr = raw === undefined || raw === null ? "" : String(raw);

  if (field.type === "boolean") {
    const checked = raw === true || valStr === "true" || valStr === "1";
    return (
      <label key={fid} style={{ display: "flex", alignItems: "center", gap: 8, fontWeight: 700, fontSize: 13 }}>
        <input type="checkbox" checked={checked} onChange={(e) => onChange(e.target.checked)} />
        {label}
      </label>
    );
  }

  if (field.type === "select" && field.options?.length) {
    return (
      <label key={fid} style={{ display: "grid", gap: 4 }}>
        <span style={{ fontSize: 12, fontWeight: 700, color: "#4b5563" }}>{label}</span>
        <select value={valStr} onChange={(e) => onChange(e.target.value)} style={base}>
          <option value="">—</option>
          {field.options.map((o) => (
            <option key={o} value={o}>
              {o}
            </option>
          ))}
        </select>
      </label>
    );
  }

  if (field.type === "number") {
    return (
      <label key={fid} style={{ display: "grid", gap: 4 }}>
        <span style={{ fontSize: 12, fontWeight: 700, color: "#4b5563" }}>{label}</span>
        <input
          type="number"
          value={valStr}
          onChange={(e) => onChange(e.target.value)}
          style={base}
        />
      </label>
    );
  }

  if (field.type === "date") {
    return (
      <label key={fid} style={{ display: "grid", gap: 4 }}>
        <span style={{ fontSize: 12, fontWeight: 700, color: "#4b5563" }}>{label}</span>
        <input type="date" value={valStr.slice(0, 10)} onChange={(e) => onChange(e.target.value)} style={base} />
      </label>
    );
  }

  return (
    <label key={fid} style={{ display: "grid", gap: 4 }}>
      <span style={{ fontSize: 12, fontWeight: 700, color: "#4b5563" }}>{label}</span>
      <input value={valStr} onChange={(e) => onChange(e.target.value)} style={base} />
    </label>
  );
}

export type ContactWorkspaceClientProps = {
  contactId: string;
  viewerEmail: string;
};

export default function ContactWorkspaceClient({ contactId, viewerEmail }: ContactWorkspaceClientProps) {
  const router = useRouter();
  const [err, setErr] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [lead, setLead] = useState<LeadPayload | null>(null);
  const [opportunities, setOpportunities] = useState<OppSummary[]>([]);
  const [aggregatedTasks, setAggregatedTasks] = useState<TaskItem[]>([]);
  const [adminUsers, setAdminUsers] = useState<Array<{ email: string; name?: string }>>([]);
  const [customFieldsDef, setCustomFieldsDef] = useState<ContactCustomFieldDef[]>([]);
  const [saving, setSaving] = useState(false);

  const [newNoteText, setNewNoteText] = useState("");
  const [newNoteCategory, setNewNoteCategory] = useState<string>(PC_NOTE_CATEGORIES[0] ?? "אחר");
  const [newNoteFiles, setNewNoteFiles] = useState<File[]>([]);
  const [noteUploading, setNoteUploading] = useState(false);

  const [contactTaskModal, setContactTaskModal] = useState<
    null | { mode: "new" } | { mode: "edit"; task: TaskItem }
  >(null);
  const [ctTaskTitle, setCtTaskTitle] = useState("");
  const [ctTaskDue, setCtTaskDue] = useState("");
  const [ctTaskRem, setCtTaskRem] = useState("");
  const [ctTaskStatus, setCtTaskStatus] = useState<"todo" | "in_progress" | "done">("todo");
  const [gcalLoading, setGcalLoading] = useState(false);
  const [gcalConnected, setGcalConnected] = useState(false);
  const [gcalList, setGcalList] = useState<GCalOpt[]>([]);
  const [ctSyncGcal, setCtSyncGcal] = useState(false);
  const [ctGcalCalId, setCtGcalCalId] = useState("primary");

  const reload = useCallback(async () => {
    setErr(null);
    setLoading(true);
    try {
      const res = await fetch(`/api/contacts/${encodeURIComponent(contactId)}`, {
        credentials: "include",
        cache: "no-store",
      });
      const j = (await res.json().catch(() => ({}))) as {
        ok?: boolean;
        error?: string;
        lead?: LeadPayload;
        opportunities?: OppSummary[];
        aggregatedTasks?: TaskItem[];
      };
      if (!res.ok || !j.ok || !j.lead) throw new Error(j.error ?? "טעינת איש קשר נכשלה");
      setLead(j.lead);
      setOpportunities(j.opportunities ?? []);
      setAggregatedTasks(j.aggregatedTasks ?? []);
    } catch (e) {
      setErr(e instanceof Error ? e.message : "טעינה נכשלה");
      setLead(null);
    } finally {
      setLoading(false);
    }
  }, [contactId]);

  useEffect(() => {
    void reload();
  }, [reload]);

  useEffect(() => {
    void (async () => {
      try {
        const res = await fetch("/api/admin-users", { credentials: "include", cache: "no-store" });
        const j = (await res.json().catch(() => ({}))) as {
          ok?: boolean;
          users?: Array<{ email: string; name?: string }>;
        };
        if (res.ok && j.ok) setAdminUsers(j.users ?? []);
      } catch {}
    })();
  }, []);

  useEffect(() => {
    if (!lead) return;
    const pipe = lead.pipelineId?.trim();
    const url = pipe
      ? `/api/custom-fields?entityType=contact&pipelineId=${encodeURIComponent(pipe)}`
      : `/api/custom-fields?entityType=contact`;
    void (async () => {
      try {
        const res = await fetch(url, { credentials: "include", cache: "no-store" });
        const j = (await res.json().catch(() => ({}))) as { ok?: boolean; fields?: ContactCustomFieldDef[] };
        if (res.ok && j.ok) {
          const fields = (j.fields ?? []).filter((f) => f.isActive).slice();
          fields.sort((a, b) => (a.label || "").localeCompare(b.label || "", "he"));
          setCustomFieldsDef(fields);
        }
      } catch {}
    })();
  }, [lead?.pipelineId, lead?.id]);

  useEffect(() => {
    if (!contactTaskModal) return;
    if (contactTaskModal.mode === "new") {
      setCtTaskTitle("");
      setCtTaskDue("");
      setCtTaskRem("");
      setCtTaskStatus("todo");
      return;
    }
    const t = contactTaskModal.task;
    setCtTaskTitle(t.title);
    setCtTaskDue(toLocalInputTask(t.dueAt));
    setCtTaskRem(toLocalInputTask(t.reminderAt ?? ""));
    setCtTaskStatus((t.status ?? (t.done ? "done" : "todo")) as "todo" | "in_progress" | "done");
  }, [contactTaskModal]);

  useEffect(() => {
    if (!contactTaskModal) return;
    let cancelled = false;
    void (async () => {
      setGcalLoading(true);
      try {
        const stRes = await fetch("/api/google-calendar/status", { credentials: "include", cache: "no-store" });
        const st = (await stRes.json().catch(() => ({}))) as { ok?: boolean; connected?: boolean };
        const connected = Boolean(stRes.ok && st.ok && st.connected);
        let cals: GCalOpt[] = [];
        if (connected) {
          const cRes = await fetch("/api/google-calendar/calendars", { credentials: "include", cache: "no-store" });
          const cj = (await cRes.json().catch(() => ({}))) as { ok?: boolean; calendars?: GCalOpt[] };
          if (cRes.ok && cj.ok) cals = cj.calendars ?? [];
        }
        if (cancelled) return;
        setGcalConnected(connected);
        setGcalList(cals);
        const defaultCal = cals.find((c) => c.primary)?.id ?? cals[0]?.id ?? "primary";
        if (contactTaskModal.mode === "new") {
          setCtSyncGcal(connected);
          setCtGcalCalId(defaultCal);
        } else {
          const t = contactTaskModal.task;
          setCtSyncGcal(Boolean(t.syncToGoogleCalendar));
          const stored = String(t.googleCalendarId ?? "").trim();
          setCtGcalCalId(stored || defaultCal);
        }
      } catch {
        if (!cancelled) {
          setGcalConnected(false);
          setGcalList([]);
          setCtSyncGcal(false);
        }
      } finally {
        if (!cancelled) setGcalLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [contactTaskModal]);

  const timeline = useMemo(() => {
    if (!lead) return [];
    return buildTimelineNotes(lead, opportunities);
  }, [lead, opportunities]);

  const openTasks = useMemo(() => {
    if (!lead) return [];
    return mergeOpenTasks(lead, aggregatedTasks);
  }, [lead, aggregatedTasks]);

  const viewerLabel = viewerEmail.trim() || "משתמש CRM";

  async function saveLeadPatch(next: Partial<LeadPayload>) {
    if (!lead) return;
    setSaving(true);
    setErr(null);
    try {
      const res = await fetch(`/api/contacts/${encodeURIComponent(lead.id)}`, {
        method: "PATCH",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(next),
      });
      const j = (await res.json().catch(() => ({}))) as { ok?: boolean; error?: string; lead?: LeadPayload };
      if (!res.ok || !j.ok || !j.lead) throw new Error(j.error ?? "שמירה נכשלה");
      setLead(j.lead);
    } catch (e) {
      setErr(e instanceof Error ? e.message : "שמירה נכשלה");
    } finally {
      setSaving(false);
    }
  }

  function setCustomField(fieldId: string, value: unknown) {
    if (!lead) return;
    setLead({
      ...lead,
      customFields: { ...(lead.customFields ?? {}), [fieldId]: value },
    });
  }

  const title = lead?.name || lead?.email || lead?.phone || contactId;

  if (loading && !lead) {
    return (
      <div style={{ padding: 24, fontWeight: 700, color: "#6b7280" }} dir="rtl">
        טוען…
      </div>
    );
  }

  if (!lead) {
    return (
      <div style={{ padding: 24 }} dir="rtl">
        <p style={{ color: "#b91c1c", fontWeight: 700 }}>{err ?? "לא נמצא"}</p>
        <Link href="/contacts" style={{ color: "#6d28d9", fontWeight: 800 }}>
          חזרה לאנשי קשר
        </Link>
      </div>
    );
  }

  return (
    <div style={{ width: "100%", maxWidth: "100%", minWidth: 0 }} dir="rtl">
      <div style={{ display: "flex", alignItems: "center", gap: 12, flexWrap: "wrap", marginBottom: 14 }}>
        <button
          type="button"
          onClick={() => router.push("/contacts")}
          style={{
            border: "1px solid #e5e7eb",
            background: "#fff",
            borderRadius: 10,
            padding: "8px 12px",
            cursor: "pointer",
            fontWeight: 800,
          }}
        >
          ← חזרה
        </button>
        <h1 style={{ margin: 0, fontSize: 22, fontWeight: 900 }}>{title}</h1>
        {lead.contactCode ? (
          <span style={{ fontSize: 13, color: "#6b7280", fontWeight: 700 }}>{lead.contactCode}</span>
        ) : null}
      </div>

      {err ? (
        <div
          style={{
            marginBottom: 12,
            padding: 10,
            borderRadius: 10,
            background: "#fef2f2",
            color: "#991b1b",
            fontWeight: 700,
          }}
        >
          {err}
        </div>
      ) : null}

      <div
        style={{
          display: "grid",
          gridTemplateColumns: "minmax(260px, 30%) minmax(0, 1fr) minmax(240px, 28%)",
          gap: 14,
          alignItems: "start",
        }}
      >
        {/* Left — פרטים אישיים */}
        <section
          style={{
            border: "1px solid #e5e7eb",
            borderRadius: 16,
            padding: 14,
            background: "#fafafa",
            minHeight: 360,
          }}
        >
          <h2 style={{ margin: "0 0 12px", fontSize: 16, fontWeight: 900 }}>פרטים אישיים</h2>
          <div style={{ display: "grid", gap: 10 }}>
            <label style={{ display: "grid", gap: 4 }}>
              <span style={{ fontSize: 12, fontWeight: 700, color: "#4b5563" }}>שם</span>
              <input
                value={lead.name ?? ""}
                onChange={(e) => setLead((d) => (d ? { ...d, name: e.target.value } : d))}
                style={{ padding: "8px 10px", borderRadius: 10, border: "1px solid #e5e7eb" }}
              />
            </label>
            <label style={{ display: "grid", gap: 4 }}>
              <span style={{ fontSize: 12, fontWeight: 700, color: "#4b5563" }}>טלפון</span>
              <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                <input
                  value={lead.phone ?? ""}
                  onChange={(e) => setLead((d) => (d ? { ...d, phone: e.target.value } : d))}
                  style={{
                    flex: 1,
                    minWidth: 0,
                    padding: "8px 10px",
                    borderRadius: 10,
                    border: "1px solid #e5e7eb",
                  }}
                />
                {lead.phone?.trim() ? <WhatsAppIconLink phone={lead.phone} size={18} /> : null}
              </div>
            </label>
            <label style={{ display: "grid", gap: 4 }}>
              <span style={{ fontSize: 12, fontWeight: 700, color: "#4b5563" }}>אימייל</span>
              <input
                value={lead.email ?? ""}
                onChange={(e) => setLead((d) => (d ? { ...d, email: e.target.value } : d))}
                style={{ padding: "8px 10px", borderRadius: 10, border: "1px solid #e5e7eb" }}
              />
            </label>
            <label style={{ display: "grid", gap: 4 }}>
              <span style={{ fontSize: 12, fontWeight: 700, color: "#4b5563" }}>סטטוס</span>
              <select
                value={lead.status ?? "פתוח"}
                onChange={(e) =>
                  setLead((d) =>
                    d ? { ...d, status: e.target.value as LeadPayload["status"] } : d
                  )
                }
                style={{ padding: "8px 10px", borderRadius: 10, border: "1px solid #e5e7eb" }}
              >
                {["פתוח", "זכיה", "הפסד"].map((s) => (
                  <option key={s} value={s}>
                    {s}
                  </option>
                ))}
              </select>
            </label>
            <label style={{ display: "grid", gap: 4 }}>
              <span style={{ fontSize: 12, fontWeight: 700, color: "#4b5563" }}>אחראי</span>
              <select
                value={lead.assignedRep ?? ""}
                onChange={(e) => setLead((d) => (d ? { ...d, assignedRep: e.target.value } : d))}
                style={{ padding: "8px 10px", borderRadius: 10, border: "1px solid #e5e7eb" }}
              >
                <option value="">לא משויך</option>
                {adminUsers.map((u) => (
                  <option key={u.email} value={u.email}>
                    {u.name?.trim() || u.email}
                  </option>
                ))}
              </select>
            </label>

            {lead.stage ? (
              <div style={{ fontSize: 12, color: "#6b7280" }}>
                <span style={{ fontWeight: 700 }}>שלב (מערכת): </span>
                {lead.stage}
              </div>
            ) : null}

            <div style={{ borderTop: "1px solid #e5e7eb", paddingTop: 10, marginTop: 4 }}>
              <div style={{ fontWeight: 900, marginBottom: 8, fontSize: 14 }}>שדות מותאמים</div>
              <div style={{ display: "grid", gap: 10 }}>
                {customFieldsDef.length === 0 ? (
                  <span style={{ color: "#9ca3af", fontSize: 12 }}>אין שדות מותאמים פעילים</span>
                ) : (
                  customFieldsDef.map((f) =>
                    renderCustomControl(f, (lead.customFields ?? {})[f.fieldId], (v) =>
                      setCustomField(f.fieldId, v)
                    )
                  )
                )}
              </div>
            </div>

            <div style={{ borderTop: "1px solid #e5e7eb", paddingTop: 10 }}>
              <div style={{ fontWeight: 800, marginBottom: 6, fontSize: 13 }}>לקוחות בפייפליין</div>
              <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
                {opportunities.length === 0 ? (
                  <span style={{ color: "#6b7280", fontSize: 12 }}>אין רשומות פייפליין</span>
                ) : (
                  opportunities.map((o) => (
                    <button
                      key={o.id}
                      type="button"
                      onClick={() => {
                        window.location.href = `/pipeline?openOpportunityId=${encodeURIComponent(o.id)}`;
                      }}
                      style={{
                        border: "1px solid #e5e7eb",
                        borderRadius: 12,
                        padding: "6px 10px",
                        fontSize: 12,
                        fontWeight: 700,
                        background: "#fff",
                        cursor: "pointer",
                      }}
                    >
                      {o.name} · {o.pipelineName || o.pipelineId} · {o.stage}
                    </button>
                  ))
                )}
              </div>
            </div>

            <button
              type="button"
              disabled={saving}
              onClick={() =>
                void saveLeadPatch({
                  name: lead.name ?? "",
                  phone: lead.phone ?? "",
                  email: lead.email ?? "",
                  status: lead.status ?? "פתוח",
                  assignedRep: lead.assignedRep ?? "",
                  customFields: lead.customFields ?? {},
                })
              }
              style={{
                marginTop: 8,
                padding: "10px 14px",
                borderRadius: 10,
                border: "none",
                background: "linear-gradient(180deg, #a78bfa 0%, #6d28d9 100%)",
                color: "#fff",
                fontWeight: 800,
                cursor: "pointer",
              }}
            >
              {saving ? "שומר…" : "שמור פרטים"}
            </button>
          </div>
        </section>

        {/* Center — היסטוריית הערות */}
        <section
          style={{
            border: "1px solid #e5e7eb",
            borderRadius: 16,
            padding: 14,
            background: "#fff",
            minHeight: 360,
            display: "flex",
            flexDirection: "column",
            gap: 12,
          }}
        >
          <h2 style={{ margin: 0, fontSize: 16, fontWeight: 900 }}>היסטוריית לקוח / הערות</h2>
          <div style={{ flex: 1, overflow: "auto", display: "flex", flexDirection: "column", gap: 10, maxHeight: "min(58vh, 640px)" }}>
            {timeline.length === 0 ? (
              <div style={{ color: "#9ca3af", fontWeight: 600, fontSize: 13 }}>אין הערות עדיין</div>
            ) : (
              timeline.map((n) => (
                <article
                  key={n.key}
                  style={{
                    border: "1px solid #e5e7eb",
                    borderRadius: 12,
                    padding: 12,
                    background: "#fafafa",
                  }}
                >
                  <div
                    style={{
                      display: "flex",
                      flexWrap: "wrap",
                      gap: 8,
                      alignItems: "center",
                      marginBottom: 8,
                      fontSize: 12,
                    }}
                  >
                    <span
                      style={{
                        background: "#ede9fe",
                        color: "#5b21b6",
                        fontWeight: 800,
                        padding: "2px 8px",
                        borderRadius: 999,
                      }}
                    >
                      {n.category ?? "לא סווג"}
                    </span>
                    <span dir="ltr" style={{ fontWeight: 700 }}>
                      {formatIsraelDateTime(n.createdAt)}
                    </span>
                    <span style={{ color: "#6b7280" }}>· {n.createdBy ?? "—"}</span>
                    <span style={{ color: "#94a3b8", fontSize: 11 }}>({n.sourceLabel})</span>
                  </div>
                  <div style={{ whiteSpace: "pre-wrap", lineHeight: 1.55 }}>{n.text}</div>
                  {(n.attachments ?? []).length > 0 ? (
                    <div style={{ marginTop: 8, display: "flex", flexWrap: "wrap", gap: 8 }}>
                      {(n.attachments ?? []).map((a) => (
                        <a
                          key={a.id}
                          href={a.url}
                          target="_blank"
                          rel="noopener noreferrer"
                          style={{ fontSize: 12, fontWeight: 800, color: "#4c1d95" }}
                        >
                          📎 {a.fileName}
                        </a>
                      ))}
                    </div>
                  ) : null}
                </article>
              ))
            )}
          </div>

          <div style={{ borderTop: "1px solid #f3f4f6", paddingTop: 12 }}>
            <div style={{ fontWeight: 800, marginBottom: 8 }}>הערה חדשה</div>
            <div style={{ display: "grid", gap: 8 }}>
              <select
                value={newNoteCategory}
                onChange={(e) => setNewNoteCategory(e.target.value)}
                style={{ padding: "8px 10px", borderRadius: 10, border: "1px solid #e5e7eb" }}
              >
                {PC_NOTE_CATEGORIES.map((c) => (
                  <option key={c} value={c}>
                    {c}
                  </option>
                ))}
              </select>
              <textarea
                value={newNoteText}
                onChange={(e) => setNewNoteText(e.target.value)}
                placeholder="כתוב הערה…"
                style={{ minHeight: 88, padding: "10px 12px", borderRadius: 10, border: "1px solid #e5e7eb" }}
              />
              <input type="file" multiple onChange={(e) => setNewNoteFiles(Array.from(e.target.files ?? []))} />
              {newNoteFiles.length > 0 ? (
                <div style={{ fontSize: 11, color: "#6b7280" }}>{newNoteFiles.map((f) => f.name).join(", ")}</div>
              ) : null}
              <button
                type="button"
                disabled={noteUploading}
                onClick={() => {
                  void (async () => {
                    const text = newNoteText.trim();
                    if (!text && newNoteFiles.length === 0) return;
                    setNoteUploading(true);
                    setErr(null);
                    try {
                      const attachments: Array<{ id: string; fileName: string; url: string }> = [];
                      for (const f of newNoteFiles) {
                        const fd = new FormData();
                        fd.set("file", f);
                        const res = await fetch("/api/uploads/note-attachment", {
                          method: "POST",
                          body: fd,
                          credentials: "include",
                        });
                        const j = (await res.json().catch(() => ({}))) as {
                          ok?: boolean;
                          error?: string;
                          attachment?: { id: string; fileName: string; url: string };
                        };
                        if (!res.ok || !j.ok || !j.attachment) {
                          throw new Error(j.error ?? "העלאת קובץ נכשלה");
                        }
                        attachments.push(j.attachment);
                      }
                      const noteText = text || (attachments.length ? "מסמך מצורף" : "");
                      const notes = [
                        ...(lead.notes ?? []),
                        {
                          id: crypto.randomUUID(),
                          text: noteText,
                          createdAt: new Date().toISOString(),
                          createdBy: viewerLabel,
                          category: newNoteCategory,
                          ...(attachments.length ? { attachments } : {}),
                        },
                      ];
                      await saveLeadPatch({ notes });
                      setNewNoteText("");
                      setNewNoteFiles([]);
                    } catch (e) {
                      setErr(e instanceof Error ? e.message : "הוספת הערה נכשלה");
                    } finally {
                      setNoteUploading(false);
                    }
                  })();
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
                {noteUploading ? "שומר…" : "הוסף הערה"}
              </button>
            </div>
          </div>
        </section>

        {/* Right — משימות פתוחות */}
        <section
          style={{
            border: "1px solid #e5e7eb",
            borderRadius: 16,
            padding: 14,
            background: "#fafafa",
            minHeight: 360,
          }}
        >
          <h2 style={{ margin: "0 0 12px", fontSize: 16, fontWeight: 900 }}>משימות פתוחות</h2>
          <div style={{ display: "grid", gap: 8 }}>
            {openTasks.length === 0 ? (
              <div style={{ color: "#9ca3af", fontSize: 13, fontWeight: 600 }}>אין משימות פתוחות</div>
            ) : (
              openTasks.map((t) => (
                <div
                  key={`${t.scope}-${t.id}`}
                  style={{
                    border: "1px solid #e5e7eb",
                    borderRadius: 12,
                    padding: "10px 12px",
                    background: t.scope === "opportunity" ? "#f8fafc" : "#fff",
                    borderStyle: t.scope === "opportunity" ? "dashed" : "solid",
                  }}
                >
                  <div style={{ fontWeight: 800, marginBottom: 4 }}>{t.title}</div>
                  <div style={{ fontSize: 12, color: "#6b7280" }}>
                    {t.dueAt ? formatIsraelDateTime(t.dueAt) : "ללא דדליין"}
                  </div>
                  <div style={{ fontSize: 11, color: "#94a3b8", marginTop: 4 }}>
                    {t.scope === "contact" ? "איש קשר" : "מלקוח בפייפליין (קריאה)"}
                  </div>
                  {t.scope === "contact" ? (
                    <div style={{ marginTop: 8, display: "flex", gap: 6 }}>
                      <button
                        type="button"
                        onClick={() => {
                          const tasks = (lead.tasks ?? []).map((x) =>
                            x.id === t.id
                              ? {
                                  ...x,
                                  done: true,
                                  status: "done" as const,
                                }
                              : x
                          );
                          setLead((d) => (d ? { ...d, tasks } : d));
                          void saveLeadPatch({ tasks });
                        }}
                        style={{
                          padding: "4px 8px",
                          borderRadius: 8,
                          border: "1px solid #e5e7eb",
                          background: "#fff",
                          cursor: "pointer",
                          fontSize: 12,
                          fontWeight: 700,
                        }}
                      >
                        סמן בוצע
                      </button>
                      <button
                        type="button"
                        onClick={() => setContactTaskModal({ mode: "edit", task: t })}
                        style={{
                          padding: "4px 8px",
                          borderRadius: 8,
                          border: "1px solid #e5e7eb",
                          background: "#fff",
                          cursor: "pointer",
                          fontSize: 12,
                          fontWeight: 700,
                        }}
                      >
                        ערוך
                      </button>
                    </div>
                  ) : null}
                </div>
              ))
            )}
            <button
              type="button"
              onClick={() => setContactTaskModal({ mode: "new" })}
              style={{
                marginTop: 4,
                padding: "8px 10px",
                borderRadius: 10,
                border: "1px solid #e5e7eb",
                background: "#fff",
                cursor: "pointer",
                fontWeight: 800,
              }}
            >
              + משימה לאיש קשר
            </button>
          </div>
        </section>
      </div>

      {contactTaskModal && (
        <div
          style={{
            position: "fixed",
            inset: 0,
            zIndex: 100,
            background: "rgba(0,0,0,0.35)",
            display: "grid",
            placeItems: "center",
            padding: 16,
          }}
          onMouseDown={() => setContactTaskModal(null)}
        >
          <div
            style={{
              width: "min(440px, 94vw)",
              background: "#fff",
              borderRadius: 16,
              border: "1px solid #e5e7eb",
              padding: 16,
              boxShadow: "0 20px 50px rgba(0,0,0,0.12)",
            }}
            onMouseDown={(e) => e.stopPropagation()}
          >
            <h3 style={{ margin: "0 0 12px", fontSize: 17, fontWeight: 900 }}>
              {contactTaskModal.mode === "new" ? "משימה חדשה" : "עריכת משימה"}
            </h3>
            <div style={{ display: "grid", gap: 8 }}>
              <input
                value={ctTaskTitle}
                onChange={(e) => setCtTaskTitle(e.target.value)}
                placeholder="כותרת"
                style={{ padding: "8px 10px", borderRadius: 10, border: "1px solid #e5e7eb" }}
              />
              <label style={{ fontWeight: 700, fontSize: 12 }}>דדליין (אופציונלי)</label>
              <input
                type="datetime-local"
                value={ctTaskDue}
                onChange={(e) => setCtTaskDue(e.target.value)}
                style={{ padding: "8px 10px", borderRadius: 10, border: "1px solid #e5e7eb" }}
              />
              <label style={{ fontWeight: 700, fontSize: 12 }}>תזכורת (אופציונלי)</label>
              <input
                type="datetime-local"
                value={ctTaskRem}
                onChange={(e) => setCtTaskRem(e.target.value)}
                style={{ padding: "8px 10px", borderRadius: 10, border: "1px solid #e5e7eb" }}
              />
              {gcalLoading ? (
                <p style={{ margin: 0, fontSize: 12, color: "#6b7280" }}>בודק חיבור ל-Google Calendar…</p>
              ) : gcalConnected ? (
                <div
                  style={{
                    border: "1px solid #e9d5ff",
                    borderRadius: 12,
                    padding: 10,
                    background: "#faf5ff",
                  }}
                >
                  <label style={{ display: "flex", alignItems: "center", gap: 8, fontWeight: 700, fontSize: 13 }}>
                    <input type="checkbox" checked={ctSyncGcal} onChange={(e) => setCtSyncGcal(e.target.checked)} />
                    סנכרן ל-Google Calendar
                  </label>
                  <p style={{ margin: "6px 0 8px", fontSize: 11, color: "#6b7280" }}>
                    נדרש דדליין. האירוע ייקבע לפי הדדליין; אם יש תזכורת — תופיע התראה ב-Google לפני הדדליין.
                  </p>
                  <label style={{ fontWeight: 700, fontSize: 12 }}>לוח יעד</label>
                  <select
                    value={ctGcalCalId}
                    onChange={(e) => setCtGcalCalId(e.target.value)}
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
                <p style={{ margin: 0, fontSize: 12, color: "#6b7280" }}>
                  <a href="/calendar" style={{ color: "#5b21b6", fontWeight: 700 }}>
                    חברו Google Calendar
                  </a>{" "}
                  כדי לסנכרן משימות.
                </p>
              )}
              <select
                value={ctTaskStatus}
                onChange={(e) => setCtTaskStatus(e.target.value as "todo" | "in_progress" | "done")}
                style={{ padding: "8px 10px", borderRadius: 10, border: "1px solid #e5e7eb" }}
              >
                <option value="todo">לביצוע</option>
                <option value="in_progress">בתהליך</option>
                <option value="done">בוצע</option>
              </select>
              <div style={{ display: "flex", gap: 8, marginTop: 8 }}>
                <button
                  type="button"
                  disabled={saving || !ctTaskTitle.trim()}
                  onClick={() => {
                    const dueIso = ctTaskDue.trim() ? fromLocalInputTask(ctTaskDue) : "";
                    const remIso = ctTaskRem.trim() ? fromLocalInputTask(ctTaskRem) : "";
                    const title = ctTaskTitle.trim();
                    if (!title) return;
                    const syncOk = gcalConnected && ctSyncGcal && Boolean(dueIso.trim());
                    const gcalFields = syncOk
                      ? { syncToGoogleCalendar: true as const, googleCalendarId: ctGcalCalId }
                      : {};
                    if (contactTaskModal.mode === "new") {
                      const tasks = [
                        ...(lead.tasks ?? []),
                        {
                          id: crypto.randomUUID(),
                          title,
                          dueAt: dueIso,
                          reminderAt: remIso,
                          done: ctTaskStatus === "done",
                          status: ctTaskStatus,
                          comments: [] as Array<{ id: string; text: string; createdAt: string }>,
                          createdAt: new Date().toISOString(),
                          ...gcalFields,
                        },
                      ];
                      setLead((d) => (d ? { ...d, tasks } : d));
                      void saveLeadPatch({ tasks });
                    } else {
                      const tid = contactTaskModal.task.id;
                      const tasks = (lead.tasks ?? []).map((x) =>
                        x.id === tid
                          ? {
                              ...x,
                              title,
                              dueAt: dueIso,
                              reminderAt: remIso,
                              done: ctTaskStatus === "done",
                              status: ctTaskStatus,
                              ...gcalFields,
                              ...(!syncOk
                                ? {
                                    syncToGoogleCalendar: false,
                                    googleCalendarId: undefined,
                                  }
                                : {}),
                            }
                          : x
                      );
                      setLead((d) => (d ? { ...d, tasks } : d));
                      void saveLeadPatch({ tasks });
                    }
                    setContactTaskModal(null);
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
                  שמור
                </button>
                <button
                  type="button"
                  onClick={() => setContactTaskModal(null)}
                  style={{ padding: "9px 12px", borderRadius: 10, border: "1px solid #e5e7eb", background: "#fff", cursor: "pointer" }}
                >
                  ביטול
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
