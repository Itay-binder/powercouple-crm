"use client";

import { useCallback, useEffect, useState, type CSSProperties } from "react";
import Link from "next/link";
import { formatIsraelDateTime } from "@/lib/datetime/formatIsrael";

type DraftRow = {
  id: string;
  name: string;
  templateId: string;
  updatedAt: string;
};

type CampaignDispatchRow = {
  contactId: string;
  contactName: string;
  to: string;
  status: "sent" | "failed";
  messageId?: string;
  error?: string;
  deliveredAt?: string;
  readAt?: string;
  interactions?: Array<{ kind: string; text: string; payload?: string; at: string }>;
};

type CampaignRow = {
  id: string;
  broadcastName?: string;
  templateId: string;
  parameterValues: string[];
  templateName: string;
  recipientCount: number;
  sentCount: number;
  failedCount: number;
  createdBy: string;
  createdAt: string;
  dispatches?: CampaignDispatchRow[];
};

type ModalState = { title: string; rows: CampaignDispatchRow[] } | null;

async function parseJson<T>(res: Response): Promise<T> {
  return (await res.json().catch(() => ({}))) as T;
}

function countDelivered(dispatches: CampaignDispatchRow[] | undefined): number {
  const d = dispatches ?? [];
  return d.filter((x) => x.status === "sent" && (Boolean(x.deliveredAt) || Boolean(x.readAt))).length;
}

function countRead(dispatches: CampaignDispatchRow[] | undefined): number {
  const d = dispatches ?? [];
  return d.filter((x) => Boolean(x.readAt)).length;
}

function countWithInteractions(dispatches: CampaignDispatchRow[] | undefined): number {
  const d = dispatches ?? [];
  return d.filter((x) => (x.interactions?.length ?? 0) > 0).length;
}

function countBtnStyle(disabled: boolean): CSSProperties {
  return {
    border: "none",
    background: "transparent",
    cursor: disabled ? "default" : "pointer",
    padding: 0,
    font: "inherit",
    fontWeight: 800,
    color: disabled ? "#9ca3af" : "#2563eb",
    textDecoration: disabled ? "none" : "underline",
  };
}

