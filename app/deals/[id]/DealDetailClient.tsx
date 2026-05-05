"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useMemo, useState } from "react";

type Deal = {
  id: string;
  name: string;
  pipelineId?: string;
  pipelineStage?: string;
  clientCount?: number;
  dealType?: string;
  city?: string;
  fullAddress?: string;
  linkedContactIds: string[];
  saleAgreementUrl?: string;
  driveFolderUrl?: string;
  businessPlanUrl?: string;
  status?: string;
  notes?: string;
  tasks?: Array<{
    id: string;
    title: string;
    dueAt: string;
    reminderAt?: string;
    done: boolean;
    status?: "todo" | "in_progress" | "done";
    comments?: Array<{ id: string; text: string; createdAt: string }>;
    createdAt: string;
  }>;
};

type Pipeline = { id: string; name: string; stages: string[] };

export default function DealDetailClient({ id }: { id: string }) {
  const router = useRouter();
  const [deal, setDeal] = useState<Deal | null>(null);
  const [contacts, setContacts] = useState<Record<string, { name: string; phone: string }>>({});
  const [pipelines, setPipelines] = useState<Pipeline[]>([]);
  const [err, setErr] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [taskTitle, setTaskTitle] = useState("");
  const [taskDueAt, setTaskDueAt] = useState("");
  const [taskStatus, setTaskStatus] = useState<"todo" | "in_progress" | "done">("todo");
  const [taskComment, setTaskComment] = useState<Record<string, string>>({});

  const [draft, setDraft] = useState<Partial<Deal>>({});

  const stagesForDraft = useMemo(() => {
    const pid = draft.pipelineId?.trim();
    if (!pid) return [];
    return pipelines.find((p) => p.id === pid)?.stages ?? [];
  }, [draft.pipelineId, pipelines]);

  async function load() {
    setErr(null);
    try {
      const res = await fetch(`/api/deals/${encodeURIComponent(id)}`, { credentials: "include", cache: "no-store" });
      const j = (await res.json().catch(() => ({}))) as { ok?: boolean; deal?: Deal; error?: string };
      if (!res.ok || !j.ok || !j.deal) throw new Error(j.error ?? "לא נמצא");
      setDeal(j.deal);
      setDraft(j.deal);

      const ids = j.deal.linkedContactIds ?? [];
      const map: Record<string, { name: string; phone: string }> = {};
      await Promise.all(
        ids.map(async (cid) => {
          const r = await fetch(`/api/contacts/${encodeURIComponent(cid)}`, {
            credentials: "include",
            cache: "no-store",
          });
          const cj = (await r.json().catch(() => ({}))) as {
            ok?: boolean;
            lead?: { name?: string; phone?: string };
          };
          if (cj.ok && cj.lead) {
            map[cid] = { name: cj.lead.name ?? "", phone: cj.lead.phone ?? "" };
          }
        })
      );
      setContacts(map);
    } catch (e) {
      setErr(e instanceof Error ? e.message : "שגיאה");
    }
  }

  useEffect(() => {
    void load();
  }, [id]);

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      try {
        const res = await fetch("/api/opportunities/pipelines?scope=property_deal", {
          credentials: "include",
          cache: "no-store",
        });
        const j = (await res.json()) as { ok?: boolean; pipelines?: Pipeline[] };
        if (!cancelled && res.ok && j.ok) setPipelines(j.pipelines ?? []);
      } catch {
        /* ignore */
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  function appendDealNote(base: string | undefined, text: string): string {
    const prefix = `[${new Date().toLocaleString("he-IL")}]`;
    const next = `${prefix} ${text}`.trim();
    const prev = (base ?? "").trim();
    return prev ? `${prev}\n${next}` : next;
  }

  async function save(nextDraft: Partial<Deal> = draft) {
    if (!deal) return;
    setSaving(true);
    setErr(null);
    try {
      const res = await fetch(`/api/deals/${encodeURIComponent(id)}`, {
        method: "PATCH",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: nextDraft.name,
          pipelineId: nextDraft.pipelineId?.trim() ?? "",
          pipelineStage: nextDraft.pipelineStage?.trim() ?? "",
          clientCount: nextDraft.clientCount,
          dealType: nextDraft.dealType,
          city: nextDraft.city,
          fullAddress: nextDraft.fullAddress,
          linkedContactIds: nextDraft.linkedContactIds,
          saleAgreementUrl: nextDraft.saleAgreementUrl,
          driveFolderUrl: nextDraft.driveFolderUrl,
          businessPlanUrl: nextDraft.businessPlanUrl,
          status: nextDraft.status,
          notes: nextDraft.notes,
          tasks: nextDraft.tasks ?? [],
        }),
      });
      const j = (await res.json().catch(() => ({}))) as { ok?: boolean; deal?: Deal; error?: string };
      if (!res.ok || !j.ok) throw new Error(j.error ?? "שמירה נכשלה");
      setDeal(j.deal ?? deal);
      setDraft(j.deal ?? deal);
    } catch (e) {
      setErr(e instanceof Error ? e.message : "שגיאה");
    } finally {
      setSaving(false);
    }
  }

  async function createTask() {
    const title = taskTitle.trim();
    if (!title) return;
    const nextTasks = [
      ...(draft.tasks ?? []),
      {
        id: crypto.randomUUID(),
        title,
        dueAt: taskDueAt.trim(),
        done: taskStatus === "done",
        status: taskStatus,
        comments: [],
        createdAt: new Date().toISOString(),
      },
    ];
    const nextDraft: Partial<Deal> = {
      ...draft,
      tasks: nextTasks,
      notes: appendDealNote(draft.notes, `נפתחה משימה: ${title}`),
    };
    setDraft(nextDraft);
    await save(nextDraft);
    setTaskTitle("");
    setTaskDueAt("");
    setTaskStatus("todo");
  }

  async function addTaskComment(taskId: string) {
    const text = (taskComment[taskId] ?? "").trim();
    if (!text) return;
    const nextTasks =
      draft.tasks?.map((t) =>
        t.id === taskId
          ? {
              ...t,
              comments: [...(t.comments ?? []), { id: crypto.randomUUID(), text, createdAt: new Date().toISOString() }],
            }
          : t
      ) ?? [];
    const title = nextTasks.find((t) => t.id === taskId)?.title ?? "משימה";
    const nextDraft: Partial<Deal> = {
      ...draft,
      tasks: nextTasks,
      notes: appendDealNote(draft.notes, `תיעוד משימה (${title}): ${text}`),
    };
    setDraft(nextDraft);
    await save(nextDraft);
    setTaskComment((m) => ({ ...m, [taskId]: "" }));
  }

  if (!deal && !err) {
    return <div style={{ padding: 24 }}>טוען…</div>;
  }

  if (err && !deal) {
    return (
      <div style={{ padding: 24 }}>
        <div style={{ color: "#b91c1c", marginBottom: 12 }}>{err}</div>
        <Link href="/deals" style={{ color: "#2563eb", fontWeight: 700 }}>
          חזרה לרשימה
        </Link>
      </div>
    );
  }

  return (
    <div style={{ maxWidth: 920 }}>
      <div style={{ display: "flex", gap: 12, alignItems: "center", flexWrap: "wrap", marginBottom: 16 }}>
        <button type="button" onClick={() => router.push("/deals")} style={{ border: "1px solid #e5e7eb", borderRadius: 10, padding: "6px 12px", background: "#fff", cursor: "pointer" }}>
          ← חזרה
        </button>
        <h1 style={{ margin: 0, fontSize: 22, fontWeight: 900 }}>{deal?.name ?? "עסקה"}</h1>
      </div>

      {err && (
        <div style={{ marginBottom: 12, background: "#fef2f2", border: "1px solid #fecaca", color: "#b91c1c", padding: 12, borderRadius: 12 }}>
          {err}
        </div>
      )}

      <div style={{ display: "grid", gap: 14 }}>
        <section style={{ background: "#fff", border: "1px solid #e5e7eb", borderRadius: 14, padding: 16 }}>
          <div style={{ fontWeight: 900, marginBottom: 12 }}>פרטי עסקה</div>
          <div style={{ display: "grid", gap: 10, gridTemplateColumns: "repeat(auto-fit, minmax(240px, 1fr))" }}>
            <label style={{ display: "grid", gap: 4 }}>
              <span style={{ fontSize: 12, fontWeight: 700, color: "#6b7280" }}>שם</span>
              <input
                value={draft.name ?? ""}
                onChange={(e) => setDraft((d) => ({ ...d, name: e.target.value }))}
                style={{ padding: "8px 10px", borderRadius: 10, border: "1px solid #e5e7eb" }}
              />
            </label>
            <label style={{ display: "grid", gap: 4 }}>
              <span style={{ fontSize: 12, fontWeight: 700, color: "#6b7280" }}>פייפליין</span>
              <select
                value={draft.pipelineId ?? ""}
                onChange={(e) => {
                  const pid = e.target.value;
                  if (!pid) {
                    setDraft((d) => ({ ...d, pipelineId: undefined, pipelineStage: undefined }));
                    return;
                  }
                  const p = pipelines.find((x) => x.id === pid);
                  const first = p?.stages?.[0] ?? "";
                  setDraft((d) => ({
                    ...d,
                    pipelineId: pid,
                    pipelineStage:
                      d.pipelineStage && p?.stages?.includes(d.pipelineStage) ? d.pipelineStage : first || undefined,
                  }));
                }}
                style={{ padding: "8px 10px", borderRadius: 10, border: "1px solid #e5e7eb" }}
              >
                <option value="">ללא פייפליין</option>
                {pipelines.map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.name}
                  </option>
                ))}
              </select>
            </label>
            <label style={{ display: "grid", gap: 4 }}>
              <span style={{ fontSize: 12, fontWeight: 700, color: "#6b7280" }}>שלב בפייפליין</span>
              <select
                value={draft.pipelineStage ?? ""}
                disabled={!draft.pipelineId?.trim() || stagesForDraft.length === 0}
                onChange={(e) => setDraft((d) => ({ ...d, pipelineStage: e.target.value || undefined }))}
                style={{ padding: "8px 10px", borderRadius: 10, border: "1px solid #e5e7eb" }}
              >
                <option value="">—</option>
                {stagesForDraft.map((s) => (
                  <option key={s} value={s}>
                    {s}
                  </option>
                ))}
              </select>
            </label>
            <label style={{ display: "grid", gap: 4 }}>
              <span style={{ fontSize: 12, fontWeight: 700, color: "#6b7280" }}>סוג עסקה (שליש / מלא)</span>
              <input
                value={draft.dealType ?? ""}
                onChange={(e) => setDraft((d) => ({ ...d, dealType: e.target.value }))}
                style={{ padding: "8px 10px", borderRadius: 10, border: "1px solid #e5e7eb" }}
              />
            </label>
            <label style={{ display: "grid", gap: 4 }}>
              <span style={{ fontSize: 12, fontWeight: 700, color: "#6b7280" }}>עיר</span>
              <input
                value={draft.city ?? ""}
                onChange={(e) => setDraft((d) => ({ ...d, city: e.target.value }))}
                style={{ padding: "8px 10px", borderRadius: 10, border: "1px solid #e5e7eb" }}
              />
            </label>
            <label style={{ display: "grid", gap: 4, gridColumn: "1 / -1" }}>
              <span style={{ fontSize: 12, fontWeight: 700, color: "#6b7280" }}>כתובת מלאה</span>
              <input
                value={draft.fullAddress ?? ""}
                onChange={(e) => setDraft((d) => ({ ...d, fullAddress: e.target.value }))}
                style={{ padding: "8px 10px", borderRadius: 10, border: "1px solid #e5e7eb" }}
              />
            </label>
            <label style={{ display: "grid", gap: 4 }}>
              <span style={{ fontSize: 12, fontWeight: 700, color: "#6b7280" }}>סטטוס</span>
              <select
                value={draft.status ?? "בהתאמה"}
                onChange={(e) => setDraft((d) => ({ ...d, status: e.target.value }))}
                style={{ padding: "8px 10px", borderRadius: 10, border: "1px solid #e5e7eb" }}
              >
                {["בהתאמה", "נחתם", "סיום רכישה", "נמכר"].map((s) => (
                  <option key={s} value={s}>
                    {s}
                  </option>
                ))}
              </select>
            </label>
          </div>
        </section>

        <section style={{ background: "#fff", border: "1px solid #e5e7eb", borderRadius: 14, padding: 16 }}>
          <div style={{ fontWeight: 900, marginBottom: 12 }}>מסמכים וקישורים</div>
          <div style={{ display: "grid", gap: 10 }}>
            <label style={{ display: "grid", gap: 4 }}>
              <span style={{ fontSize: 12, fontWeight: 700, color: "#6b7280" }}>הסכם מכר (URL)</span>
              <input
                value={draft.saleAgreementUrl ?? ""}
                onChange={(e) => setDraft((d) => ({ ...d, saleAgreementUrl: e.target.value }))}
                style={{ padding: "8px 10px", borderRadius: 10, border: "1px solid #e5e7eb" }}
              />
            </label>
            <label style={{ display: "grid", gap: 4 }}>
              <span style={{ fontSize: 12, fontWeight: 700, color: "#6b7280" }}>תיקיית טיוטות / דרייב</span>
              <input
                value={draft.driveFolderUrl ?? ""}
                onChange={(e) => setDraft((d) => ({ ...d, driveFolderUrl: e.target.value }))}
                style={{ padding: "8px 10px", borderRadius: 10, border: "1px solid #e5e7eb" }}
              />
            </label>
            <label style={{ display: "grid", gap: 4 }}>
              <span style={{ fontSize: 12, fontWeight: 700, color: "#6b7280" }}>תכנית עסקית (URL)</span>
              <input
                value={draft.businessPlanUrl ?? ""}
                onChange={(e) => setDraft((d) => ({ ...d, businessPlanUrl: e.target.value }))}
                style={{ padding: "8px 10px", borderRadius: 10, border: "1px solid #e5e7eb" }}
              />
              {draft.businessPlanUrl ? (
                <a href={draft.businessPlanUrl} target="_blank" rel="noreferrer" style={{ fontSize: 13, fontWeight: 700 }}>
                  פתיחה בלשונית חדשה
                </a>
              ) : null}
            </label>
          </div>
        </section>

        <section style={{ background: "#fff", border: "1px solid #e5e7eb", borderRadius: 14, padding: 16 }}>
          <div style={{ fontWeight: 900, marginBottom: 12 }}>לקוחות משויכים</div>
          <p style={{ margin: "0 0 8px", fontSize: 13, color: "#6b7280" }}>
            הדבק מזהי אנשי קשר מופרדים בפסיק (ממסך אנשי קשר).
          </p>
          <textarea
            value={(draft.linkedContactIds ?? []).join(", ")}
            onChange={(e) =>
              setDraft((d) => ({
                ...d,
                linkedContactIds: e.target.value
                  .split(",")
                  .map((x) => x.trim())
                  .filter(Boolean),
              }))
            }
            rows={2}
            style={{ width: "100%", padding: "8px 10px", borderRadius: 10, border: "1px solid #e5e7eb", fontFamily: "inherit" }}
          />
          <div style={{ marginTop: 12, display: "grid", gap: 8 }}>
            {(draft.linkedContactIds ?? []).map((cid) => (
              <div key={cid} style={{ display: "flex", justifyContent: "space-between", gap: 8, flexWrap: "wrap" }}>
                <span style={{ fontWeight: 700 }}>{contacts[cid]?.name || cid}</span>
                <Link href={`/contacts/${encodeURIComponent(cid)}`} style={{ color: "#2563eb", fontWeight: 700 }}>
                  כרטיס לקוח
                </Link>
              </div>
            ))}
          </div>
        </section>

        <section style={{ background: "#fff", border: "1px solid #e5e7eb", borderRadius: 14, padding: 16 }}>
          <div style={{ fontWeight: 900, marginBottom: 12 }}>הערות</div>
          <textarea
            value={draft.notes ?? ""}
            onChange={(e) => setDraft((d) => ({ ...d, notes: e.target.value }))}
            rows={5}
            style={{ width: "100%", padding: "8px 10px", borderRadius: 10, border: "1px solid #e5e7eb", fontFamily: "inherit" }}
          />
        </section>

        <section style={{ background: "#fff", border: "1px solid #e5e7eb", borderRadius: 14, padding: 16 }}>
          <div style={{ fontWeight: 900, marginBottom: 12 }}>משימות עסקה</div>
          <div style={{ display: "grid", gap: 8, marginBottom: 12 }}>
            <input
              value={taskTitle}
              onChange={(e) => setTaskTitle(e.target.value)}
              placeholder="כותרת משימה"
              style={{ padding: "8px 10px", borderRadius: 10, border: "1px solid #e5e7eb" }}
            />
            <input
              type="datetime-local"
              value={taskDueAt}
              onChange={(e) => setTaskDueAt(e.target.value)}
              style={{ padding: "8px 10px", borderRadius: 10, border: "1px solid #e5e7eb" }}
            />
            <select
              value={taskStatus}
              onChange={(e) => setTaskStatus(e.target.value as "todo" | "in_progress" | "done")}
              style={{ padding: "8px 10px", borderRadius: 10, border: "1px solid #e5e7eb" }}
            >
              <option value="todo">לביצוע</option>
              <option value="in_progress">בתהליך</option>
              <option value="done">בוצע</option>
            </select>
            <button
              type="button"
              onClick={() => void createTask()}
              disabled={saving || !taskTitle.trim()}
              style={{ padding: "8px 12px", borderRadius: 10, border: "1px solid #e5e7eb", background: "#fff", cursor: "pointer", fontWeight: 700 }}
            >
              + הוסף משימה לעסקה
            </button>
          </div>

          <div style={{ display: "grid", gap: 10 }}>
            {(draft.tasks ?? []).map((t) => (
              <div key={t.id} style={{ border: "1px solid #e5e7eb", borderRadius: 10, padding: 10 }}>
                <div style={{ fontWeight: 800 }}>{t.title}</div>
                <div style={{ fontSize: 12, color: "#6b7280", marginTop: 4 }}>
                  סטטוס: {t.status ?? (t.done ? "done" : "todo")} · דדליין: {t.dueAt || "—"}
                </div>
                <div style={{ display: "grid", gap: 6, marginTop: 8 }}>
                  {(t.comments ?? []).map((c) => (
                    <div key={c.id} style={{ fontSize: 12, background: "#fafafa", padding: "6px 8px", borderRadius: 8 }}>
                      {c.text}
                    </div>
                  ))}
                  <textarea
                    value={taskComment[t.id] ?? ""}
                    onChange={(e) => setTaskComment((m) => ({ ...m, [t.id]: e.target.value }))}
                    placeholder="תיעוד למשימה"
                    rows={2}
                    style={{ width: "100%", padding: "8px 10px", borderRadius: 10, border: "1px solid #e5e7eb", fontFamily: "inherit" }}
                  />
                  <button
                    type="button"
                    onClick={() => void addTaskComment(t.id)}
                    disabled={saving || !(taskComment[t.id] ?? "").trim()}
                    style={{ padding: "6px 10px", borderRadius: 10, border: "1px solid #e5e7eb", background: "#fff", cursor: "pointer", fontWeight: 700 }}
                  >
                    הוסף תיעוד
                  </button>
                </div>
              </div>
            ))}
          </div>
        </section>

        <div>
          <button
            type="button"
            onClick={() => void save()}
            disabled={saving}
            style={{
              padding: "10px 20px",
              borderRadius: 12,
              border: "none",
              cursor: saving ? "wait" : "pointer",
              fontWeight: 800,
              background: "linear-gradient(180deg, #a78bfa 0%, #6d28d9 100%)",
              color: "#fff",
            }}
          >
            {saving ? "שומר…" : "שמור"}
          </button>
        </div>
      </div>
    </div>
  );
}
