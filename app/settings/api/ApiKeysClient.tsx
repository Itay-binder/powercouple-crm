"use client";

import { useCallback, useEffect, useState } from "react";
import SettingsSectionNav from "@/app/components/SettingsSectionNav";
import { formatIsraelDateTime } from "@/lib/datetime/formatIsrael";

type KeyRow = {
  id: string;
  label: string;
  createdAt: string | null;
  createdBy?: string;
  revoked: boolean;
  hint?: string;
};

type Props = {
  baseUrl: string;
  tenantLabel: string;
  tenantDatabaseId: string;
  multiTenant: boolean;
  showMovingOrders?: boolean;
};

function CodeBlock({ text }: { text: string }) {
  return (
    <pre
      dir="ltr"
      style={{
        margin: "10px 0 0",
        padding: 12,
        borderRadius: 10,
        background: "#f9fafb",
        border: "1px solid #e5e7eb",
        fontSize: 12,
        lineHeight: 1.45,
        overflowX: "auto",
        whiteSpace: "pre-wrap",
        wordBreak: "break-word",
      }}
    >
      {text}
    </pre>
  );
}

export default function ApiKeysClient({
  baseUrl,
  tenantLabel,
  tenantDatabaseId,
  multiTenant,
  showMovingOrders,
}: Props) {
  const [keys, setKeys] = useState<KeyRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState<string | null>(null);
  const [forbidden, setForbidden] = useState(false);
  const [label, setLabel] = useState("");
  const [creating, setCreating] = useState(false);
  const [newKeyPlain, setNewKeyPlain] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setErr(null);
    setForbidden(false);
    try {
      const res = await fetch("/api/settings/api-keys", { credentials: "include" });
      const j = (await res.json()) as { ok?: boolean; error?: string; keys?: KeyRow[] };
      if (res.status === 403) {
        setForbidden(true);
        setKeys([]);
        return;
      }
      if (!res.ok || !j.ok) {
        setErr(j.error ?? "טעינה נכשלה");
        return;
      }
      setKeys(j.keys ?? []);
    } catch {
      setErr("טעינה נכשלה");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  async function createKey() {
    setCreating(true);
    setErr(null);
    setNewKeyPlain(null);
    try {
      const res = await fetch("/api/settings/api-keys", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ label: label.trim() || undefined }),
      });
      const j = (await res.json()) as { ok?: boolean; apiKey?: string; error?: string };
      if (res.status === 403) {
        setForbidden(true);
        return;
      }
      if (!res.ok || !j.ok || !j.apiKey) {
        setErr(j.error ?? "יצירה נכשלה");
        return;
      }
      setNewKeyPlain(j.apiKey);
      setLabel("");
      await load();
    } catch {
      setErr("יצירה נכשלה");
    } finally {
      setCreating(false);
    }
  }

  async function revoke(id: string) {
    if (!window.confirm("לבטל מפתח זה? אינטגרציות שמשתמשות בו יפסיקו לעבוד.")) return;
    setErr(null);
    try {
      const res = await fetch(`/api/settings/api-keys/${encodeURIComponent(id)}`, {
        method: "DELETE",
        credentials: "include",
      });
      const j = (await res.json()) as { ok?: boolean; error?: string };
      if (!res.ok || !j.ok) {
        setErr(j.error ?? "ביטול נכשל");
        return;
      }
      await load();
    } catch {
      setErr("ביטול נכשל");
    }
  }

  return (
    <div>
      <SettingsSectionNav active="api" showMovingOrders={showMovingOrders} />
      <div
        style={{
          maxWidth: 720,
          background: "#fff",
          borderRadius: 16,
          border: "1px solid #e5e7eb",
          padding: 20,
        }}
      >
        <h1 style={{ margin: "0 0 8px", fontSize: 22 }}>מפתחות API לקליטת נתונים</h1>
        <p style={{ margin: "0 0 16px", color: "#6b7280", lineHeight: 1.5, fontSize: 14 }}>
          מפתחות פעילים רק עבור <strong>מסד הנתונים של העסק הנוכחי</strong> (הדייר הפעיל). שלחו את
          המפתח בכותרת <code dir="ltr">x-api-key</code>, <code dir="ltr">x-crm-api-key</code>, או{" "}
          <code dir="ltr">Authorization: Bearer …</code> — כמו עם מפתח ה־Vercel הגלובלי. אם מוגדר{" "}
          <code dir="ltr">CRM_INGEST_API_KEY</code>, הוא עדיין נתמך ואינו דורש שינוי באינטגרציות
          קיימות.
        </p>

        {forbidden && (
          <div
            style={{
              padding: 12,
              borderRadius: 12,
              background: "#fef3c7",
              color: "#92400e",
              marginBottom: 16,
            }}
          >
            רק מנהלים יכולים לנהל מפתחות API.
          </div>
        )}

        {err && (
          <div
            style={{
              padding: 12,
              borderRadius: 12,
              background: "#fee2e2",
              color: "#991b1b",
              marginBottom: 16,
            }}
          >
            {err}
          </div>
        )}

        {newKeyPlain && (
          <div
            style={{
              padding: 14,
              borderRadius: 12,
              background: "#ecfdf5",
              border: "1px solid #6ee7b7",
              marginBottom: 16,
            }}
          >
            <div style={{ fontWeight: 800, marginBottom: 8 }}>המפתח הוצג פעם אחת בלבד — העתיקו עכשיו</div>
            <textarea
              readOnly
              dir="ltr"
              value={newKeyPlain}
              onFocus={(e) => e.target.select()}
              style={{
                width: "100%",
                minHeight: 72,
                fontFamily: "monospace",
                fontSize: 13,
                padding: 10,
                borderRadius: 8,
                border: "1px solid #d1d5db",
              }}
            />
            <button
              type="button"
              onClick={() => setNewKeyPlain(null)}
              style={{
                marginTop: 8,
                padding: "8px 12px",
                borderRadius: 10,
                border: "none",
                background: "#111827",
                color: "#fff",
                cursor: "pointer",
                fontWeight: 600,
              }}
            >
              סיימתי, הסתר
            </button>
          </div>
        )}

        {!forbidden && (
          <div style={{ display: "flex", flexWrap: "wrap", gap: 10, marginBottom: 20 }}>
            <input
              type="text"
              placeholder="תיאור (אופציונלי), למשל Make"
              value={label}
              onChange={(e) => setLabel(e.target.value)}
              style={{
                flex: "1 1 200px",
                padding: "10px 12px",
                borderRadius: 10,
                border: "1px solid #e5e7eb",
              }}
            />
            <button
              type="button"
              disabled={creating}
              onClick={() => void createKey()}
              style={{
                padding: "10px 16px",
                borderRadius: 10,
                border: "none",
                cursor: creating ? "wait" : "pointer",
                fontWeight: 700,
                background: "linear-gradient(180deg, #a78bfa 0%, #6d28d9 100%)",
                color: "#fff",
              }}
            >
              {creating ? "יוצר…" : "צור מפתח חדש"}
            </button>
          </div>
        )}

        {loading ? (
          <div style={{ color: "#6b7280" }}>טוען…</div>
        ) : (
          <ul style={{ listStyle: "none", padding: 0, margin: 0 }}>
            {keys.length === 0 && !forbidden && (
              <li style={{ color: "#6b7280" }}>אין מפתחות במסד זה. אפשר להמשיך להשתמש רק ב־CRM_INGEST_API_KEY מהסביבה.</li>
            )}
            {keys.map((k) => (
              <li
                key={k.id}
                style={{
                  display: "flex",
                  flexWrap: "wrap",
                  alignItems: "center",
                  justifyContent: "space-between",
                  gap: 10,
                  padding: "12px 0",
                  borderBottom: "1px solid #f3f4f6",
                }}
              >
                <div>
                  <div style={{ fontWeight: 700 }}>{k.label}</div>
                  <div dir="ltr" style={{ fontSize: 12, color: "#6b7280" }}>
                    csk_live_…{k.hint ? `…${k.hint}` : ""} ·{" "}
                    {k.createdAt ? formatIsraelDateTime(k.createdAt) : "—"}
                    {k.revoked ? " · מבוטל" : ""}
                  </div>
                </div>
                {!k.revoked && !forbidden && (
                  <button
                    type="button"
                    onClick={() => void revoke(k.id)}
                    style={{
                      padding: "8px 12px",
                      borderRadius: 10,
                      border: "1px solid #fecaca",
                      background: "#fff",
                      color: "#b91c1c",
                      cursor: "pointer",
                      fontWeight: 600,
                    }}
                  >
                    ביטול מפתח
                  </button>
                )}
              </li>
            ))}
          </ul>
        )}
      </div>

      <HttpApiGuide
        baseUrl={baseUrl}
        tenantLabel={tenantLabel}
        tenantDatabaseId={tenantDatabaseId}
        multiTenant={multiTenant}
      />
    </div>
  );
}

