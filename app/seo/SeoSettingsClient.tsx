"use client";

import { useCallback, useEffect, useState, type CSSProperties } from "react";

const AUTH_REDIRECT = "CRM_SEO_AUTH_REDIRECT";

type KnowledgeDoc = { id: string; title: string; content: string };

type Settings = {
  siteUrl: string;
  scanFocus: string;
  businessName: string;
  businessBlurb: string;
  defaultKeywordSeeds: string;
  knowledgeDocs: KnowledgeDoc[];
  updatedAt: string;
};

async function fetchJson<T>(url: string, init?: RequestInit): Promise<T> {
  const res = await fetch(url, { cache: "no-store", credentials: "include", ...init });
  if (res.status === 401) {
    window.location.href = `/login?returnTo=${encodeURIComponent("/seo/settings")}`;
    throw new Error(AUTH_REDIRECT);
  }
  if (res.status === 403) {
    window.location.href = `/pending?returnTo=${encodeURIComponent("/seo/settings")}`;
    throw new Error(AUTH_REDIRECT);
  }
  return res.json() as Promise<T>;
}

const fieldStyle: CSSProperties = {
  width: "100%",
  marginTop: 6,
  padding: "10px 12px",
  borderRadius: 10,
  border: "1px solid #e5e7eb",
  fontSize: 15,
  fontFamily: "inherit",
};

