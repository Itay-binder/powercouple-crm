"use client";

import { useCallback, useEffect, useState } from "react";
import { formatIsraelDateTime } from "@/lib/datetime/formatIsrael";

type TeamMember = {
  id: string;
  name: string;
  role: string;
  createdAt: string | null;
  updatedAt: string | null;
};

export default function TeamClient() {
  const [members, setMembers] = useState<TeamMember[]>([]);
  const [loading, setLoading] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [name, setName] = useState("");
  const [role, setRole] = useState("");
  const [creating, setCreating] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editName, setEditName] = useState("");
  const [editRole, setEditRole] = useState("");

  const load = useCallback(async () => {
    setLoading(true);
    setErr(null);
    try {
      const res = await fetch("/api/team-members", {
        credentials: "include",
        cache: "no-store",
      });
      const j = (await res.json().catch(() => ({}))) as {
        ok?: boolean;
        members?: TeamMember[];
        error?: string;
      };
      if (!res.ok || !j.ok) throw new Error(j.error ?? "טעינת צוות נכשלה");
      setMembers(j.members ?? []);
    } catch (e) {
      setErr(e instanceof Error ? e.message : "טעינת צוות נכשלה");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  async function createMember() {
    const n = name.trim();
    if (!n) {
      setErr("יש להזין שם מלא");
      return;
    }
    setCreating(true);
    setErr(null);
    try {
      const res = await fetch("/api/team-members", {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: n, role: role.trim() }),
      });
      const j = (await res.json().catch(() => ({}))) as {
        ok?: boolean;
        member?: TeamMember;
        error?: string;
      };
      if (!res.ok || !j.ok || !j.member) {
        throw new Error(j.error ?? "יצירת איש צוות נכשלה");
      }
      setMembers((arr) => [...arr, j.member!].sort((a, b) => a.name.localeCompare(b.name, "he")));
      setName("");
      setRole("");
    } catch (e) {
      setErr(e instanceof Error ? e.message : "יצירת איש צוות נכשלה");
    } finally {
      setCreating(false);
    }
  }

  async function saveEdit(id: string) {
    const n = editName.trim();
    if (!n) {
      setErr("שם לא יכול להיות ריק");
      return;
    }
    setErr(null);
    try {
      const res = await fetch(`/api/team-members/${encodeURIComponent(id)}`, {
        method: "PATCH",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: n, role: editRole.trim() }),
      });
      const j = (await res.json().catch(() => ({}))) as {
        ok?: boolean;
        member?: TeamMember;
        error?: string;
      };
      if (!res.ok || !j.ok || !j.member) {
        throw new Error(j.error ?? "עדכון נכשל");
      }
      setMembers((arr) =>
        arr
          .map((m) => (m.id === id ? j.member! : m))
          .sort((a, b) => a.name.localeCompare(b.name, "he"))
      );
      setEditingId(null);
    } catch (e) {
      setErr(e instanceof Error ? e.message : "עדכון נכשל");
    }
  }

  async function removeMember(id: string) {
    if (!window.confirm("להסיר את איש הצוות?")) return;
    setErr(null);
    try {
      const res = await fetch(`/api/team-members/${encodeURIComponent(id)}`, {
        method: "DELETE",
        credentials: "include",
      });
      const j = (await res.json().catch(() => ({}))) as { ok?: boolean; error?: string };
      if (!res.ok || !j.ok) throw new Error(j.error ?? "מחיקה נכשלה");
      setMembers((arr) => arr.filter((m) => m.id !== id));
    } catch (e) {
      setErr(e instanceof Error ? e.message : "מחיקה נכשלה");
    }
  }

  return (
    <div style={{ width: "100%", maxWidth: 880 }}>
      <h1 style={{ margin: "0 0 12px", fontSize: 24, fontWeight: 900 }}>ניהול צוות</h1>
      <p style={{ color: "#6b7280", marginTop: 0 }}>
        הוספה ועריכה של אנשי הצוות (נציגי מכירות / שירות) המשמשים לשיוך בשיחות, משימות ועוד.
      </p>

      {err ? (
        <div
          style={{
            background: "#fef2f2",
            border: "1px solid #fecaca",
            color: "#b91c1c",
            padding: 10,
            borderRadius: 10,
            marginBottom: 12,
          }}
        >
          {err}
        </div>
      ) : null}

      <div
        style={{
          display: "grid",
          gridTemplateColumns: "1fr 1fr auto",
          gap: 8,
          alignItems: "center",
          marginBottom: 16,
        }}
      >
        <input
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder="שם מלא"
          style={{ padding: "10px 12px", borderRadius: 10, border: "1px solid #e5e7eb" }}
        />
        <input
          value={role}
          onChange={(e) => setRole(e.target.value)}
          placeholder="תפקיד (לדוגמה: נציג מכירות)"
          style={{ padding: "10px 12px", borderRadius: 10, border: "1px solid #e5e7eb" }}
        />
        <button
          type="button"
          disabled={creating || !name.trim()}
          onClick={() => void createMember()}
          style={{
            padding: "10px 16px",
            borderRadius: 10,
            border: "none",
            background: "linear-gradient(180deg, #a78bfa 0%, #6d28d9 100%)",
            color: "#fff",
            fontWeight: 800,
            cursor: creating || !name.trim() ? "default" : "pointer",
            opacity: creating || !name.trim() ? 0.6 : 1,
          }}
        >
          {creating ? "מוסיף..." : "+ הוסף איש צוות"}
        </button>
      </div>

      {loading ? <div style={{ color: "#6b7280" }}>טוען...</div> : null}

      <div style={{ border: "1px solid #e5e7eb", borderRadius: 12, overflow: "hidden" }}>
        <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 13 }}>
          <thead style={{ background: "#f9fafb", textAlign: "right" }}>
            <tr>
              <th style={{ padding: 10, borderBottom: "1px solid #e5e7eb" }}>שם</th>
              <th style={{ padding: 10, borderBottom: "1px solid #e5e7eb" }}>תפקיד</th>
              <th style={{ padding: 10, borderBottom: "1px solid #e5e7eb" }}>נוצר ב</th>
              <th style={{ padding: 10, borderBottom: "1px solid #e5e7eb" }}>פעולות</th>
            </tr>
          </thead>
          <tbody>
            {members.length === 0 && !loading ? (
              <tr>
                <td colSpan={4} style={{ padding: 14, color: "#6b7280" }}>
                  אין אנשי צוות. הוסף את הראשון.
                </td>
              </tr>
            ) : null}
            {members.map((m) => {
              const editing = editingId === m.id;
              return (
                <tr key={m.id} style={{ borderBottom: "1px solid #f3f4f6" }}>
                  <td style={{ padding: 10, fontWeight: 700 }}>
                    {editing ? (
                      <input
                        value={editName}
                        onChange={(e) => setEditName(e.target.value)}
                        style={{ padding: "6px 8px", borderRadius: 8, border: "1px solid #c4b5fd", width: "100%" }}
                      />
                    ) : (
                      m.name
                    )}
                  </td>
                  <td style={{ padding: 10 }}>
                    {editing ? (
                      <input
                        value={editRole}
                        onChange={(e) => setEditRole(e.target.value)}
                        style={{ padding: "6px 8px", borderRadius: 8, border: "1px solid #c4b5fd", width: "100%" }}
                      />
                    ) : (
                      m.role || "—"
                    )}
                  </td>
                  <td style={{ padding: 10, fontSize: 12, color: "#6b7280" }}>
                    {m.createdAt ? formatIsraelDateTime(m.createdAt) : "—"}
                  </td>
                  <td style={{ padding: 10 }}>
                    {editing ? (
                      <div style={{ display: "flex", gap: 6 }}>
                        <button
                          type="button"
                          onClick={() => void saveEdit(m.id)}
                          style={{
                            padding: "6px 10px",
                            borderRadius: 8,
                            border: "none",
                            background: "#6d28d9",
                            color: "#fff",
                            fontWeight: 800,
                            cursor: "pointer",
                            fontSize: 12,
                          }}
                        >
                          שמור
                        </button>
                        <button
                          type="button"
                          onClick={() => setEditingId(null)}
                          style={{
                            padding: "6px 10px",
                            borderRadius: 8,
                            border: "1px solid #e5e7eb",
                            background: "#fff",
                            cursor: "pointer",
                            fontSize: 12,
                          }}
                        >
                          ביטול
                        </button>
                      </div>
                    ) : (
                      <div style={{ display: "flex", gap: 6 }}>
                        <button
                          type="button"
                          onClick={() => {
                            setEditingId(m.id);
                            setEditName(m.name);
                            setEditRole(m.role);
                          }}
                          style={{
                            padding: "6px 10px",
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
                        <button
                          type="button"
                          onClick={() => void removeMember(m.id)}
                          style={{
                            padding: "6px 10px",
                            borderRadius: 8,
                            border: "1px solid #fecaca",
                            background: "#fff",
                            color: "#b91c1c",
                            cursor: "pointer",
                            fontSize: 12,
                            fontWeight: 700,
                          }}
                        >
                          הסר
                        </button>
                      </div>
                    )}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}