function HttpApiGuide({
  baseUrl,
  tenantLabel,
  tenantDatabaseId,
  multiTenant,
}: Props) {
  const base = baseUrl.trim() || "https://YOUR-CRM-DOMAIN.example";
  const tid = tenantDatabaseId;
  const hKey = '  -H "x-api-key: YOUR_KEY_HERE" \\';
  const hJson = '  -H "Content-Type: application/json" \\';
  const hTenant = `  -H "x-crm-tenant-database-id: ${tid}" \\`;
  const tenantHeaderLine = `  -H "x-crm-tenant-database-id: ${tid}"`;

  const sectionTitle = (n: string, t: string) => (
    <h2 style={{ margin: "24px 0 8px", fontSize: 17, fontWeight: 800 }}>{n}. {t}</h2>
  );

  return (
    <div
      style={{
        maxWidth: 880,
        marginTop: 24,
        background: "#fff",
        borderRadius: 16,
        border: "1px solid #e5e7eb",
        padding: 20,
      }}
    >
      <h1 style={{ margin: "0 0 8px", fontSize: 22 }}>מדריך HTTP — העסק הנוכחי</h1>
      <p style={{ margin: "0 0 12px", color: "#374151", lineHeight: 1.6, fontSize: 14 }}>
        המדריך מותאם לעסק <strong>{tenantLabel}</strong>. כל הקריאות למטה פונות למסד הנתונים של
        הדייר הפעיל בלבד, כשמשתמשים במפתח API ובכותרת המזהה למטה.
      </p>
      <div
        style={{
          padding: 12,
          borderRadius: 12,
          background: "#eff6ff",
          border: "1px solid #bfdbfe",
          marginBottom: 8,
        }}
      >
        <div style={{ fontWeight: 700, marginBottom: 6 }}>מזהה מסד (להעתקה לכותרת)</div>
        <code dir="ltr" style={{ fontSize: 13, wordBreak: "break-all" }}>
          {tid}
        </code>
        <div style={{ fontSize: 13, color: "#1e40af", marginTop: 8, lineHeight: 1.5 }}>
          כותרת HTTP: <code dir="ltr">x-crm-tenant-database-id</code>
          {multiTenant ? (
            <>
              {" "}
              — <strong>חובה</strong> בכל בקשה כשיש כמה עסקים במערכת.
            </>
          ) : (
            <>
              {" "}
              — מומלץ תמיד באינטגרציות; בעסק יחיד עם מסד ברירת מחדל לעיתים השרת יזהה בלי הכותרת.
            </>
          )}
        </div>
      </div>
      <p style={{ margin: "0 0 8px", color: "#6b7280", fontSize: 13, lineHeight: 1.5 }}>
        בסיס כתובות לדוגמה: <code dir="ltr">{base}</code> (הוחלף אוטומטית לפי הדפדפן; אם ריק —
        החליפו בדומיין שלכם).
      </p>
      <p style={{ margin: "0 0 16px", color: "#6b7280", fontSize: 13, lineHeight: 1.5 }}>
        אימות: <code dir="ltr">x-api-key</code>, <code dir="ltr">x-crm-api-key</code>, או{" "}
        <code dir="ltr">Authorization: Bearer …</code> עם מפתח מהמסך למעלה או עם{" "}
        <code dir="ltr">CRM_INGEST_API_KEY</code> מהסביבה.
      </p>

      {sectionTitle("1", "יצירת / עדכון איש קשר (REST)")}
      <p style={{ margin: 0, color: "#4b5563", fontSize: 14, lineHeight: 1.55 }}>
        <strong>POST</strong> יוצר או ממזג לפי אימייל/טלפון (כמו בממשק). גוף JSON: לפחות אחד מ־
        <code dir="ltr">email</code> / <code dir="ltr">phone</code>, ושדות אופציונליים כמו{" "}
        <code dir="ltr">name</code>, <code dir="ltr">status</code>, <code dir="ltr">customValues</code>.
      </p>
      <CodeBlock
        text={`curl -X POST "${base}/api/contacts" \\
${hJson}
${hKey}
${hTenant}
  -d '{"phone":"0501234567","name":"ישראל ישראלי","email":"israel@example.com"}'`}
      />

      <p style={{ margin: "14px 0 0", color: "#4b5563", fontSize: 14, lineHeight: 1.55 }}>
        <strong>PATCH</strong> לפי מזהה מסמך (ה־<code dir="ltr">id</code> שחוזר מה־API או מהטבלה):
      </p>
      <CodeBlock
        text={`curl -X PATCH "${base}/api/contacts/CONTACT_ID" \\
${hJson}
${hKey}
${hTenant}
  -d '{"name":"שם מעודכן","phone":"0509999999","status":"פתוח"}'`}
      />

      {sectionTitle("2", "שליפת אנשי קשר")}
      <p style={{ margin: 0, color: "#4b5563", fontSize: 14, lineHeight: 1.55 }}>
        <strong>GET</strong> רשימה; אופציונלי <code dir="ltr">?phone=</code> (התאמה גמישה לפי מספר),
        <code dir="ltr">date_from</code>, <code dir="ltr">date_to</code>.
      </p>
      <CodeBlock
        text={`curl -s "${base}/api/contacts?phone=526660006" \\
${hKey}
${hTenant.replace(" \\", "")}`}
      />
      <p style={{ margin: "8px 0 0", color: "#4b5563", fontSize: 13 }}>
        פירוט איש קשר + הזדמנויות מקושרות: <strong>GET</strong>{" "}
        <code dir="ltr">{`${base}/api/contacts/CONTACT_ID`}</code>
      </p>

      {sectionTitle("3", "יצירת / עדכון הזדמנות (REST)")}
      <p style={{ margin: 0, color: "#4b5563", fontSize: 14, lineHeight: 1.55 }}>
        <strong>POST</strong> — חובה <code dir="ltr">contactId</code> (מזהה איש קשר). מומלץ גם{" "}
        <code dir="ltr">pipelineId</code>, <code dir="ltr">stage</code>, <code dir="ltr">name</code>.
      </p>
      <CodeBlock
        text={`curl -X POST "${base}/api/opportunities" \\
${hJson}
${hKey}
${hTenant}
  -d '{"contactId":"CONTACT_ID","pipelineId":"PIPELINE_ID","stage":"Pending","name":"ליד חדש","phone":"0501234567"}'`}
      />
      <p style={{ margin: "12px 0 0", color: "#4b5563", fontSize: 14, lineHeight: 1.55 }}>
        <strong>PATCH</strong> לפי מזהה הזדמנות:
      </p>
      <CodeBlock
        text={`curl -X PATCH "${base}/api/opportunities/OPPORTUNITY_ID" \\
${hJson}
${hKey}
${hTenant}
  -d '{"stage":"Contacted","value":1500,"status":"פתוח"}'`}
      />

      {sectionTitle("4", "שליפת הזדמנויות")}
      <p style={{ margin: 0, color: "#4b5563", fontSize: 14, lineHeight: 1.55 }}>
        <strong>GET</strong> — אופציונלי <code dir="ltr">pipelineId</code>, <code dir="ltr">phone</code>.
      </p>
      <CodeBlock
        text={`curl -s "${base}/api/opportunities?phone=526660006" \\
${hKey}
${tenantHeaderLine}`}
      />
      <p style={{ margin: "8px 0 0", color: "#4b5563", fontSize: 13 }}>
        הזדמנות בודדת: <strong>GET</strong> <code dir="ltr">{`${base}/api/opportunities/OPPORTUNITY_ID`}</code>
      </p>

      {sectionTitle("5", "קליטה עם מזהה חיצוני (מומלץ ל-Make)")}
      <p style={{ margin: 0, color: "#4b5563", fontSize: 14, lineHeight: 1.55 }}>
        כששולחים <code dir="ltr">provider</code> + <code dir="ltr">externalId</code>, אותה בקשה חוזרת
        מעדכנת את אותו רשומה במקום ליצור כפילויות.
      </p>
      <p style={{ margin: "10px 0 0", fontWeight: 700, fontSize: 13 }}>איש קשר</p>
      <CodeBlock
        text={`curl -X POST "${base}/api/ingest/contact-upsert" \\
${hJson}
${hKey}
${hTenant}
  -d '{"provider":"make","externalId":"row-123","contact":{"phone":"0501234567","name":"ישראל","email":"a@b.com"}}'`}
      />
      <p style={{ margin: "10px 0 0", fontWeight: 700, fontSize: 13 }}>הזדמנות (דורש contactId)</p>
      <CodeBlock
        text={`curl -X POST "${base}/api/ingest/opportunity-upsert" \\
${hJson}
${hKey}
${hTenant}
  -d '{"provider":"make","externalId":"deal-456","opportunity":{"contactId":"CONTACT_ID","pipelineId":"PIPELINE_ID","stage":"Pending","name":"עסקה"}}'`}
      />
      <p style={{ margin: "10px 0 0", fontWeight: 700, fontSize: 13 }}>
        הזמנת הובלה (טננט עם ניהול הזמנות בלבד)
      </p>
      <p style={{ margin: "4px 0 0", color: "#4b5563", fontSize: 13, lineHeight: 1.5 }}>
        <strong>POST</strong> <code dir="ltr">/api/ingest/moving-order</code> או{" "}
        <code dir="ltr">/api/ingest/order</code> — גוף: מערך אובייקטים או אובייקט עם{" "}
        <code dir="ltr">order_id</code>.
      </p>
      <CodeBlock
        text={`curl -X POST "${base}/api/ingest/order" \\
${hJson}
${hKey}
${hTenant}
  -d '[{"order_id":"demo-1","name":"דוגמה","phone":"0500000000","pickup":"א","dropoff":"ב","date":"2026-03-31"}]'`}
      />
      <p style={{ margin: "10px 0 0 0", fontWeight: 700, fontSize: 13 }}>
        שאלון הצטרפות מוביל (פייפליין לקוחות משלמים)
      </p>
      <p style={{ margin: "4px 0 0", color: "#4b5563", fontSize: 13, lineHeight: 1.5 }}>
        <strong>POST</strong> <code dir="ltr">/api/ingest/mover-welcome</code> — מערך כמו בוובהוק Make; מזהה
        הזדמנות לפי <code dir="ltr">phone</code> (או <code dir="ltr">opportunity_id</code>); ממלא שדות
        מותאמים על ההזדמנות ומסנכרן שדות מוביל על איש הקשר.
      </p>
      <CodeBlock
        text={`curl -X POST "${base}/api/ingest/mover-welcome" \\
${hJson}
${hKey}
${hTenant}
  -d '[{"name":"דוגמה","phone":"0500000000","email":"a@b.com","activity_regions":"גוש דן, שפלה","activity_regions_array":["גוש דן","שפלה"],"activity_days_text":"א\\u0027, ב\\u0027","activity_days_array":["א\\u0027","ב\\u0027"],"activity_start":"06:00","activity_end":"23:59","activity_flexible":true,"activity_hours":null,"immediate_availability":"כן","mover_services":"הובלות דירה, הובלות שמצריכות מנוף","notes":"—"}]'`}
      />

      {sectionTitle("6", "נתיב חלופי לליד")}
      <p style={{ margin: 0, color: "#4b5563", fontSize: 14, lineHeight: 1.55 }}>
        <strong>POST</strong> <code dir="ltr">/api/leads</code> — גוף JSON גמיש (שדות ליד); מתאים לסקריפטים
        פשוטים.
      </p>
      <p style={{ margin: "8px 0 0", color: "#4b5563", fontSize: 14, lineHeight: 1.55 }}>
        <strong>GET</strong> — תקציר לידים; אופציונלי <code dir="ltr">phone</code>, תאריכים.
      </p>
      <CodeBlock
        text={`curl -s "${base}/api/leads?phone=526660006" \\
${hKey}
${tenantHeaderLine}`}
      />
    </div>
  );
}