export default function SeoSettingsClient() {
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [okMsg, setOkMsg] = useState<string | null>(null);
  const [form, setForm] = useState<Settings>({
    siteUrl: "",
    scanFocus: "",
    businessName: "",
    businessBlurb: "",
    defaultKeywordSeeds: "",
    knowledgeDocs: [],
    updatedAt: "",
  });

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      setErr(null);
      try {
        const j = await fetchJson<{ ok: boolean; settings?: Settings; error?: string }>("/api/seo/settings");
        if (!j.ok || !j.settings) throw new Error(j.error || "שגיאה בטעינה");
        if (!cancelled)
          setForm({
            ...j.settings,
            knowledgeDocs: Array.isArray(j.settings.knowledgeDocs) ? j.settings.knowledgeDocs : [],
          });
      } catch (e) {
        if ((e as Error).message !== AUTH_REDIRECT && !cancelled) {
          setErr((e as Error).message || "שגיאה");
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  const onSave = useCallback(async () => {
    setErr(null);
    setOkMsg(null);
    setSaving(true);
    try {
      const j = await fetchJson<{ ok: boolean; settings?: Settings; error?: string }>("/api/seo/settings", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          siteUrl: form.siteUrl,
          scanFocus: form.scanFocus,
          businessName: form.businessName,
          businessBlurb: form.businessBlurb,
          defaultKeywordSeeds: form.defaultKeywordSeeds,
          knowledgeDocs: form.knowledgeDocs,
        }),
      });
      if (!j.ok || !j.settings) throw new Error(j.error || "שגיאה בשמירה");
      setForm(j.settings);
      setOkMsg("ההגדרות נשמרו.");
    } catch (e) {
      if ((e as Error).message !== AUTH_REDIRECT) {
        setErr((e as Error).message || "שגיאה");
      }
    } finally {
      setSaving(false);
    }
  }, [form]);

  return (
    <div style={{ maxWidth: 720, margin: "0 auto" }}>
      <h1 style={{ margin: "0 0 8px", fontSize: 26, fontWeight: 800 }}>הגדרות סוכן SEO</h1>
      <p style={{ margin: "0 0 22px", color: "#6b7280", lineHeight: 1.6 }}>
        הגדירו את האתר, תיאור העסק, ומה הסוכן צריך &quot;לחפש&quot; ברשת. מילות מפתח ברירת מחדל (פסיקים) משולבות
        ברעיונות ובמאמרים. ניתן להוסיף מסמכי ידע — הם נכנסים לקונטקסט של יצירת רעיונות יחד עם תמצית טקסט שאוחזרת
        מכתובת האתר (אם זמינה). לכיבוי שליפת אתר: משתנה סביבה <code dir="ltr">SEO_AGENT_FETCH_SITE=false</code>.
      </p>

      {err ? (
        <div
          style={{
            marginBottom: 16,
            padding: 12,
            borderRadius: 12,
            background: "#fef2f2",
            border: "1px solid #fecaca",
            color: "#991b1b",
          }}
        >
          {err}
        </div>
      ) : null}
      {okMsg ? (
        <div
          style={{
            marginBottom: 16,
            padding: 12,
            borderRadius: 12,
            background: "#ecfdf5",
            border: "1px solid #a7f3d0",
            color: "#065f46",
          }}
        >
          {okMsg}
        </div>
      ) : null}

      {loading ? (
        <div style={{ color: "#6b7280" }}>טוען…</div>
      ) : (
        <div
          style={{
            background: "#fff",
            border: "1px solid #e5e7eb",
            borderRadius: 16,
            padding: 20,
            display: "grid",
            gap: 16,
          }}
        >
          <div>
            <label style={{ fontWeight: 600, fontSize: 14 }}>כתובת אתר (לאימות הקשר)</label>
            <input
              value={form.siteUrl}
              onChange={(e) => setForm((f) => ({ ...f, siteUrl: e.target.value }))}
              placeholder="https://…"
              dir="ltr"
              style={fieldStyle}
            />
          </div>
          <div>
            <label style={{ fontWeight: 600, fontSize: 14 }}>מה לסרוק / לאילו נושאים להתמקד ברשת</label>
            <textarea
              value={form.scanFocus}
              onChange={(e) => setForm((f) => ({ ...f, scanFocus: e.target.value }))}
              placeholder="למשל: שירותי הובלות בגוש דן, מחירון אריזה, השוואת חברות מעבר דירה…"
              rows={4}
              style={{ ...fieldStyle, resize: "vertical" }}
            />
          </div>
          <div>
            <label style={{ fontWeight: 600, fontSize: 14 }}>שם העסק</label>
            <input
              value={form.businessName}
              onChange={(e) => setForm((f) => ({ ...f, businessName: e.target.value }))}
              style={fieldStyle}
            />
          </div>
          <div>
            <label style={{ fontWeight: 600, fontSize: 14 }}>תיאור קצר של העסק</label>
            <textarea
              value={form.businessBlurb}
              onChange={(e) => setForm((f) => ({ ...f, businessBlurb: e.target.value }))}
              rows={3}
              style={{ ...fieldStyle, resize: "vertical" }}
            />
          </div>
          <div>
            <label style={{ fontWeight: 600, fontSize: 14 }}>מילות מפתח ברירת מחדל (פסיקים)</label>
            <input
              value={form.defaultKeywordSeeds}
              onChange={(e) => setForm((f) => ({ ...f, defaultKeywordSeeds: e.target.value }))}
              placeholder="הובלות, מעבר דירה, אריזה…"
              style={fieldStyle}
            />
          </div>

          <div style={{ borderTop: "1px solid #e5e7eb", paddingTop: 14 }}>
            <div style={{ fontWeight: 800, fontSize: 15, marginBottom: 8 }}>מאגר ידע (מסמכים)</div>
            <p style={{ margin: "0 0 12px", fontSize: 13, color: "#6b7280", lineHeight: 1.5 }}>
              הוסיפו טקסט חופשי (מדיניות, שירותים, FAQ פנימי וכו׳). עד 12 מסמכים; כל אחד עד ~8000 תווים.
            </p>
            <button
              type="button"
              onClick={() => {
                const id =
                  typeof crypto !== "undefined" && crypto.randomUUID
                    ? crypto.randomUUID()
                    : `doc-${Date.now()}`;
                setForm((f) => ({
                  ...f,
                  knowledgeDocs: [...f.knowledgeDocs, { id, title: "", content: "" }],
                }));
              }}
              disabled={form.knowledgeDocs.length >= 12}
              style={{
                marginBottom: 12,
                padding: "8px 14px",
                borderRadius: 10,
                border: "1px dashed #cbd5e1",
                background: "#f8fafc",
                fontWeight: 700,
                cursor: form.knowledgeDocs.length >= 12 ? "not-allowed" : "pointer",
              }}
            >
              + מסמך
            </button>
            <div style={{ display: "grid", gap: 14 }}>
              {form.knowledgeDocs.map((doc, idx) => (
                <div
                  key={doc.id}
                  style={{
                    padding: 14,
                    borderRadius: 12,
                    border: "1px solid #e5e7eb",
                    background: "#fafafa",
                  }}
                >
                  <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 10 }}>
                    <span style={{ fontWeight: 700, fontSize: 13, color: "#6b7280" }}>מסמך {idx + 1}</span>
                    <button
                      type="button"
                      onClick={() =>
                        setForm((f) => ({
                          ...f,
                          knowledgeDocs: f.knowledgeDocs.filter((d) => d.id !== doc.id),
                        }))
                      }
                      style={{
                        padding: "4px 10px",
                        fontSize: 13,
                        borderRadius: 8,
                        border: "1px solid #fecaca",
                        background: "#fff",
                        color: "#b91c1c",
                        cursor: "pointer",
                      }}
                    >
                      הסר
                    </button>
                  </div>
                  <input
                    value={doc.title}
                    onChange={(e) => {
                      const v = e.target.value;
                      setForm((f) => ({
                        ...f,
                        knowledgeDocs: f.knowledgeDocs.map((d) => (d.id === doc.id ? { ...d, title: v } : d)),
                      }));
                    }}
                    placeholder="כותרת (אופציונלי)"
                    style={{ ...fieldStyle, marginTop: 10 }}
                  />
                  <textarea
                    value={doc.content}
                    onChange={(e) => {
                      const v = e.target.value;
                      setForm((f) => ({
                        ...f,
                        knowledgeDocs: f.knowledgeDocs.map((d) => (d.id === doc.id ? { ...d, content: v } : d)),
                      }));
                    }}
                    placeholder="תוכן המסמך…"
                    rows={5}
                    style={{ ...fieldStyle, resize: "vertical", marginTop: 8 }}
                  />
                </div>
              ))}
            </div>
          </div>

          {form.updatedAt ? (
            <div style={{ fontSize: 12, color: "#9ca3af" }}>עודכן לאחרונה: {form.updatedAt}</div>
          ) : null}
          <div>
            <button
              type="button"
              onClick={() => void onSave()}
              disabled={saving}
              style={{
                padding: "10px 22px",
                borderRadius: 12,
                border: "none",
                background: "#2563eb",
                color: "#fff",
                fontWeight: 700,
                cursor: saving ? "wait" : "pointer",
              }}
            >
              {saving ? "שומר…" : "שמור"}
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
