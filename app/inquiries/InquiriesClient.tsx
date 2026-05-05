"use client";

import { useEffect, useMemo, useState } from "react";

type Inquiry = {
  id: string;
  content: string;
  responseDraft?: string;
  reminderAt?: string;
  makeTask?: boolean;
  contactId?: string;
  contactName?: string;
  taskId?: string;
  status: "open" | "scheduled" | "answered";
};

type ContactRow = {
  id: string;
  name: string;
  email: string;
  phone: string;
};

export default function InquiriesClient() {
  const [rows, setRows] = useState<Inquiry[]>([]);
  const [contacts, setContacts] = useState<ContactRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [createOpen, setCreateOpen] = useState(false);

  const [content, setContent] = useState("");
  const [responseDraft, setResponseDraft] = useState("");
  const [reminderAt, setReminderAt] = useState("");
  const [makeTask, setMakeTask] = useState(false);
  const [contactId, setContactId] = useState("");

  const contactNameById = useMemo(() => new Map(contacts.map((c) => [c.id, c.name || c.email || c.phone || c.id])), [contacts]);

  async function load() {
    setLoading(true);
    setErr(null);
    try {
      const [ires, cres] = await Promise.all([
        fetch("/api/inquiries", { credentials: "include", cache: "no-store" }),
        fetch("/api/contacts", { credentials: "include", cache: "no-store" }),
      ]);
      const ij = (await ires.json().catch(() => ({}))) as { ok?: boolean; inquiries?: Inquiry[]; error?: string };
      if (!ires.ok || !ij.ok) throw new Error(ij.error ?? "טעינת פניות נכשלה");
      setRows(ij.inquiries ?? []);

      const cj = (await cres.json().catch(() => ({}))) as {
        ok?: boolean;
        rows?: Array<{ id?: string; name?: string; email?: string; phone?: string }>;
      };
      if (cres.ok && cj.ok) {
        setContacts(
          (cj.rows ?? []).map((r) => ({
            id: String(r.id ?? ""),
            name: String(r.name ?? ""),
            email: String(r.email ?? ""),
            phone: String(r.phone ?? ""),
          }))
        );
      }
    } catch (e) {
      setErr(e instanceof Error ? e.message : "שגיאה");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    void load();
  }, []);

  async function createInquiry() {
    if (!content.trim()) return;
    setSaving(true);
    setErr(null);
    try {
      const selectedName = contactId ? contactNameById.get(contactId) ?? "" : "";
      const res = await fetch("/api/inquiries", {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          content,
          responseDraft,
          reminderAt,
          makeTask,
          contactId: contactId || undefined,
          contactName: selectedName || undefined,
        }),
      });
      const j = (await res.json().catch(() => ({}))) as { ok?: boolean; error?: string };
      if (!res.ok || !j.ok) throw new Error(j.error ?? "יצירת פנייה נכשלה");
      setCreateOpen(false);
      setContent("");
      setResponseDraft("");
      setReminderAt("");
      setMakeTask(false);
      setContactId("");
      await load();
    } catch (e) {
      setErr(e instanceof Error ? e.message : "שגיאה");
    } finally {
      setSaving(false);
    }
  }

  return (
    <div style={{ width: "100%", maxWidth: "100%", minWidth: 0 }}>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 12, marginBottom: 12 }}>
        <h1 style={{ margin: 0, fontSize: 28, fontWeight: 900 }}>פניות מלקוחות</h1>
        <button
          type="button"
          onClick={() => setCreateOpen((x) => !x)}
          style={{ border: "none", borderRadius: 12, padding: "10px 16px", fontWeight: 800, cursor: "pointer", background: "linear-gradient(180deg, #a78bfa 0%, #6d28d9 100%)", color: "#fff" }}
        >
          + הוסף פנייה
        </button>
      </div>

      {err ? (
        <div style={{ marginBottom: 12, background: "#fef2f2", border: "1px solid #fecaca", color: "#b91c1c", padding: 12, borderRadius: 12 }}>
          {err}
        </div>
      ) : null}

      {createOpen ? (
        <section style={{ marginBottom: 14, background: "#fff", border: "1px solid #e5e7eb", borderRadius: 14, padding: 16, maxWidth: 760 }}>
          <div style={{ fontWeight: 900, marginBottom: 10 }}>פנייה חדשה</div>
          <div style={{ display: "grid", gap: 10 }}>
            <textarea
              value={content}
              onChange={(e) => setContent(e.target.value)}
              placeholder="תוכן הפנייה"
              rows={4}
              style={{ width: "100%", padding: "10px 12px", borderRadius: 10, border: "1px solid #e5e7eb", fontFamily: "inherit" }}
            />
            <textarea
              value={responseDraft}
              onChange={(e) => setResponseDraft(e.target.value)}
              placeholder="טיוטת תשובה לפנייה"
              rows={3}
              style={{ width: "100%", padding: "10px 12px", borderRadius: 10, border: "1px solid #e5e7eb", fontFamily: "inherit" }}
            />
            <label style={{ display: "grid", gap: 4 }}>
              <span style={{ fontSize: 12, fontWeight: 700, color: "#6b7280" }}>תזכורת לשליחת תשובה</span>
              <input
                type="datetime-local"
                value={reminderAt}
                onChange={(e) => setReminderAt(e.target.value)}
                style={{ padding: "10px 12px", borderRadius: 10, border: "1px solid #e5e7eb" }}
              />
            </label>
            <label style={{ display: "grid", gap: 4 }}>
              <span style={{ fontSize: 12, fontWeight: 700, color: "#6b7280" }}>שייך ללקוח</span>
              <select
                value={contactId}
                onChange={(e) => setContactId(e.target.value)}
                style={{ padding: "10px 12px", borderRadius: 10, border: "1px solid #e5e7eb" }}
              >
                <option value="">ללא שיוך</option>
                {contacts.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.name || c.email || c.phone || c.id}
                  </option>
                ))}
              </select>
            </label>
            <label style={{ display: "flex", alignItems: "center", gap: 8, fontWeight: 700 }}>
              <input type="checkbox" checked={makeTask} onChange={(e) => setMakeTask(e.target.checked)} />
              להפוך למשימה (בלוח משימות)
            </label>
            <div style={{ display: "flex", gap: 8 }}>
              <button
                type="button"
                onClick={() => void createInquiry()}
                disabled={saving || !content.trim()}
                style={{ padding: "9px 12px", borderRadius: 10, border: "none", background: "#6d28d9", color: "#fff", fontWeight: 800, cursor: "pointer" }}
              >
                {saving ? "שומר…" : "שמור פנייה"}
              </button>
              <button
                type="button"
                onClick={() => setCreateOpen(false)}
                style={{ padding: "9px 12px", borderRadius: 10, border: "1px solid #e5e7eb", background: "#fff", cursor: "pointer" }}
              >
                ביטול
              </button>
            </div>
          </div>
        </section>
      ) : null}

      <section style={{ background: "#fff", border: "1px solid #e5e7eb", borderRadius: 14, overflow: "hidden" }}>
        <div style={{ overflowX: "auto" }}>
          <table style={{ width: "100%", minWidth: 1100, borderCollapse: "collapse" }}>
            <thead>
              <tr style={{ background: "#f8fafc" }}>
                {["תוכן פנייה", "טיוטת תשובה", "תזכורת", "משימה", "לקוח", "סטטוס"].map((h) => (
                  <th key={h} style={{ textAlign: "right", padding: "12px 14px", fontSize: 12, fontWeight: 900, borderBottom: "2px solid #e5e7eb" }}>
                    {h}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {loading ? (
                <tr>
                  <td colSpan={6} style={{ padding: 20, color: "#6b7280" }}>
                    טוען…
                  </td>
                </tr>
              ) : rows.length === 0 ? (
                <tr>
                  <td colSpan={6} style={{ padding: 20, color: "#6b7280" }}>
                    אין פניות עדיין.
                  </td>
                </tr>
              ) : (
                rows.map((r) => (
                  <tr key={r.id} style={{ borderBottom: "1px solid #f3f4f6" }}>
                    <td style={{ padding: "12px 14px", maxWidth: 300 }}>{r.content}</td>
                    <td style={{ padding: "12px 14px", maxWidth: 300 }}>{r.responseDraft?.trim() || "—"}</td>
                    <td style={{ padding: "12px 14px" }}>{r.reminderAt || "—"}</td>
                    <td style={{ padding: "12px 14px" }}>{r.makeTask ? "כן" : "לא"}</td>
                    <td style={{ padding: "12px 14px" }}>
                      {r.contactId ? (
                        <a href={`/contacts/${encodeURIComponent(r.contactId)}`} style={{ color: "#2563eb", fontWeight: 700 }}>
                          {r.contactName || r.contactId}
                        </a>
                      ) : (
                        "—"
                      )}
                    </td>
                    <td style={{ padding: "12px 14px" }}>
                      {r.status === "scheduled" ? "מתוזמן" : r.status === "answered" ? "נענה" : "פתוח"}
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </section>
    </div>
  );
}

