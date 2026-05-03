"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";

type Deal = {
  id: string;
  name: string;
  clientCount?: number;
  dealType?: string;
  city?: string;
  fullAddress?: string;
  linkedContactIds: string[];
  saleAgreementUrl?: string;
  driveFolderUrl?: string;
  businessPlanUrl?: string;
  status?: string;
  notes?: string;
};

export default function DealDetailClient({ id }: { id: string }) {
  const router = useRouter();
  const [deal, setDeal] = useState<Deal | null>(null);
  const [contacts, setContacts] = useState<Record<string, { name: string; phone: string }>>({});
  const [err, setErr] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  const [draft, setDraft] = useState<Partial<Deal>>({});

  async function load() {
    setErr(null);
    try {
      const res = await fetch(`/api/deals/${encodeURIComponent(id)}`, { credentials: "include", cache: "no-store" });
      const j = (await res.json().catch(() => ({}))) as { ok?: boolean; deal?: Deal; error?: string };
      if (!res.ok || !j.ok || !j.deal) throw new Error(j.error ?? "לא נמצא");
      setDeal(j.deal);
      setDraft(j.deal);

      const ids = j.deal.linkedContactIds ?? [];
      const map: Record<string, { name: string; phone: string }> = {};
      await Promise.all(
        ids.map(async (cid) => {
          const r = await fetch(`/api/contacts/${encodeURIComponent(cid)}`, {
            credentials: "include",
            cache: "no-store",
          });
          const cj = (await r.json().catch(() => ({}))) as {
            ok?: boolean;
            lead?: { name?: string; phone?: string };
          };
          if (cj.ok && cj.lead) {
            map[cid] = { name: cj.lead.name ?? "", phone: cj.lead.phone ?? "" };
          }
        })
      );
      setContacts(map);
    } catch (e) {
      setErr(e instanceof Error ? e.message : "שגיאה");
    }
  }

  useEffect(() => {
    void load();
  }, [id]);

  async function save() {
    if (!deal) return;
    setSaving(true);
    setErr(null);
    try {
      const res = await fetch(`/api/deals/${encodeURIComponent(id)}`, {
        method: "PATCH",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: draft.name,
          clientCount: draft.clientCount,
          dealType: draft.dealType,
          city: draft.city,
          fullAddress: draft.fullAddress,
          linkedContactIds: draft.linkedContactIds,
          saleAgreementUrl: draft.saleAgreementUrl,
          driveFolderUrl: draft.driveFolderUrl,
          businessPlanUrl: draft.businessPlanUrl,
          status: draft.status,
          notes: draft.notes,
        }),
      });
      const j = (await res.json().catch(() => ({}))) as { ok?: boolean; deal?: Deal; error?: string };
      if (!res.ok || !j.ok) throw new Error(j.error ?? "שמירה נכשלה");
      setDeal(j.deal ?? deal);
      setDraft(j.deal ?? deal);
    } catch (e) {
      setErr(e instanceof Error ? e.message : "שגיאה");
    } finally {
      setSaving(false);
    }
  }

  if (!deal && !err) {
    return <div style={{ padding: 24 }}>טוען…</div>;
  }

  if (err && !deal) {
    return (
      <div style={{ padding: 24 }}>
        <div style={{ color: "#b91c1c", marginBottom: 12 }}>{err}</div>
        <Link href="/deals" style={{ color: "#2563eb", fontWeight: 700 }}>
          חזרה לרשימה
        </Link>
      </div>
    );
  }

  return (
    <div style={{ maxWidth: 920 }}>
      <div style={{ display: "flex", gap: 12, alignItems: "center", flexWrap: "wrap", marginBottom: 16 }}>
        <button type="button" onClick={() => router.push("/deals")} style={{ border: "1px solid #e5e7eb", borderRadius: 10, padding: "6px 12px", background: "#fff", cursor: "pointer" }}>
          ← חזרה
        </button>
        <h1 style={{ margin: 0, fontSize: 22, fontWeight: 900 }}>{deal?.name ?? "עסקה"}</h1>
      </div>

      {err && (
        <div style={{ marginBottom: 12, background: "#fef2f2", border: "1px solid #fecaca", color: "#b91c1c", padding: 12, borderRadius: 12 }}>
          {err}
        </div>
      )}

      <div style={{ display: "grid", gap: 14 }}>
        <section style={{ background: "#fff", border: "1px solid #e5e7eb", borderRadius: 14, padding: 16 }}>
          <div style={{ fontWeight: 900, marginBottom: 12 }}>פרטי עסקה</div>
          <div style={{ display: "grid", gap: 10, gridTemplateColumns: "repeat(auto-fit, minmax(240px, 1fr))" }}>
            <label style={{ display: "grid", gap: 4 }}>
              <span style={{ fontSize: 12, fontWeight: 700, color: "#6b7280" }}>שם</span>
              <input
                value={draft.name ?? ""}
                onChange={(e) => setDraft((d) => ({ ...d, name: e.target.value }))}
                style={{ padding: "8px 10px", borderRadius: 10, border: "1px solid #e5e7eb" }}
              />
            </label>
            <label style={{ display: "grid", gap: 4 }}>
              <span style={{ fontSize: 12, fontWeight: 700, color: "#6b7280" }}>סוג עסקה (שליש / מלא)</span>
              <input
                value={draft.dealType ?? ""}
                onChange={(e) => setDraft((d) => ({ ...d, dealType: e.target.value }))}
                style={{ padding: "8px 10px", borderRadius: 10, border: "1px solid #e5e7eb" }}
              />
            </label>
            <label style={{ display: "grid", gap: 4 }}>
              <span style={{ fontSize: 12, fontWeight: 700, color: "#6b7280" }}>עיר</span>
              <input
                value={draft.city ?? ""}
                onChange={(e) => setDraft((d) => ({ ...d, city: e.target.value }))}
                style={{ padding: "8px 10px", borderRadius: 10, border: "1px solid #e5e7eb" }}
              />
            </label>
            <label style={{ display: "grid", gap: 4, gridColumn: "1 / -1" }}>
              <span style={{ fontSize: 12, fontWeight: 700, color: "#6b7280" }}>כתובת מלאה</span>
              <input
                value={draft.fullAddress ?? ""}
                onChange={(e) => setDraft((d) => ({ ...d, fullAddress: e.target.value }))}
                style={{ padding: "8px 10px", borderRadius: 10, border: "1px solid #e5e7eb" }}
              />
            </label>
            <label style={{ display: "grid", gap: 4 }}>
              <span style={{ fontSize: 12, fontWeight: 700, color: "#6b7280" }}>סטטוס</span>
              <select
                value={draft.status ?? "בהתאמה"}
                onChange={(e) => setDraft((d) => ({ ...d, status: e.target.value }))}
                style={{ padding: "8px 10px", borderRadius: 10, border: "1px solid #e5e7eb" }}
              >
                {["בהתאמה", "נחתם", "סיום רכישה", "נמכר"].map((s) => (
                  <option key={s} value={s}>
                    {s}
                  </option>
                ))}
              </select>
            </label>
          </div>
        </section>

        <section style={{ background: "#fff", border: "1px solid #e5e7eb", borderRadius: 14, padding: 16 }}>
          <div style={{ fontWeight: 900, marginBottom: 12 }}>מסמכים וקישורים</div>
          <div style={{ display: "grid", gap: 10 }}>
            <label style={{ display: "grid", gap: 4 }}>
              <span style={{ fontSize: 12, fontWeight: 700, color: "#6b7280" }}>הסכם מכר (URL)</span>
              <input
                value={draft.saleAgreementUrl ?? ""}
                onChange={(e) => setDraft((d) => ({ ...d, saleAgreementUrl: e.target.value }))}
                style={{ padding: "8px 10px", borderRadius: 10, border: "1px solid #e5e7eb" }}
              />
            </label>
            <label style={{ display: "grid", gap: 4 }}>
              <span style={{ fontSize: 12, fontWeight: 700, color: "#6b7280" }}>תיקיית טיוטות / דרייב</span>
              <input
                value={draft.driveFolderUrl ?? ""}
                onChange={(e) => setDraft((d) => ({ ...d, driveFolderUrl: e.target.value }))}
                style={{ padding: "8px 10px", borderRadius: 10, border: "1px solid #e5e7eb" }}
              />
            </label>
            <label style={{ display: "grid", gap: 4 }}>
              <span style={{ fontSize: 12, fontWeight: 700, color: "#6b7280" }}>תכנית עסקית (URL)</span>
              <input
                value={draft.businessPlanUrl ?? ""}
                onChange={(e) => setDraft((d) => ({ ...d, businessPlanUrl: e.target.value }))}
                style={{ padding: "8px 10px", borderRadius: 10, border: "1px solid #e5e7eb" }}
              />
              {draft.businessPlanUrl ? (
                <a href={draft.businessPlanUrl} target="_blank" rel="noreferrer" style={{ fontSize: 13, fontWeight: 700 }}>
                  פתיחה בלשונית חדשה
                </a>
              ) : null}
            </label>
          </div>
        </section>

        <section style={{ background: "#fff", border: "1px solid #e5e7eb", borderRadius: 14, padding: 16 }}>
          <div style={{ fontWeight: 900, marginBottom: 12 }}>לקוחות משויכים</div>
          <p style={{ margin: "0 0 8px", fontSize: 13, color: "#6b7280" }}>
            הדבק מזהי אנשי קשר מופרדים בפסיק (ממסך אנשי קשר).
          </p>
          <textarea
            value={(draft.linkedContactIds ?? []).join(", ")}
            onChange={(e) =>
              setDraft((d) => ({
                ...d,
                linkedContactIds: e.target.value
                  .split(",")
                  .map((x) => x.trim())
                  .filter(Boolean),
              }))
            }
            rows={2}
            style={{ width: "100%", padding: "8px 10px", borderRadius: 10, border: "1px solid #e5e7eb", fontFamily: "inherit" }}
          />
          <div style={{ marginTop: 12, display: "grid", gap: 8 }}>
            {(draft.linkedContactIds ?? []).map((cid) => (
              <div key={cid} style={{ display: "flex", justifyContent: "space-between", gap: 8, flexWrap: "wrap" }}>
                <span style={{ fontWeight: 700 }}>{contacts[cid]?.name || cid}</span>
                <Link href={`/contacts/${encodeURIComponent(cid)}`} style={{ color: "#2563eb", fontWeight: 700 }}>
                  כרטיס לקוח
                </Link>
              </div>
            ))}
          </div>
        </section>

        <section style={{ background: "#fff", border: "1px solid #e5e7eb", borderRadius: 14, padding: 16 }}>
          <div style={{ fontWeight: 900, marginBottom: 12 }}>הערות</div>
          <textarea
            value={draft.notes ?? ""}
            onChange={(e) => setDraft((d) => ({ ...d, notes: e.target.value }))}
            rows={5}
            style={{ width: "100%", padding: "8px 10px", borderRadius: 10, border: "1px solid #e5e7eb", fontFamily: "inherit" }}
          />
        </section>

        <div>
          <button
            type="button"
            onClick={() => void save()}
            disabled={saving}
            style={{
              padding: "10px 20px",
              borderRadius: 12,
              border: "none",
              cursor: saving ? "wait" : "pointer",
              fontWeight: 800,
              background: "linear-gradient(180deg, #a78bfa 0%, #6d28d9 100%)",
              color: "#fff",
            }}
          >
            {saving ? "שומר…" : "שמור"}
          </button>
        </div>
      </div>
    </div>
  );
}
