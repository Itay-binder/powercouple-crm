"use client";

import Link from "next/link";
import { useEffect, useState } from "react";

type Deal = {
  id: string;
  name: string;
  clientCount?: number;
  dealType?: string;
  city?: string;
  fullAddress?: string;
  linkedContactIds: string[];
  status?: string;
  notes?: string;
};

const STATUS_OPTS = ["בהתאמה", "נחתם", "סיום רכישה", "נמכר"];

export default function DealsClient() {
  const [deals, setDeals] = useState<Deal[]>([]);
  const [err, setErr] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [createOpen, setCreateOpen] = useState(false);
  const [draftName, setDraftName] = useState("");
  const [saving, setSaving] = useState(false);

  async function load() {
    setLoading(true);
    setErr(null);
    try {
      const res = await fetch("/api/deals", { credentials: "include", cache: "no-store" });
      const j = (await res.json().catch(() => ({}))) as { ok?: boolean; deals?: Deal[]; error?: string };
      if (!res.ok || !j.ok) throw new Error(j.error ?? "טעינה נכשלה");
      setDeals(j.deals ?? []);
    } catch (e) {
      setErr(e instanceof Error ? e.message : "שגיאה");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    void load();
  }, []);

  async function createDeal() {
    const name = draftName.trim();
    if (!name) return;
    setSaving(true);
    setErr(null);
    try {
      const res = await fetch("/api/deals", {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name, status: "בהתאמה" }),
      });
      const j = (await res.json().catch(() => ({}))) as { ok?: boolean; error?: string };
      if (!res.ok || !j.ok) throw new Error(j.error ?? "יצירה נכשלה");
      setCreateOpen(false);
      setDraftName("");
      await load();
    } catch (e) {
      setErr(e instanceof Error ? e.message : "שגיאה");
    } finally {
      setSaving(false);
    }
  }

  return (
    <div>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: 12, flexWrap: "wrap" }}>
        <div>
          <h1 style={{ margin: 0, fontSize: 22, fontWeight: 900 }}>עסקאות נדל״ן</h1>
          <p style={{ margin: "8px 0 0", color: "#6b7280", fontSize: 14, maxWidth: 640, lineHeight: 1.5 }}>
            ניהול עסקאות, קישור לאנשי קשר ומסמכים. לחיצה על שורה פותחת מסך עסקה מפורט.
          </p>
        </div>
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

      {err && (
        <div style={{ marginTop: 14, background: "#fef2f2", border: "1px solid #fecaca", color: "#b91c1c", padding: 12, borderRadius: 12 }}>
          {err}
        </div>
      )}

      {createOpen && (
        <div style={{ marginTop: 16, padding: 16, background: "#fff", border: "1px solid #e5e7eb", borderRadius: 14, maxWidth: 480 }}>
          <div style={{ fontWeight: 800, marginBottom: 8 }}>שם העסקה</div>
          <input
            value={draftName}
            onChange={(e) => setDraftName(e.target.value)}
            placeholder="למשל: פרויקט הרצליה"
            style={{ width: "100%", padding: "10px 12px", borderRadius: 10, border: "1px solid #e5e7eb", marginBottom: 12 }}
          />
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

      <div style={{ marginTop: 18, background: "#fff", border: "1px solid #e5e7eb", borderRadius: 14, overflow: "hidden" }}>
        <div style={{ overflowX: "auto" }}>
          <table style={{ width: "100%", minWidth: 960, borderCollapse: "collapse" }}>
            <thead>
              <tr style={{ background: "#f8fafc" }}>
                {["שם העסקה", "לקוחות", "סוג", "עיר", "כתובת", "סטטוס", "פעולות"].map((h) => (
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
              ) : deals.length === 0 ? (
                <tr>
                  <td colSpan={7} style={{ padding: 20, color: "#6b7280" }}>
                    אין עסקאות עדיין.
                  </td>
                </tr>
              ) : (
                deals.map((d) => (
                  <tr key={d.id} style={{ borderBottom: "1px solid #f3f4f6" }}>
                    <td style={{ padding: "12px 14px", fontWeight: 800 }}>
                      <Link href={`/deals/${encodeURIComponent(d.id)}`} style={{ color: "#4c1d95" }}>
                        {d.name}
                      </Link>
                    </td>
                    <td style={{ padding: "12px 14px" }}>{d.linkedContactIds?.length ?? d.clientCount ?? 0}</td>
                    <td style={{ padding: "12px 14px" }}>{d.dealType ?? "—"}</td>
                    <td style={{ padding: "12px 14px" }}>{d.city ?? "—"}</td>
                    <td style={{ padding: "12px 14px", maxWidth: 220 }}>{d.fullAddress ?? "—"}</td>
                    <td style={{ padding: "12px 14px" }}>{d.status ?? "—"}</td>
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

      <div style={{ marginTop: 12, fontSize: 12, color: "#9ca3af" }}>
        סטטוסים מומלצים: {STATUS_OPTS.join(" · ")}
      </div>
    </div>
  );
}