export default function BroadcastsHomeClient() {
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState<string | null>(null);
  const [drafts, setDrafts] = useState<DraftRow[]>([]);
  const [campaigns, setCampaigns] = useState<CampaignRow[]>([]);
  const [modal, setModal] = useState<ModalState>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setErr(null);
    try {
      const [dRes, cRes] = await Promise.all([
        fetch("/api/whatsapp/broadcasts/drafts", { credentials: "include", cache: "no-store" }),
        fetch("/api/whatsapp/campaigns/send", { credentials: "include", cache: "no-store" }),
      ]);
      if (dRes.status === 401) {
        window.location.href = `/login?returnTo=${encodeURIComponent("/whatsapp-automations")}`;
        return;
      }
      const dj = await parseJson<{ ok?: boolean; drafts?: DraftRow[]; error?: string }>(dRes);
      const cj = await parseJson<{ ok?: boolean; campaigns?: CampaignRow[]; error?: string }>(cRes);
      if (!dj.ok) throw new Error(dj.error || "טעינת טיוטות נכשלה");
      if (!cj.ok) throw new Error(cj.error || "טעינת היסטוריה נכשלה");
      setDrafts(dj.drafts ?? []);
      setCampaigns(cj.campaigns ?? []);
    } catch (e) {
      setErr(e instanceof Error ? e.message : "שגיאה");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  async function removeDraft(id: string) {
    if (!window.confirm("למחוק את הטיוטה?")) return;
    try {
      const res = await fetch(`/api/whatsapp/broadcasts/drafts/${encodeURIComponent(id)}`, {
        method: "DELETE",
        credentials: "include",
      });
      const j = await parseJson<{ ok?: boolean; error?: string }>(res);
      if (!res.ok || !j.ok) throw new Error(j.error || "מחיקה נכשלה");
      await load();
    } catch (e) {
      setErr(e instanceof Error ? e.message : "מחיקה נכשלה");
    }
  }

  const tableStyle = { width: "100%", borderCollapse: "collapse" as const, fontSize: 14 };
  const th = { textAlign: "right" as const, padding: "10px 8px", borderBottom: "2px solid #e5e7eb", color: "#6b7280", fontWeight: 800 };
  const td = { padding: "12px 8px", borderBottom: "1px solid #f3f4f6", verticalAlign: "top" as const };

  return (
    <div>
      <div style={{ display: "flex", flexWrap: "wrap", gap: 10, alignItems: "center", marginBottom: 18 }}>
        <Link
          href="/whatsapp-automations/broadcasts/new"
          style={{
            padding: "10px 18px",
            borderRadius: 10,
            background: "#2563eb",
            color: "#fff",
            fontWeight: 800,
            textDecoration: "none",
            fontSize: 14,
          }}
        >
          + ברודקאסט חדש
        </Link>
        <Link
          href="/whatsapp-automations/templates"
          style={{
            padding: "10px 18px",
            borderRadius: 10,
            border: "1px solid #cbd5e1",
            background: "#fff",
            color: "#1e40af",
            fontWeight: 700,
            textDecoration: "none",
            fontSize: 14,
          }}
        >
          כל התבניות
        </Link>
        <button
          type="button"
          onClick={() => void load()}
          style={{
            padding: "10px 14px",
            borderRadius: 10,
            border: "1px solid #e5e7eb",
            background: "#f9fafb",
            cursor: "pointer",
            fontWeight: 600,
          }}
        >
          רענן
        </button>
      </div>

      {err ? (
        <div style={{ padding: 12, borderRadius: 10, background: "#fef2f2", color: "#991b1b", marginBottom: 12 }}>{err}</div>
      ) : null}

      {modal ? (
        <div
          role="dialog"
          aria-modal
          aria-labelledby="campaign-detail-title"
          style={{
            position: "fixed",
            inset: 0,
            zIndex: 50,
            background: "rgba(15,23,42,0.45)",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            padding: 16,
          }}
          onClick={() => setModal(null)}
          onKeyDown={(e) => {
            if (e.key === "Escape") setModal(null);
          }}
        >
          <div
            style={{
              background: "#fff",
              borderRadius: 14,
              maxWidth: 720,
              width: "100%",
              maxHeight: "min(85vh, 720px)",
              overflow: "hidden",
              display: "flex",
              flexDirection: "column",
              boxShadow: "0 20px 50px rgba(0,0,0,0.2)",
            }}
            onClick={(e) => e.stopPropagation()}
          >
            <div style={{ padding: "14px 18px", borderBottom: "1px solid #e5e7eb", display: "flex", alignItems: "center", gap: 12 }}>
              <h2 id="campaign-detail-title" style={{ margin: 0, fontSize: 17, fontWeight: 900, flex: 1 }}>
                {modal.title}
              </h2>
              <button
                type="button"
                onClick={() => setModal(null)}
                style={{
                  border: "none",
                  background: "#f3f4f6",
                  borderRadius: 10,
                  padding: "8px 14px",
                  fontWeight: 800,
                  cursor: "pointer",
                }}
              >
                סגור
              </button>
            </div>
            <div style={{ overflow: "auto", padding: "0 12px 12px" }}>
              {modal.rows.length === 0 ? (
                <p style={{ padding: 16, color: "#6b7280", margin: 0 }}>אין רשומות בקבוצה זו (או שעדיין לא התקבל מידע ממטא).</p>
              ) : (
                <table style={{ ...tableStyle, fontSize: 13 }}>
                  <thead>
                    <tr>
                      <th style={th}>איש קשר</th>
                      <th style={th}>טלפון</th>
                      <th style={th}>סטטוס שליחה</th>
                      <th style={th}>נמסר</th>
                      <th style={th}>נקרא</th>
                      <th style={th}>בחירות / כפתורים</th>
                    </tr>
                  </thead>
                  <tbody>
                    {modal.rows.map((r, idx) => (
                      <tr key={`${r.contactId}-${r.to}-${idx}`}>
                        <td style={{ ...td, fontWeight: 700 }}>{r.contactName || "—"}</td>
                        <td style={{ ...td }} dir="ltr">
                          {r.to}
                        </td>
                        <td style={{ ...td }}>
                          {r.status === "sent" ? (
                            <span style={{ color: "#065f46" }}>נשלח</span>
                          ) : (
                            <span style={{ color: "#b91c1c" }}>נכשל{r.error ? `: ${r.error}` : ""}</span>
                          )}
                        </td>
                        <td style={{ ...td, fontSize: 12 }} dir="ltr">
                          {r.deliveredAt ? formatIsraelDateTime(r.deliveredAt) : "—"}
                        </td>
                        <td style={{ ...td, fontSize: 12 }} dir="ltr">
                          {r.readAt ? formatIsraelDateTime(r.readAt) : "—"}
                        </td>
                        <td style={{ ...td, fontSize: 12, maxWidth: 260 }}>
                          {(r.interactions ?? []).length ? (
                            <ul style={{ margin: 0, paddingInlineStart: 18 }}>
                              {(r.interactions ?? []).map((it, i) => (
                                <li key={i} style={{ marginBottom: 4 }}>
                                  <strong>{it.text}</strong>
                                  {it.payload ? (
                                    <span style={{ color: "#64748b" }}> ({it.payload})</span>
                                  ) : null}
                                  <div style={{ color: "#94a3b8", fontSize: 11 }} dir="ltr">
                                    {formatIsraelDateTime(it.at)} · {it.kind}
                                  </div>
                                </li>
                              ))}
                            </ul>
                          ) : (
                            "—"
                          )}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
            </div>
          </div>
        </div>
      ) : null}

      {loading ? (
        <div style={{ color: "#6b7280" }}>טוען…</div>
      ) : (
        <>
          <div
            style={{
              background: "#fff",
              border: "1px solid #e5e7eb",
              borderRadius: 14,
              overflow: "hidden",
              marginBottom: 22,
            }}
          >
            <div style={{ padding: "14px 16px", borderBottom: "1px solid #f3f4f6", fontWeight: 900, fontSize: 16 }}>טיוטות</div>
            <div style={{ overflowX: "auto" }}>
              <table style={tableStyle}>
                <thead>
                  <tr>
                    <th style={th} />
                    <th style={th}>שם</th>
                    <th style={th}>עדכון אחרון</th>
                    <th style={{ ...th, width: 120 }} />
                  </tr>
                </thead>
                <tbody>
                  {drafts.length === 0 ? (
                    <tr>
                      <td colSpan={4} style={{ ...td, color: "#6b7280" }}>
                        אין טיוטות. צרו ברודקאסט חדש או שמרו טיוטה ממסך העריכה.
                      </td>
                    </tr>
                  ) : (
                    drafts.map((d) => (
                      <tr key={d.id}>
                        <td style={td}>✎</td>
                        <td style={{ ...td, fontWeight: 700 }}>
                          <Link href={`/whatsapp-automations/broadcasts/new?draft=${encodeURIComponent(d.id)}`} style={{ color: "#4c1d95" }}>
                            {d.name}
                          </Link>
                        </td>
                        <td style={{ ...td, fontSize: 13, color: "#6b7280" }} dir="ltr">
                          {d.updatedAt ? formatIsraelDateTime(d.updatedAt) : "—"}
                        </td>
                        <td style={td}>
                          <button
                            type="button"
                            onClick={() => void removeDraft(d.id)}
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
                            מחק
                          </button>
                        </td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
          </div>

          <div style={{ background: "#fff", border: "1px solid #e5e7eb", borderRadius: 14, overflow: "hidden" }}>
            <div style={{ padding: "14px 16px", borderBottom: "1px solid #f3f4f6", fontWeight: 900, fontSize: 16 }}>היסטוריה</div>
            <div style={{ overflowX: "auto" }}>
              <table style={tableStyle}>
                <thead>
                  <tr>
                    <th style={th} />
                    <th style={th}>שם</th>
                    <th style={th}>התחלה</th>
                    <th style={th}>נמענים</th>
                    <th style={th}>הצליחו</th>
                    <th style={th}>נכשלו</th>
                    <th style={th}>נמסרו</th>
                    <th style={th}>נקראו</th>
                    <th style={th}>בחירות</th>
                    <th style={th}>פעולות</th>
                  </tr>
                </thead>
                <tbody>
                  {campaigns.length === 0 ? (
                    <tr>
                      <td colSpan={10} style={{ ...td, color: "#6b7280" }}>
                        עדיין לא נשלחו ברודקאסטים.
                      </td>
                    </tr>
                  ) : (
                    campaigns.map((c) => {
                      const disp = c.dispatches ?? [];
                      const pct = c.recipientCount > 0 ? ((100 * c.sentCount) / c.recipientCount).toFixed(1) : "0";
                      const del = countDelivered(disp);
                      const reads = countRead(disp);
                      const inter = countWithInteractions(disp);
                      return (
                        <tr key={c.id}>
                          <td style={td}>
                            <span style={{ fontSize: 18 }} title="WhatsApp">
                              📱
                            </span>
                          </td>
                          <td style={{ ...td, fontWeight: 700 }}>{c.broadcastName || c.templateName}</td>
                          <td style={{ ...td, fontSize: 13, color: "#6b7280" }} dir="ltr">
                            {formatIsraelDateTime(c.createdAt)}
                          </td>
                          <td style={td}>
                            <button
                              type="button"
                              style={countBtnStyle(disp.length === 0)}
                              disabled={disp.length === 0}
                              onClick={() =>
                                setModal({
                                  title: `${c.broadcastName || c.templateName} — כל הנמענים`,
                                  rows: disp,
                                })
                              }
                            >
                              {c.recipientCount}
                            </button>
                          </td>
                          <td style={{ ...td, color: "#065f46", fontWeight: 700 }}>
                            <button
                              type="button"
                              style={countBtnStyle(c.sentCount === 0)}
                              disabled={c.sentCount === 0}
                              onClick={() =>
                                setModal({
                                  title: `${c.broadcastName || c.templateName} — נשלחו בהצלחה`,
                                  rows: disp.filter((d) => d.status === "sent"),
                                })
                              }
                            >
                              {c.sentCount}
                            </button>
                            <span style={{ fontWeight: 500, color: "#6b7280", fontSize: 12 }}> ({pct}%)</span>
                          </td>
                          <td style={{ ...td, color: c.failedCount ? "#b91c1c" : "#6b7280" }}>
                            <button
                              type="button"
                              style={countBtnStyle(c.failedCount === 0)}
                              disabled={c.failedCount === 0}
                              onClick={() =>
                                setModal({
                                  title: `${c.broadcastName || c.templateName} — כשלון שליחה`,
                                  rows: disp.filter((d) => d.status === "failed"),
                                })
                              }
                            >
                              {c.failedCount}
                            </button>
                          </td>
                          <td style={td}>
                            <button
                              type="button"
                              style={countBtnStyle(del === 0)}
                              disabled={del === 0}
                              onClick={() =>
                                setModal({
                                  title: `${c.broadcastName || c.templateName} — נמסרו (מסירת מטא)`,
                                  rows: disp.filter((d) => d.status === "sent" && (d.deliveredAt || d.readAt)),
                                })
                              }
                            >
                              {del}
                            </button>
                          </td>
                          <td style={td}>
                            <button
                              type="button"
                              style={countBtnStyle(reads === 0)}
                              disabled={reads === 0}
                              onClick={() =>
                                setModal({
                                  title: `${c.broadcastName || c.templateName} — נקראו`,
                                  rows: disp.filter((d) => Boolean(d.readAt)),
                                })
                              }
                            >
                              {reads}
                            </button>
                          </td>
                          <td style={td}>
                            <button
                              type="button"
                              style={countBtnStyle(inter === 0)}
                              disabled={inter === 0}
                              onClick={() =>
                                setModal({
                                  title: `${c.broadcastName || c.templateName} — בחירות בכפתור / תשובה`,
                                  rows: disp.filter((d) => (d.interactions?.length ?? 0) > 0),
                                })
                              }
                            >
                              {inter}
                            </button>
                          </td>
                          <td style={{ ...td, width: 170 }}>
                            <Link
                              href={`/whatsapp-automations/broadcasts/new?campaign=${encodeURIComponent(c.id)}`}
                              style={{
                                display: "inline-block",
                                padding: "6px 10px",
                                borderRadius: 8,
                                border: "1px solid #d1d5db",
                                background: "#fff",
                                color: "#1f2937",
                                textDecoration: "none",
                                fontWeight: 700,
                                fontSize: 12,
                              }}
                            >
                              שכפל דיוור
                            </Link>
                          </td>
                        </tr>
                      );
                    })
                  )}
                </tbody>
              </table>
            </div>
            <div style={{ fontSize: 12, color: "#64748b", padding: "10px 16px", borderTop: "1px solid #f9fafb", lineHeight: 1.55 }}>
              נמסרו / נקראו מתעדכנים מ־webhook מטא (שדה <code style={{ fontSize: 11 }}>statuses</code>). בחירות בכפתור Quick Reply או
              תשובת רשימה נרשמות כשמטא שולחת הודעה נכנסת עם <code style={{ fontSize: 11 }}>context.id</code> של הודעת התבנית.
              <strong> לחיצות על כפתור URL</strong> בתבנית <strong>אינן</strong> נשלחות ל־webhook — מעקב אפשרי רק עם קישורים ייעודיים
              (למשל עם פרמטרים לשרת האתר שלכם). תבניות: עד 10 כפתורים, עד 2 מסוג URL — לפי מדיניות Meta Cloud API.
            </div>
          </div>
        </>
      )}
    </div>
  );
}
