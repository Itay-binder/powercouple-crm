"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import SettingsSectionNav from "@/app/components/SettingsSectionNav";

type Row = { settlement: string; region: string };

export default function CityRegionsClient() {
  const [rows, setRows] = useState<Row[]>([]);
  const [source, setSource] = useState<"bundled" | "firestore" | null>(null);
  const [bundledCount, setBundledCount] = useState(0);
  const [q, setQ] = useState("");
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);
  const [err, setErr] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setErr(null);
    try {
      const res = await fetch("/api/settings/city-regions", { credentials: "include" });
      const data = (await res.json()) as {
        ok?: boolean;
        rows?: Row[];
        source?: "bundled" | "firestore";
        bundledRowCount?: number;
        error?: string;
      };
      if (!res.ok || !data.ok || !Array.isArray(data.rows)) {
        throw new Error(data.error ?? "טעינה נכשלה");
      }
      setRows(data.rows);
      setSource(data.source ?? "bundled");
      setBundledCount(data.bundledRowCount ?? 0);
    } catch (e) {
      setErr(e instanceof Error ? e.message : "שגיאה");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const filteredIndexed = useMemo(() => {
    const t = q.trim().toLowerCase().replace(/[\u0591-\u05C7]/g, "");
    return rows
      .map((r, i) => ({ r, i }))
      .filter(
        ({ r }) =>
          !t ||
          r.settlement.toLowerCase().includes(t) ||
          r.region.toLowerCase().includes(t)
      );
  }, [rows, q]);

  async function save() {
    setSaving(true);
    setMsg(null);
    setErr(null);
    try {
      const res = await fetch("/api/settings/city-regions", {
        method: "PATCH",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ rows }),
      });
      const data = (await res.json()) as { ok?: boolean; error?: string };
      if (!res.ok || !data.ok) throw new Error(data.error ?? "שמירה נכשלה");
      setMsg("נשמר בהצלחה");
      await load();
    } catch (e) {
      setErr(e instanceof Error ? e.message : "שגיאה");
    } finally {
      setSaving(false);
    }
  }

  async function resetBundled() {
    if (!window.confirm("למחוק את העדכונים ב-Firestore ולחזור לברירת המחדל מהמאגר?")) return;
    setSaving(true);
    setMsg(null);
    setErr(null);
    try {
      const res = await fetch("/api/settings/city-regions", {
        method: "DELETE",
        credentials: "include",
      });
      const data = (await res.json()) as { ok?: boolean; error?: string };
      if (!res.ok || !data.ok) throw new Error(data.error ?? "איפוס נכשל");
      setMsg("חזרה לברירת המחדל מהמאגר");
      await load();
    } catch (e) {
      setErr(e instanceof Error ? e.message : "שגיאה");
    } finally {
      setSaving(false);
    }
  }

  return (
    <>
      <SettingsSectionNav active="cityRegions" showMovingOrders />
      <div
        style={{
          maxWidth: 980,
          background: "#fff",
          borderRadius: 16,
          border: "1px solid #e5e7eb",
          padding: 22,
        }}
      >
        <h1 style={{ margin: "0 0 6px", fontSize: 22 }}>אזורי פעילות — ערים ויישובים</h1>
        <p style={{ margin: "0 0 16px", color: "#6b7280", fontSize: 14, lineHeight: 1.5 }}>
          מיפוי בין שם יישוב לרמת אזור הפעילות (גוש דן, השרון, צפון, דרום, שפלה, כל הארץ). ההתאמה
          ללקוחות משלמים נעשית לפי שדה אזורי המוביל מול הכתובות בהזמנה.
        </p>
        {source ? (
          <div style={{ marginBottom: 12, fontSize: 13, color: "#374151" }}>
            מקור נתונים:{" "}
            <strong>{source === "firestore" ? "עדכון בענן (Firestore)" : "ברירת מחדל מהמאגר"}</strong>
            {bundledCount ? (
              <span style={{ marginRight: 8, color: "#6b7280" }}>
                · {bundledCount} שורות בקובץ המובנה
              </span>
            ) : null}
            {rows.length ? (
              <span style={{ marginRight: 8, color: "#6b7280" }}>· {rows.length} שורות בטעינה</span>
            ) : null}
          </div>
        ) : null}
        {err ? (
          <div
            style={{
              marginBottom: 12,
              padding: 12,
              borderRadius: 10,
              background: "#fef2f2",
              border: "1px solid #fecaca",
              color: "#991b1b",
            }}
          >
            {err}
          </div>
        ) : null}
        {msg ? (
          <div
            style={{
              marginBottom: 12,
              padding: 12,
              borderRadius: 10,
              background: "#ecfdf5",
              border: "1px solid #a7f3d0",
              color: "#065f46",
            }}
          >
            {msg}
          </div>
        ) : null}
        <div style={{ display: "flex", flexWrap: "wrap", gap: 10, marginBottom: 14, alignItems: "center" }}>
          <input
            type="search"
            placeholder="חיפוש יישוב או אזור..."
            value={q}
            onChange={(e) => setQ(e.target.value)}
            disabled={loading}
            style={{
              flex: "1 1 220px",
              minWidth: 200,
              padding: "10px 12px",
              borderRadius: 10,
              border: "1px solid #d1d5db",
              fontSize: 14,
            }}
          />
          <button
            type="button"
            onClick={() => void save()}
            disabled={loading || saving || !rows.length}
            style={{
              padding: "10px 18px",
              borderRadius: 10,
              border: "none",
              fontWeight: 700,
              cursor: loading || saving ? "not-allowed" : "pointer",
              background: "linear-gradient(180deg, #a78bfa 0%, #6d28d9 100%)",
              color: "#fff",
            }}
          >
            {saving ? "שומר…" : "שמור שינויים"}
          </button>
          <button
            type="button"
            onClick={() => void resetBundled()}
            disabled={loading || saving || source !== "firestore"}
            style={{
              padding: "10px 14px",
              borderRadius: 10,
              border: "1px solid #d1d5db",
              background: "#f9fafb",
              fontWeight: 600,
              cursor: loading || saving || source !== "firestore" ? "not-allowed" : "pointer",
            }}
          >
            איפוס לברירת המחדל
          </button>
        </div>
        {loading ? (
          <div style={{ padding: 24, textAlign: "center", color: "#6b7280" }}>טוען…</div>
        ) : (
          <div
            style={{
              maxHeight: "62vh",
              overflow: "auto",
              border: "1px solid #e5e7eb",
              borderRadius: 12,
            }}
          >
            <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 13 }}>
              <thead>
                <tr style={{ background: "#f9fafb", position: "sticky", top: 0, zIndex: 1 }}>
                  <th style={{ textAlign: "right", padding: "10px 12px", borderBottom: "1px solid #e5e7eb" }}>
                    שם יישוב
                  </th>
                  <th style={{ textAlign: "right", padding: "10px 12px", borderBottom: "1px solid #e5e7eb" }}>
                    אזור פעילות
                  </th>
                </tr>
              </thead>
              <tbody>
                {filteredIndexed.slice(0, 4000).map(({ r, i }) => (
                  <tr key={`${i}-${r.settlement}`} style={{ borderBottom: "1px solid #f3f4f6" }}>
                    <td style={{ padding: "8px 12px", verticalAlign: "top" }}>{r.settlement}</td>
                    <td style={{ padding: "8px 12px", verticalAlign: "top" }}>
                      <input
                        value={r.region}
                        onChange={(e) => {
                          const v = e.target.value;
                          setRows((prev) => {
                            const next = [...prev];
                            if (next[i]) next[i] = { ...next[i], region: v };
                            return next;
                          });
                        }}
                        style={{
                          width: "100%",
                          minWidth: 140,
                          padding: "6px 8px",
                          borderRadius: 8,
                          border: "1px solid #e5e7eb",
                        }}
                      />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
            {filteredIndexed.length > 4000 ? (
              <div style={{ padding: 12, color: "#6b7280", fontSize: 12 }}>
                מוצגות 4000 שורות ראשונות מהסינון — צרו חיפוש צר יותר כדי לערוך שורות ספציפיות.
              </div>
            ) : null}
          </div>
        )}
      </div>
    </>
  );
}
