"use client";

import { useCallback, useEffect, useState } from "react";
import { formatIsraelDateTime } from "@/lib/datetime/formatIsrael";

type SettingsVm = {
  appId: string;
  businessAccountId: string;
  wabaId: string;
  phoneNumberId: string;
  hasToken: boolean;
  tokenPreview: string;
  updatedAt: string;
};

async function parseJson<T>(res: Response): Promise<T> {
  return (await res.json().catch(() => ({}))) as T;
}

export default function AccountPageClient() {
  const [loading, setLoading] = useState(true);
  const [savingSettings, setSavingSettings] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [okMsg, setOkMsg] = useState<string | null>(null);
  const [settings, setSettings] = useState<SettingsVm | null>(null);

  const [appId, setAppId] = useState("");
  const [businessAccountId, setBusinessAccountId] = useState("");
  const [wabaId, setWabaId] = useState("");
  const [phoneNumberId, setPhoneNumberId] = useState("");
  const [systemUserToken, setSystemUserToken] = useState("");

  const load = useCallback(async () => {
    setLoading(true);
    setErr(null);
    try {
      const res = await fetch("/api/whatsapp/settings", { credentials: "include", cache: "no-store" });
      if (res.status === 401) {
        window.location.href = `/login?returnTo=${encodeURIComponent("/whatsapp-automations/account")}`;
        return;
      }
      if (res.status === 403) {
        setErr("רק מנהל יכול לערוך הגדרות חיבור.");
        return;
      }
      const j = await parseJson<{ ok?: boolean; config?: SettingsVm; error?: string }>(res);
      if (!j.ok) throw new Error(j.error || "שגיאה בטעינה");
      setSettings(j.config ?? null);
      if (j.config) {
        setAppId(j.config.appId ?? "");
        setBusinessAccountId(j.config.businessAccountId ?? "");
        setWabaId(j.config.wabaId ?? "");
        setPhoneNumberId(j.config.phoneNumberId ?? "");
      }
    } catch (e) {
      setErr(e instanceof Error ? e.message : "שגיאה");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  async function saveSettings() {
    setSavingSettings(true);
    setErr(null);
    setOkMsg(null);
    try {
      const res = await fetch("/api/whatsapp/settings", {
        method: "PUT",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          appId,
          businessAccountId,
          wabaId,
          phoneNumberId,
          systemUserToken: systemUserToken.trim() || undefined,
        }),
      });
      const j = await parseJson<{ ok?: boolean; error?: string; config?: SettingsVm }>(res);
      if (!res.ok || !j.ok || !j.config) throw new Error(j.error || "שמירה נכשלה");
      setSettings(j.config);
      setSystemUserToken("");
      setOkMsg("נשמר.");
      await load();
    } catch (e) {
      setErr(e instanceof Error ? e.message : "שמירה נכשלה");
    } finally {
      setSavingSettings(false);
    }
  }

  return (
    <div>
      <p style={{ margin: "0 0 16px", color: "#4b5563", lineHeight: 1.6, fontSize: 14 }}>
        כאן מזינים את מזהי ה-WABA, מספר השולח ב-Meta, וטוקן גישה לשליחה וליצירת תבניות. הערכים נשמרים במסד הנתונים של העסק הנוכחי.
      </p>
      {err ? (
        <div style={{ marginBottom: 12, padding: 12, borderRadius: 10, background: "#fef2f2", color: "#991b1b" }}>{err}</div>
      ) : null}
      {okMsg ? (
        <div style={{ marginBottom: 12, padding: 12, borderRadius: 10, background: "#ecfdf5", color: "#065f46" }}>{okMsg}</div>
      ) : null}

      {loading ? (
        <div style={{ color: "#6b7280" }}>טוען…</div>
      ) : (
        <div style={{ background: "#fff", border: "1px solid #e5e7eb", borderRadius: 16, padding: 18, display: "grid", gap: 12 }}>
          <div style={{ fontWeight: 900 }}>חיבור Meta</div>
          <input
            value={appId}
            onChange={(e) => setAppId(e.target.value)}
            placeholder="Meta App ID"
            dir="ltr"
            style={{ padding: "10px 12px", borderRadius: 10, border: "1px solid #e5e7eb" }}
          />
          <input
            value={businessAccountId}
            onChange={(e) => setBusinessAccountId(e.target.value)}
            placeholder="Meta Business ID (אופציונלי, מזהה העסק)"
            dir="ltr"
            style={{ padding: "10px 12px", borderRadius: 10, border: "1px solid #e5e7eb" }}
          />
          <input
            value={wabaId}
            onChange={(e) => setWabaId(e.target.value)}
            placeholder="WhatsApp Business Account ID (WABA)"
            dir="ltr"
            style={{ padding: "10px 12px", borderRadius: 10, border: "1px solid #e5e7eb" }}
          />
          <p style={{ margin: 0, fontSize: 12, color: "#6b7280", lineHeight: 1.5 }}>
            WABA: מספר ארוך בלבד (ספרות) מ־API Setup — «WhatsApp Business Account ID». לא להחליף עם Phone Number ID
            שלהלן.
          </p>
          <input
            value={phoneNumberId}
            onChange={(e) => setPhoneNumberId(e.target.value)}
            placeholder="Phone Number ID (מספר השולח ב-API)"
            dir="ltr"
            style={{ padding: "10px 12px", borderRadius: 10, border: "1px solid #e5e7eb" }}
          />
          <input
            value={systemUserToken}
            onChange={(e) => setSystemUserToken(e.target.value)}
            placeholder="System User Access Token — השאר ריק רק כשמעדכנים שדות אחרים ולא רוצים להחליף טוקן"
            dir="ltr"
            style={{ padding: "10px 12px", borderRadius: 10, border: "1px solid #e5e7eb" }}
          />
          <p style={{ margin: 0, fontSize: 12, color: "#92400e", lineHeight: 1.5 }}>
            חובה להדביק כאן טוקן System User עם הרשאות WhatsApp (פעם ראשונה ואחרי רוטציה). בלי טוקן — שמירת
            תבנית ב-CRM תעבוד, אבל «שלח לאישור במטא» ודיוורים לא יעבדו.
          </p>
          <div style={{ fontSize: 13, color: "#6b7280" }}>
            טוקן שמור: {settings?.hasToken ? settings.tokenPreview : "לא הוגדר"}
            {settings?.updatedAt ? ` · עודכן ${formatIsraelDateTime(settings.updatedAt)}` : ""}
          </div>
          <button
            type="button"
            onClick={() => void saveSettings()}
            disabled={savingSettings}
            style={{
              justifySelf: "start",
              padding: "10px 20px",
              borderRadius: 10,
              border: "none",
              background: "linear-gradient(180deg, #a78bfa 0%, #6d28d9 100%)",
              color: "#fff",
              fontWeight: 800,
              cursor: "pointer",
            }}
          >
            {savingSettings ? "שומר..." : "שמור"}
          </button>
        </div>
      )}
    </div>
  );
}
