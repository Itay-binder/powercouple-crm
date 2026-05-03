"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { formatIsraelDateTime } from "@/lib/datetime/formatIsrael";

type ContactRow = {
  id: string;
  name: string;
  email: string;
  phone: string;
  status: string;
  marketingApproved: boolean;
  marketingReason: string;
  marketingUpdatedAt: string;
  canManageMarketing: boolean;
};

async function parseJson<T>(res: Response): Promise<T> {
  return (await res.json().catch(() => ({}))) as T;
}

export default function MarketingStatusClient() {
  const [loading, setLoading] = useState(true);
  const [savingId, setSavingId] = useState("");
  const [err, setErr] = useState<string | null>(null);
  const [query, setQuery] = useState("");
  const [rows, setRows] = useState<ContactRow[]>([]);

  const load = useCallback(async () => {
    setLoading(true);
    setErr(null);
    try {
      const res = await fetch("/api/whatsapp/marketing-status", {
        credentials: "include",
        cache: "no-store",
      });
      if (res.status === 401) {
        window.location.href = `/login?returnTo=${encodeURIComponent("/whatsapp-automations/marketing-status")}`;
        return;
      }
      const j = await parseJson<{ ok?: boolean; contacts?: ContactRow[]; error?: string }>(res);
      if (!res.ok || !j.ok) throw new Error(j.error || "טעינת אנשי קשר נכשלה");
      setRows(j.contacts ?? []);
    } catch (e) {
      setErr(e instanceof Error ? e.message : "שגיאה");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return rows;
    const qDigits = q.replace(/\D/g, "");
    return rows.filter((r) => {
      const byText =
        r.name.toLowerCase().includes(q) ||
        r.email.toLowerCase().includes(q) ||
        r.id.toLowerCase().includes(q);
      const byPhone = qDigits ? r.phone.replace(/\D/g, "").includes(qDigits) : false;
      return byText || byPhone;
    });
  }, [rows, query]);

  async function toggleRow(row: ContactRow) {
    if (!row.canManageMarketing || savingId) return;
    const next = !row.marketingApproved;
    if (next) {
      const ok = window.confirm(
        'האם להפעיל מחדש דיוור שיווקי לאיש הקשר? ודאו שיש בסיס חוקי מתאים (גם אם בעבר שלח "הסר").'
      );
      if (!ok) return;
    }
    setSavingId(row.id);
    setErr(null);
    try {
      const res = await fetch("/api/whatsapp/marketing-status", {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ leadId: row.id, marketingApproved: next }),
      });
      const j = await parseJson<{ ok?: boolean; error?: string; updatedLeadIds?: string[] }>(res);
      if (!res.ok || !j.ok) throw new Error(j.error || "עדכון נכשל");
      const updated = new Set((j.updatedLeadIds ?? []).map((x) => String(x).trim()));
      const nowIso = new Date().toISOString();
      setRows((prev) =>
        prev.map((x) =>
          updated.has(x.id)
            ? {
                ...x,
                marketingApproved: next,
                marketingReason: next ? "" : "manual_wa_marketing_tab_off",
                marketingUpdatedAt: nowIso,
              }
            : x
        )
      );
    } catch (e) {
      setErr(e instanceof Error ? e.message : "עדכון נכשל");
    } finally {
      setSavingId("");
    }
  }

  return (
    <div>
      <div style={{ display: "flex", gap: 10, alignItems: "center", marginBottom: 14, flexWrap: "wrap" }}>
        <input
          type="search"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="חיפוש לפי שם, טלפון, אימייל או מזהה..."
          style={{
            minWidth: 280,
            flex: "1 1 320px",
            border: "1px solid #d1d5db",
            borderRadius: 10,
            padding: "10px 12px",
            fontSize: 14,
            outline: "none",
          }}
        />
        <button
          type="button"
          onClick={() => void load()}
          style={{
            border: "1px solid #e5e7eb",
            background: "#fff",
            borderRadius: 10,
            padding: "10px 14px",
            fontWeight: 700,
            cursor: "pointer",
          }}
        >
          רענן
        </button>
      </div>

      {err ? (
        <div style={{ marginBottom: 12, padding: 12, borderRadius: 10, background: "#fef2f2", color: "#991b1b" }}>
          {err}
        </div>
      ) : null}

      <div style={{ background: "#fff", border: "1px solid #e5e7eb", borderRadius: 14, overflow: "hidden" }}>
        <div style={{ padding: "14px 16px", borderBottom: "1px solid #f3f4f6", fontWeight: 900, fontSize: 16 }}>
          אנשי קשר ({filtered.length})
        </div>
        <div style={{ overflowX: "auto" }}>
          <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 14 }}>
            <thead>
              <tr>
                <th style={th}>איש קשר</th>
                <th style={th}>טלפון</th>
                <th style={th}>אימייל</th>
                <th style={th}>סטטוס מכירה</th>
                <th style={th}>דיוור WhatsApp</th>
                <th style={th}>עודכן לאחרונה</th>
                <th style={th}>סיבה</th>
                <th style={th}>פעולה</th>
              </tr>
            </thead>
            <tbody>
              {loading ? (
                <tr>
                  <td colSpan={8} style={{ ...td, color: "#6b7280" }}>
                    טוען...
                  </td>
                </tr>
              ) : filtered.length === 0 ? (
                <tr>
                  <td colSpan={8} style={{ ...td, color: "#6b7280" }}>
                    לא נמצאו אנשי קשר תואמים.
                  </td>
                </tr>
              ) : (
                filtered.map((r) => {
                  const saving = savingId === r.id;
                  return (
                    <tr key={r.id}>
                      <td style={td}>
                        <div style={{ fontWeight: 700 }}>{r.name || "ללא שם"}</div>
                        <div style={{ color: "#9ca3af", fontSize: 12 }} dir="ltr">
                          {r.id}
                        </div>
                      </td>
                      <td style={td} dir="ltr">
                        {r.phone || "—"}
                      </td>
                      <td style={td} dir="ltr">
                        {r.email || "—"}
                      </td>
                      <td style={td}>{r.status || "—"}</td>
                      <td style={{ ...td, fontWeight: 700, color: r.marketingApproved ? "#065f46" : "#b45309" }}>
                        {r.marketingApproved ? "פעיל" : "לא פעיל"}
                      </td>
                      <td style={{ ...td, fontSize: 12 }} dir="ltr">
                        {r.marketingUpdatedAt ? formatIsraelDateTime(r.marketingUpdatedAt) : "—"}
                      </td>
                      <td style={{ ...td, color: "#6b7280", fontSize: 12 }}>{r.marketingReason || "—"}</td>
                      <td style={td}>
                        <button
                          type="button"
                          disabled={!r.canManageMarketing || Boolean(savingId)}
                          onClick={() => void toggleRow(r)}
                          style={{
                            border: "none",
                            borderRadius: 999,
                            padding: "6px 12px",
                            fontSize: 12,
                            fontWeight: 700,
                            cursor: !r.canManageMarketing || Boolean(savingId) ? "not-allowed" : "pointer",
                            background: r.marketingApproved ? "#dcfce7" : "#ffedd5",
                            color: r.marketingApproved ? "#166534" : "#9a3412",
                            opacity: !r.canManageMarketing || Boolean(savingId) ? 0.6 : 1,
                          }}
                        >
                          {saving ? "שומר..." : r.marketingApproved ? "כבה דיוור" : "הפעל דיוור"}
                        </button>
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}

const th = {
  textAlign: "right" as const,
  padding: "10px 8px",
  borderBottom: "2px solid #e5e7eb",
  color: "#6b7280",
  fontWeight: 800,
  whiteSpace: "nowrap" as const,
};

const td = {
  padding: "10px 8px",
  borderBottom: "1px solid #f3f4f6",
  verticalAlign: "top" as const,
};
