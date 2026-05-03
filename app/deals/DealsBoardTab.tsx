"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";

export type BoardDeal = {
  id: string;
  name: string;
  pipelineId?: string;
  pipelineStage?: string;
  dealType?: string;
  city?: string;
  fullAddress?: string;
  linkedContactIds: string[];
  status?: string;
};

type Pipeline = { id: string; name: string; stages: string[] };

type Props = {
  deals: BoardDeal[];
  loading: boolean;
  onRefresh: () => void;
};

const FILTER_ALL = "";
const FILTER_NONE = "__none__";

export default function DealsBoardTab({ deals, loading, onRefresh }: Props) {
  const [pipelines, setPipelines] = useState<Pipeline[]>([]);
  const [pipeLoaded, setPipeLoaded] = useState(false);
  const [filterPipelineId, setFilterPipelineId] = useState(FILTER_ALL);
  const [createOpen, setCreateOpen] = useState(false);
  const [draftName, setDraftName] = useState("");
  const [draftPipeId, setDraftPipeId] = useState("");
  const [draftStage, setDraftStage] = useState("");
  const [saving, setSaving] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  async function loadPipelines() {
    try {
      const res = await fetch("/api/opportunities/pipelines?scope=property_deal", {
        credentials: "include",
        cache: "no-store",
      });
      const j = (await res.json()) as { ok?: boolean; pipelines?: Pipeline[] };
      if (res.ok && j.ok) setPipelines(j.pipelines ?? []);
    } catch {
      /* ignore */
    } finally {
      setPipeLoaded(true);
    }
  }

  useEffect(() => {
    void loadPipelines();
  }, []);

  const stagesForDraft = useMemo(() => {
    const p = pipelines.find((x) => x.id === draftPipeId);
    return p?.stages ?? [];
  }, [pipelines, draftPipeId]);

  const filtered = useMemo(() => {
    return deals.filter((d) => {
      if (!filterPipelineId) return true;
      if (filterPipelineId === FILTER_NONE) return !d.pipelineId?.trim();
      return d.pipelineId === filterPipelineId;
    });
  }, [deals, filterPipelineId]);

  async function createDeal() {
    const name = draftName.trim();
    if (!name) return;
    setSaving(true);
    setErr(null);
    try {
      const body: Record<string, unknown> = { name, status: "בהתאמה" };
      const pid = draftPipeId.trim();
      if (pid) {
        body.pipelineId = pid;
        const st = draftStage.trim() || stagesForDraft[0];
        if (st) body.pipelineStage = st;
      }
      const res = await fetch("/api/deals", {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      const j = (await res.json().catch(() => ({}))) as { ok?: boolean; error?: string };
      if (!res.ok || !j.ok) throw new Error(j.error ?? "יצירה נכשלה");
      setCreateOpen(false);
      setDraftName("");
      setDraftPipeId("");
      setDraftStage("");
      onRefresh();
    } catch (e) {
      setErr(e instanceof Error ? e.message : "שגיאה");
    } finally {
      setSaving(false);
    }
  }

  const pipeNameById = useMemo(() => new Map(pipelines.map((p) => [p.id, p.name])), [pipelines]);

  return (
    <div>
      <div style={{ display: "flex", flexWrap: "wrap", gap: 12, alignItems: "flex-end", marginBottom: 14 }}>
        <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
          <label style={{ fontSize: 12, fontWeight: 800, color: "#6b7280" }}>פייפליין</label>
          <select
            value={filterPipelineId}
            onChange={(e) => setFilterPipelineId(e.target.value)}
            style={{ padding: "10px 12px", borderRadius: 12, border: "1px solid #e5e7eb", minWidth: 220 }}
          >
            <option value={FILTER_ALL}>כל העסקאות</option>
            <option value={FILTER_NONE}>ללא פייפליין</option>
            {pipelines.map((p) => (
              <option key={p.id} value={p.id}>
                {p.name}
              </option>
            ))}
          </select>
        </div>
        <button
          type="button"
          onClick={() => {
            void loadPipelines();
            onRefresh();
          }}
          style={{
            padding: "10px 14px",
            borderRadius: 12,
            border: "1px solid #e5e7eb",
            background: "#fff",
            fontWeight: 800,
            cursor: "pointer",
          }}
        >
          רענן
        </button>
        <button
          type="button"
          onClick={() => setCreateOpen(true)}
          style={{
            padding: "10px 16px",
            borderRadius: 12,
            border: "none",
            cursor: "pointer",
            fontWeight: 800,
            background: "linear-gradient(180deg, #a78bfa 0%, #6d28d9 100%)",
            color: "#fff",
          }}
        >
          עסקה חדשה
        </button>
      </div>

      {!pipeLoaded ? (
        <div style={{ color: "#6b7280", marginBottom: 8 }}>טוען הגדרות פייפליין…</div>
      ) : pipelines.length === 0 ? (
        <div
          style={{
            marginBottom: 14,
            padding: 12,
            borderRadius: 12,
            background: "#fffbeb",
            border: "1px solid #fde68a",
            color: "#92400e",
            fontWeight: 600,
          }}
        >
          עדיין אין פייפליין לעסקאות נדל״ן — עברו ללשונית «פייפליינים» כדי ליצור פייפליין ושלבים.
        </div>
      ) : null}

      {err && (
        <div style={{ marginBottom: 12, background: "#fef2f2", border: "1px solid #fecaca", color: "#b91c1c", padding: 12, borderRadius: 12 }}>
          {err}
        </div>
      )}

      {createOpen && (
        <div style={{ marginBottom: 16, padding: 16, background: "#fff", border: "1px solid #e5e7eb", borderRadius: 14, maxWidth: 520 }}>
          <div style={{ fontWeight: 800, marginBottom: 8 }}>עסקה חדשה</div>
          <input
            value={draftName}
            onChange={(e) => setDraftName(e.target.value)}
            placeholder="שם העסקה"
            style={{ width: "100%", padding: "10px 12px", borderRadius: 10, border: "1px solid #e5e7eb", marginBottom: 10 }}
          />
          <div style={{ fontSize: 12, fontWeight: 700, marginBottom: 4 }}>פייפליין (אופציונלי)</div>
          <select
            value={draftPipeId}
            onChange={(e) => {
              const v = e.target.value;
              setDraftPipeId(v);
              const p = pipelines.find((x) => x.id === v);
              setDraftStage(p?.stages[0] ?? "");
            }}
            style={{ width: "100%", padding: "10px 12px", borderRadius: 10, border: "1px solid #e5e7eb", marginBottom: 10 }}
          >
            <option value="">— ללא —</option>
            {pipelines.map((p) => (
              <option key={p.id} value={p.id}>
                {p.name}
              </option>
            ))}
          </select>
          {draftPipeId ? (
            <>
              <div style={{ fontSize: 12, fontWeight: 700, marginBottom: 4 }}>שלב בפייפליין</div>
              <select
                value={draftStage}
                onChange={(e) => setDraftStage(e.target.value)}
                style={{ width: "100%", padding: "10px 12px", borderRadius: 10, border: "1px solid #e5e7eb", marginBottom: 12 }}
              >
                {stagesForDraft.map((s) => (
                  <option key={s} value={s}>
                    {s}
                  </option>
                ))}
              </select>
            </>
          ) : null}
          <div style={{ display: "flex", gap: 8 }}>
            <button
              type="button"
              onClick={() => void createDeal()}
              disabled={saving || !draftName.trim()}
              style={{ padding: "8px 14px", borderRadius: 10, border: "none", background: "#6d28d9", color: "#fff", fontWeight: 700, cursor: "pointer" }}
            >
              {saving ? "שומר…" : "יצירה"}
            </button>
            <button type="button" onClick={() => setCreateOpen(false)} style={{ padding: "8px 14px", borderRadius: 10, border: "1px solid #e5e7eb", background: "#fff", cursor: "pointer" }}>
              ביטול
            </button>
          </div>
        </div>
      )}

      <div style={{ background: "#fff", border: "1px solid #e5e7eb", borderRadius: 14, overflow: "hidden" }}>
        <div style={{ overflowX: "auto" }}>
          <table style={{ width: "100%", minWidth: 960, borderCollapse: "collapse" }}>
            <thead>
              <tr style={{ background: "#f8fafc" }}>
                {["שם העסקה", "פייפליין", "שלב", "סטטוס מכירה", "עיר", "לקוחות", "פעולות"].map((h) => (
                  <th key={h} style={{ textAlign: "right", padding: "12px 14px", fontSize: 12, fontWeight: 900, borderBottom: "2px solid #e5e7eb" }}>
                    {h}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {loading ? (
                <tr>
                  <td colSpan={7} style={{ padding: 20, color: "#6b7280" }}>
                    טוען…
                  </td>
                </tr>
              ) : filtered.length === 0 ? (
                <tr>
                  <td colSpan={7} style={{ padding: 20, color: "#6b7280" }}>
                    אין עסקאות בתצוגה זו.
                  </td>
                </tr>
              ) : (
                filtered.map((d) => (
                  <tr key={d.id} style={{ borderBottom: "1px solid #f3f4f6" }}>
                    <td style={{ padding: "12px 14px", fontWeight: 800 }}>
                      <Link href={`/deals/${encodeURIComponent(d.id)}`} style={{ color: "#4c1d95" }}>
                        {d.name}
                      </Link>
                    </td>
                    <td style={{ padding: "12px 14px" }}>{d.pipelineId ? pipeNameById.get(d.pipelineId) ?? "—" : "—"}</td>
                    <td style={{ padding: "12px 14px" }}>{d.pipelineStage ?? "—"}</td>
                    <td style={{ padding: "12px 14px" }}>{d.status ?? "—"}</td>
                    <td style={{ padding: "12px 14px" }}>{d.city ?? "—"}</td>
                    <td style={{ padding: "12px 14px" }}>{d.linkedContactIds?.length ?? 0}</td>
                    <td style={{ padding: "12px 14px" }}>
                      <Link href={`/deals/${encodeURIComponent(d.id)}`} style={{ fontWeight: 700, color: "#2563eb" }}>
                        פתיחה
                      </Link>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
