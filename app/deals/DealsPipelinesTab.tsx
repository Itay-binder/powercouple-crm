"use client";

import { useCallback, useEffect, useState } from "react";

type Pipeline = { id: string; name: string; stages: string[] };

export default function DealsPipelinesTab() {
  const [pipelines, setPipelines] = useState<Pipeline[]>([]);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState<string | null>(null);
  const [msg, setMsg] = useState<string | null>(null);
  const [creating, setCreating] = useState(false);
  const [newName, setNewName] = useState("");
  const [newStages, setNewStages] = useState("בהתאמה,נחתם,סגור");
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editName, setEditName] = useState("");
  const [editStages, setEditStages] = useState("");

  const load = useCallback(async () => {
    setLoading(true);
    setErr(null);
    try {
      const res = await fetch("/api/opportunities/pipelines?scope=property_deal", {
        credentials: "include",
        cache: "no-store",
      });
      const j = (await res.json()) as { ok?: boolean; pipelines?: Pipeline[]; error?: string };
      if (!res.ok || !j.ok) throw new Error(j.error ?? "שגיאה");
      setPipelines(j.pipelines ?? []);
    } catch (e) {
      setErr(e instanceof Error ? e.message : "שגיאה");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  async function createPipeline() {
    setMsg(null);
    const name = newName.trim();
    const stages = newStages
      .split(",")
      .map((s) => s.trim())
      .filter(Boolean);
    if (!name || stages.length === 0) {
      setErr("שם ושלבים נדרשים");
      return;
    }
    setCreating(true);
    try {
      const res = await fetch("/api/opportunities/pipelines", {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name, stages, scope: "property_deal" }),
      });
      const j = (await res.json()) as { ok?: boolean; error?: string };
      if (!res.ok || !j.ok) throw new Error(j.error ?? "נכשל");
      setNewName("");
      setNewStages("בהתאמה,נחתם,סגור");
      setMsg("הפייפליין נוצר.");
      await load();
    } catch (e) {
      setErr(e instanceof Error ? e.message : "נכשל");
    } finally {
      setCreating(false);
    }
  }

  function startEdit(p: Pipeline) {
    setEditingId(p.id);
    setEditName(p.name);
    setEditStages(p.stages.join(","));
    setMsg(null);
  }

  async function saveEdit(id: string) {
    setMsg(null);
    const stages = editStages
      .split(",")
      .map((s) => s.trim())
      .filter(Boolean);
    if (!editName.trim() || stages.length === 0) {
      setErr("שם ושלבים נדרשים");
      return;
    }
    try {
      const res = await fetch(`/api/opportunities/pipelines/${encodeURIComponent(id)}`, {
        method: "PATCH",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: editName.trim(), stages }),
      });
      const j = (await res.json()) as { ok?: boolean; error?: string };
      if (!res.ok || !j.ok) throw new Error(j.error ?? "נכשל");
      setEditingId(null);
      setMsg("נשמר.");
      await load();
    } catch (e) {
      setErr(e instanceof Error ? e.message : "נכשל");
    }
  }

  async function remove(id: string) {
    if (!window.confirm("למחוק פייפליין זה?")) return;
    setMsg(null);
    try {
      const res = await fetch(`/api/opportunities/pipelines/${encodeURIComponent(id)}`, {
        method: "DELETE",
        credentials: "include",
      });
      const j = (await res.json()) as { ok?: boolean; error?: string };
      if (!res.ok || !j.ok) throw new Error(j.error ?? "נכשל");
      setMsg("נמחק.");
      await load();
    } catch (e) {
      setErr(e instanceof Error ? e.message : "נכשל");
    }
  }

  if (loading && pipelines.length === 0) {
    return <div style={{ padding: 16 }}>טוען פייפליינים…</div>;
  }

  return (
    <div style={{ maxWidth: 900 }}>
      {err ? (
        <div style={{ marginBottom: 12, padding: 12, borderRadius: 10, background: "#fef2f2", color: "#991b1b" }}>{err}</div>
      ) : null}
      {msg ? (
        <div style={{ marginBottom: 12, padding: 12, borderRadius: 10, background: "#ecfdf5", color: "#065f46" }}>{msg}</div>
      ) : null}

      <div
        style={{
          padding: 16,
          borderRadius: 14,
          border: "1px solid #e5e7eb",
          background: "#fff",
          marginBottom: 20,
        }}
      >
        <div style={{ fontWeight: 900, marginBottom: 10 }}>פייפליין חדש (עסקאות נדל״ן)</div>
        <div style={{ display: "flex", flexWrap: "wrap", gap: 10, alignItems: "center" }}>
          <input
            value={newName}
            onChange={(e) => setNewName(e.target.value)}
            placeholder="שם"
            style={{ padding: "8px 12px", borderRadius: 10, border: "1px solid #d1d5db", minWidth: 200 }}
          />
          <input
            value={newStages}
            onChange={(e) => setNewStages(e.target.value)}
            placeholder="שלבים מופרדים בפסיק"
            style={{ flex: 1, minWidth: 240, padding: "8px 12px", borderRadius: 10, border: "1px solid #d1d5db" }}
          />
          <button
            type="button"
            disabled={creating}
            onClick={() => void createPipeline()}
            style={{
              padding: "8px 16px",
              borderRadius: 10,
              border: "none",
              background: "#6d28d9",
              color: "#fff",
              fontWeight: 800,
              cursor: creating ? "wait" : "pointer",
            }}
          >
            צור
          </button>
        </div>
      </div>

      <div style={{ border: "1px solid #e5e7eb", borderRadius: 14, background: "#fff", overflow: "hidden" }}>
        <table style={{ width: "100%", borderCollapse: "collapse" }}>
          <thead>
            <tr style={{ background: "#f9fafb" }}>
              {["שם", "שלבים", "פעולות"].map((h) => (
                <th key={h} style={{ textAlign: "right", padding: 12, fontSize: 12, fontWeight: 900 }}>
                  {h}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {pipelines.map((p) => (
              <tr key={p.id}>
                <td style={{ padding: 12, borderTop: "1px solid #f3f4f6", fontWeight: 700 }}>
                  {editingId === p.id ? (
                    <input
                      value={editName}
                      onChange={(e) => setEditName(e.target.value)}
                      style={{ width: "100%", padding: 6, borderRadius: 8, border: "1px solid #d1d5db" }}
                    />
                  ) : (
                    p.name
                  )}
                </td>
                <td style={{ padding: 12, borderTop: "1px solid #f3f4f6", fontSize: 13 }}>
                  {editingId === p.id ? (
                    <input
                      value={editStages}
                      onChange={(e) => setEditStages(e.target.value)}
                      style={{ width: "100%", padding: 6, borderRadius: 8, border: "1px solid #d1d5db" }}
                    />
                  ) : (
                    p.stages.join(" · ")
                  )}
                </td>
                <td style={{ padding: 12, borderTop: "1px solid #f3f4f6" }}>
                  {editingId === p.id ? (
                    <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
                      <button
                        type="button"
                        onClick={() => void saveEdit(p.id)}
                        style={{ padding: "6px 12px", borderRadius: 8, border: "none", background: "#6d28d9", color: "#fff", fontWeight: 700 }}
                      >
                        שמור
                      </button>
                      <button
                        type="button"
                        onClick={() => setEditingId(null)}
                        style={{ padding: "6px 12px", borderRadius: 8, border: "1px solid #e5e7eb", background: "#fff" }}
                      >
                        ביטול
                      </button>
                    </div>
                  ) : (
                    <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
                      <button
                        type="button"
                        onClick={() => startEdit(p)}
                        style={{ padding: "6px 12px", borderRadius: 8, border: "1px solid #e5e7eb", background: "#fff", fontWeight: 600 }}
                      >
                        ערוך
                      </button>
                      <button
                        type="button"
                        onClick={() => void remove(p.id)}
                        style={{ padding: "6px 12px", borderRadius: 8, border: "1px solid #fecaca", background: "#fef2f2", color: "#991b1b", fontWeight: 600 }}
                      >
                        מחק
                      </button>
                    </div>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        {pipelines.length === 0 ? (
          <div style={{ padding: 16, color: "#6b7280", fontWeight: 600 }}>אין פייפליינים — צרו אחד למעלה.</div>
        ) : null}
      </div>
    </div>
  );
}
