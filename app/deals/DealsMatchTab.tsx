"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import type { BoardDeal } from "@/app/deals/DealsBoardTab";

type ContactRow = {
  id: string;
  name: string;
  email: string;
  phone: string;
};

type Props = {
  deals: BoardDeal[];
  dealsLoading: boolean;
};

export default function DealsMatchTab({ deals, dealsLoading }: Props) {
  const [selectedId, setSelectedId] = useState<string>("");
  const [contacts, setContacts] = useState<ContactRow[]>([]);
  const [contactsLoading, setContactsLoading] = useState(true);
  const [err, setErr] = useState<string | null>(null);

  const sortedDeals = useMemo(
    () => [...deals].sort((a, b) => a.name.localeCompare(b.name, "he")),
    [deals]
  );

  useEffect(() => {
    if (!selectedId && sortedDeals[0]) setSelectedId(sortedDeals[0].id);
  }, [sortedDeals, selectedId]);

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      setContactsLoading(true);
      setErr(null);
      try {
        const res = await fetch("/api/contacts", { credentials: "include", cache: "no-store" });
        const j = (await res.json()) as {
          ok?: boolean;
          rows?: Record<string, string>[];
          error?: string;
        };
        if (!res.ok || !j.ok) throw new Error(j.error ?? "טעינת אנשי קשר נכשלה");
        const rows = j.rows ?? [];
        if (cancelled) return;
        setContacts(
          rows.map((r) => ({
            id: String(r.id ?? ""),
            name: String(r.name ?? ""),
            email: String(r.email ?? ""),
            phone: String(r.phone ?? ""),
          }))
        );
      } catch (e) {
        if (!cancelled) setErr(e instanceof Error ? e.message : "שגיאה");
      } finally {
        if (!cancelled) setContactsLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  const selected = sortedDeals.find((d) => d.id === selectedId) ?? null;

  return (
    <div style={{ display: "grid", gap: 16 }}>
      <p style={{ margin: 0, color: "#4b5563", fontSize: 14, lineHeight: 1.55 }}>
        בוחרים עסקה ומקבלים את רשימת אנשי הקשר במערכת שיכולים להתאים אליה. כרגע מוצגים{" "}
        <strong>כל</strong> אנשי הקשר — לוגיקת סינון והתאמה תוגדר בהמשך (כמו בהתאמת הזמנות ב־Liftygo).
      </p>

      <div
        style={{
          padding: 16,
          borderRadius: 14,
          border: "1px solid #e5e7eb",
          background: "#fff",
          display: "grid",
          gap: 12,
        }}
      >
        <div style={{ fontWeight: 900 }}>בחר עסקה</div>
        {dealsLoading ? (
          <div style={{ color: "#6b7280" }}>טוען עסקאות…</div>
        ) : sortedDeals.length === 0 ? (
          <div style={{ color: "#6b7280" }}>אין עסקאות — צרו עסקה בלשונית «עסקאות».</div>
        ) : (
          <select
            value={selectedId}
            onChange={(e) => setSelectedId(e.target.value)}
            style={{ padding: "10px 12px", borderRadius: 10, border: "1px solid #e5e7eb", maxWidth: 480 }}
          >
            {sortedDeals.map((d) => (
              <option key={d.id} value={d.id}>
                {d.name}
              </option>
            ))}
          </select>
        )}
        {selected ? (
          <div style={{ fontSize: 13, color: "#374151", lineHeight: 1.5 }}>
            <div>
              <strong>עיר:</strong> {selected.city ?? "—"} · <strong>סטטוס:</strong> {selected.status ?? "—"}
            </div>
            <Link href={`/deals/${encodeURIComponent(selected.id)}`} style={{ color: "#6d28d9", fontWeight: 800 }}>
              פתיחת כרטיס עסקה
            </Link>
          </div>
        ) : null}
      </div>

      {err ? (
        <div style={{ padding: 12, borderRadius: 10, background: "#fef2f2", color: "#991b1b" }}>{err}</div>
      ) : null}

      <div style={{ border: "1px solid #e5e7eb", borderRadius: 14, background: "#fff", overflow: "hidden" }}>
        <div style={{ padding: "12px 14px", borderBottom: "1px solid #f3f4f6", fontWeight: 900 }}>
          לקוחות פוטנציאליים להתאמה ({contactsLoading ? "…" : contacts.length})
        </div>
        <div style={{ overflowX: "auto" }}>
          <table style={{ width: "100%", minWidth: 720, borderCollapse: "collapse" }}>
            <thead>
              <tr style={{ background: "#f8fafc" }}>
                {["שם", "טלפון", "אימייל", "פעולות"].map((h) => (
                  <th key={h} style={{ textAlign: "right", padding: "10px 12px", fontSize: 12, fontWeight: 900 }}>
                    {h}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {contactsLoading ? (
                <tr>
                  <td colSpan={4} style={{ padding: 16, color: "#6b7280" }}>
                    טוען אנשי קשר…
                  </td>
                </tr>
              ) : contacts.length === 0 ? (
                <tr>
                  <td colSpan={4} style={{ padding: 16, color: "#6b7280" }}>
                    אין אנשי קשר.
                  </td>
                </tr>
              ) : (
                contacts.map((c) => (
                  <tr key={c.id} style={{ borderBottom: "1px solid #f3f4f6" }}>
                    <td style={{ padding: "10px 12px", fontWeight: 700 }}>{c.name || "—"}</td>
                    <td style={{ padding: "10px 12px" }}>{c.phone || "—"}</td>
                    <td style={{ padding: "10px 12px", wordBreak: "break-all" }}>{c.email || "—"}</td>
                    <td style={{ padding: "10px 12px" }}>
                      <Link href={`/contacts/${encodeURIComponent(c.id)}`} style={{ color: "#2563eb", fontWeight: 700 }}>
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
