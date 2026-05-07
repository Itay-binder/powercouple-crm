"use client";

import { useCallback, useEffect, useState } from "react";
import SettingsSectionNav from "@/app/components/SettingsSectionNav";

type TeamUser = {
  id: string;
  email: string;
  name?: string;
  role: "admin" | "user";
  approved: boolean;
};

export default function TeamSettingsClient({ showMovingOrders }: { showMovingOrders?: boolean }) {
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [ok, setOk] = useState<string | null>(null);
  const [users, setUsers] = useState<TeamUser[]>([]);
  const [email, setEmail] = useState("");
  const [name, setName] = useState("");
  const [role, setRole] = useState<"admin" | "user">("user");
  const [approved, setApproved] = useState(true);

  const load = useCallback(async () => {
    setLoading(true);
    setErr(null);
    try {
      const res = await fetch("/api/settings/team", { credentials: "include", cache: "no-store" });
      const j = (await res.json().catch(() => ({}))) as { ok?: boolean; users?: TeamUser[]; error?: string };
      if (!res.ok || !j.ok) throw new Error(j.error ?? "טעינת צוות נכשלה");
      setUsers(j.users ?? []);
    } catch (e) {
      setErr(e instanceof Error ? e.message : "טעינה נכשלה");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  async function saveMember() {
    setSaving(true);
    setErr(null);
    setOk(null);
    try {
      const res = await fetch("/api/settings/team", {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email, name, role, approved }),
      });
      const j = (await res.json().catch(() => ({}))) as { ok?: boolean; error?: string };
      if (!res.ok || !j.ok) throw new Error(j.error ?? "שמירה נכשלה");
      setEmail("");
      setName("");
      setRole("user");
      setApproved(true);
      await load();
      setOk("המשתמש נשמר בהצלחה.");
    } catch (e) {
      setErr(e instanceof Error ? e.message : "שמירה נכשלה");
    } finally {
      setSaving(false);
    }
  }

  return (
    <div style={{ maxWidth: 900 }}>
      <SettingsSectionNav active="team" showMovingOrders={showMovingOrders} />
      <div style={{ background: "#fff", border: "1px solid #e5e7eb", borderRadius: 16, padding: 16 }}>
        <h1 style={{ margin: "0 0 10px", fontSize: 22 }}>ניהול צוות</h1>
        <p style={{ margin: "0 0 14px", color: "#4b5563", lineHeight: 1.55 }}>
          ניהול משתמשי הצוות והרשאות מערכת (מנהל/משתמש), כולל אישור כניסה למערכת.
        </p>
        {err ? <div style={{ marginBottom: 10, padding: 10, borderRadius: 10, background: "#fef2f2", color: "#991b1b" }}>{err}</div> : null}
        {ok ? <div style={{ marginBottom: 10, padding: 10, borderRadius: 10, background: "#ecfdf5", color: "#065f46" }}>{ok}</div> : null}
        <div style={{ display: "grid", gap: 10, marginBottom: 14 }}>
          <input value={email} onChange={(e) => setEmail(e.target.value)} placeholder="אימייל משתמש" style={{ padding: "10px 12px", borderRadius: 10, border: "1px solid #e5e7eb" }} />
          <input value={name} onChange={(e) => setName(e.target.value)} placeholder="שם (אופציונלי)" style={{ padding: "10px 12px", borderRadius: 10, border: "1px solid #e5e7eb" }} />
          <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
            <select value={role} onChange={(e) => setRole(e.target.value === "admin" ? "admin" : "user")} style={{ padding: "10px 12px", borderRadius: 10, border: "1px solid #e5e7eb" }}>
              <option value="user">משתמש</option>
              <option value="admin">מנהל</option>
            </select>
            <label style={{ display: "flex", alignItems: "center", gap: 6, fontWeight: 700 }}>
              <input type="checkbox" checked={approved} onChange={(e) => setApproved(e.target.checked)} />
              מאושר כניסה
            </label>
          </div>
          <button type="button" onClick={() => void saveMember()} disabled={saving || !email.trim()} style={{ border: "none", borderRadius: 10, padding: "10px 14px", background: "#6d28d9", color: "#fff", fontWeight: 800, cursor: "pointer", width: "fit-content" }}>
            {saving ? "שומר…" : "שמור משתמש"}
          </button>
        </div>
        <div style={{ borderTop: "1px solid #f3f4f6", paddingTop: 12 }}>
          <div style={{ fontWeight: 800, marginBottom: 8 }}>צוות קיים</div>
          {loading ? <div style={{ color: "#6b7280" }}>טוען…</div> : null}
          {!loading && users.length === 0 ? <div style={{ color: "#9ca3af" }}>אין משתמשים להצגה.</div> : null}
          <div style={{ display: "grid", gap: 8 }}>
            {users.map((u) => (
              <div key={u.id} style={{ border: "1px solid #e5e7eb", borderRadius: 10, padding: "8px 10px", display: "grid", gap: 4 }}>
                <div style={{ fontWeight: 800 }}>{u.name || u.email}</div>
                <div style={{ fontSize: 12, color: "#6b7280" }} dir="ltr">{u.email}</div>
                <div style={{ fontSize: 12 }}>
                  תפקיד: {u.role === "admin" ? "מנהל" : "משתמש"} · סטטוס: {u.approved ? "מאושר" : "ממתין"}
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}

