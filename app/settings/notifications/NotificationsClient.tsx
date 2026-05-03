"use client";

import { useCallback, useEffect, useState } from "react";
import SettingsSectionNav from "@/app/components/SettingsSectionNav";
import {
  loadCrmNotificationPrefs,
  saveCrmNotificationPrefs,
  type CrmNotificationPrefs,
} from "@/app/components/CrmGlobalNotifications";
import { CRM_NOTIFICATION_SCHEMA_VERSION } from "@/lib/crmNotificationPrefsSchema";

type Props = {
  showMovingOrders?: boolean;
  tenantId?: string | null;
};

type DevicePushPrefs = {
  whatsapp: boolean;
  newLead: boolean;
  newOrder: boolean;
  newOpportunity: boolean;
};

type LogEntry = {
  at?: string;
  action?: string;
  permissionVersion?: number | null;
  userAgent?: string | null;
  platform?: string | null;
  language?: string | null;
  deviceFingerprint?: string | null;
};

const VAPID_PUBLIC = process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY?.trim() ?? "";

const DEVICE_FP_KEY = "crm.notify.deviceFp";

function getDeviceFingerprint(): string {
  if (typeof window === "undefined") return "";
  let id = localStorage.getItem(DEVICE_FP_KEY)?.trim();
  if (!id) {
    id =
      typeof crypto !== "undefined" && crypto.randomUUID
        ? crypto.randomUUID()
        : `fp-${Date.now()}`;
    localStorage.setItem(DEVICE_FP_KEY, id);
  }
  return id;
}

async function logNotificationPermission(
  action: "request" | "granted" | "denied" | "default" | "unsupported"
): Promise<void> {
  await fetch("/api/settings/notification-permission-log", {
    method: "POST",
    credentials: "include",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      action,
      permissionVersion: CRM_NOTIFICATION_SCHEMA_VERSION,
      userAgent: typeof navigator !== "undefined" ? navigator.userAgent : "",
      platform: typeof navigator !== "undefined" ? navigator.platform : "",
      language: typeof navigator !== "undefined" ? navigator.language : "",
      deviceFingerprint: getDeviceFingerprint(),
    }),
  }).catch(() => {});
}

function urlBase64ToUint8Array(base64String: string): Uint8Array {
  const padding = "=".repeat((4 - (base64String.length % 4)) % 4);
  const base64 = (base64String + padding).replace(/-/g, "+").replace(/_/g, "/");
  const rawData = window.atob(base64);
  const outputArray = new Uint8Array(rawData.length);
  for (let i = 0; i < rawData.length; ++i) outputArray[i] = rawData.charCodeAt(i);
  return outputArray;
}

async function parseJson<T>(res: Response): Promise<T> {
  return (await res.json()) as T;
}

export default function NotificationsClient({ showMovingOrders, tenantId = null }: Props) {
  const hideWhatsAppNotificationPrefs = tenantId === "hot-afik";
  const [prefs, setPrefs] = useState<CrmNotificationPrefs>(() => loadCrmNotificationPrefs());
  const [isAdmin, setIsAdmin] = useState(false);
  const [resetBusy, setResetBusy] = useState(false);
  const [resetMsg, setResetMsg] = useState<string | null>(null);
  const [perm, setPerm] = useState<NotificationPermission | "unsupported">("default");
  const [devicePrefs, setDevicePrefs] = useState<DevicePushPrefs>({
    whatsapp: true,
    newLead: true,
    newOrder: true,
    newOpportunity: true,
  });
  const [pushConfigured, setPushConfigured] = useState(false);
  const [subscriptionCount, setSubscriptionCount] = useState(0);
  const [pushBusy, setPushBusy] = useState(false);
  const [pushMsg, setPushMsg] = useState<string | null>(null);
  const [permLog, setPermLog] = useState<LogEntry[]>([]);
  const [permLast, setPermLast] = useState<LogEntry | null>(null);
  const [logLoading, setLogLoading] = useState(false);

  const refreshPermissionLog = useCallback(async () => {
    setLogLoading(true);
    try {
      const res = await fetch("/api/settings/notification-permission-log", {
        credentials: "include",
        cache: "no-store",
      });
      const j = await parseJson<{ ok?: boolean; log?: LogEntry[]; last?: LogEntry | null }>(res);
      if (res.ok && j.ok) {
        setPermLog(j.log ?? []);
        setPermLast(j.last ?? null);
      }
    } finally {
      setLogLoading(false);
    }
  }, []);

  useEffect(() => {
    setPrefs(loadCrmNotificationPrefs());
    if (typeof Notification === "undefined") setPerm("unsupported");
    else setPerm(Notification.permission);
    void refreshPermissionLog();
    void (async () => {
      try {
        const res = await fetch("/api/auth/me", { credentials: "include", cache: "no-store" });
        const j = (await res.json().catch(() => ({}))) as { ok?: boolean; isAdmin?: boolean };
        if (res.ok && j.ok && j.isAdmin) setIsAdmin(true);
      } catch {
        /* ignore */
      }
    })();
  }, [refreshPermissionLog]);

  const loadPushState = useCallback(async () => {
    try {
      const res = await fetch("/api/push/prefs", { credentials: "include", cache: "no-store" });
      const j = await parseJson<{
        ok?: boolean;
        webPushConfigured?: boolean;
        prefs?: DevicePushPrefs;
        subscriptionCount?: number;
      }>(res);
      if (!res.ok || !j.ok) return;
      setPushConfigured(Boolean(j.webPushConfigured));
      if (j.prefs) setDevicePrefs(j.prefs);
      setSubscriptionCount(typeof j.subscriptionCount === "number" ? j.subscriptionCount : 0);
    } catch {
      /* ignore */
    }
  }, []);

  useEffect(() => {
    void loadPushState();
  }, [loadPushState]);

  const persist = useCallback((next: CrmNotificationPrefs) => {
    setPrefs(next);
    saveCrmNotificationPrefs(next);
  }, []);

  const persistBrowserToggles = useCallback(
    (next: CrmNotificationPrefs) => {
      const anyBrowser =
        (hideWhatsAppNotificationPrefs ? false : next.browserWhatsApp) ||
        next.browserNewLead ||
        next.browserNewOpportunity ||
        next.browserNewOrder;
      let out = { ...next };
      if (typeof Notification !== "undefined" && anyBrowser && Notification.permission !== "granted") {
        out = { ...out, schemaVersion: 0 };
      } else if (typeof Notification !== "undefined" && anyBrowser && Notification.permission === "granted") {
        out = { ...out, schemaVersion: CRM_NOTIFICATION_SCHEMA_VERSION };
      }
      persist(out);
    },
    [persist, hideWhatsAppNotificationPrefs]
  );

  const patchDevicePrefs = useCallback(async (next: DevicePushPrefs) => {
    setDevicePrefs(next);
    try {
      const res = await fetch("/api/push/prefs", {
        method: "PATCH",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(next),
      });
      const j = await parseJson<{ ok?: boolean; prefs?: DevicePushPrefs }>(res);
      if (res.ok && j.ok && j.prefs) setDevicePrefs(j.prefs);
    } catch {
      /* ignore */
    }
  }, []);

  const requestBrowserPermission = useCallback(async () => {
    if (typeof Notification === "undefined") {
      await logNotificationPermission("unsupported");
      return;
    }
    await logNotificationPermission("request");
    try {
      const p = await Notification.requestPermission();
      setPerm(p);
      if (p === "granted") await logNotificationPermission("granted");
      else if (p === "denied") await logNotificationPermission("denied");
      else await logNotificationPermission("default");
      const cur = loadCrmNotificationPrefs();
      if (p === "granted") {
        persist({ ...cur, schemaVersion: CRM_NOTIFICATION_SCHEMA_VERSION });
        setPrefs(loadCrmNotificationPrefs());
      }
      await refreshPermissionLog();
    } catch {
      setPerm("denied");
      await logNotificationPermission("denied");
      await refreshPermissionLog();
    }
  }, [persist, refreshPermissionLog]);

  const registerWebPush = useCallback(async () => {
    setPushMsg(null);
    if (!VAPID_PUBLIC) {
      setPushMsg("חסר מפתח VAPID בשרת — הגדרו NEXT_PUBLIC_VAPID_PUBLIC_KEY ו־VAPID_PRIVATE_KEY.");
      return;
    }
    if (!("serviceWorker" in navigator) || !("PushManager" in window)) {
      setPushMsg("הדפדפן לא תומך ב־Web Push.");
      return;
    }
    setPushBusy(true);
    try {
      await logNotificationPermission("request");
      const p = await Notification.requestPermission();
      setPerm(p);
      if (p !== "granted") {
        await logNotificationPermission("default");
        setPushMsg("לא אושרה הרשאת התראות — לא ניתן להפעיל דחיפה למכשיר.");
        await refreshPermissionLog();
        return;
      }
      await logNotificationPermission("granted");
      const regs = await navigator.serviceWorker.getRegistrations();
      await Promise.all(regs.map((r) => r.unregister()));
      const reg = await navigator.serviceWorker.register("/crm-push-sw.js", { scope: "/" });
      await reg.update();
      const existing = await reg.pushManager.getSubscription();
      if (existing) await existing.unsubscribe();
      const applicationServerKey = urlBase64ToUint8Array(VAPID_PUBLIC) as BufferSource;
      const sub = await reg.pushManager.subscribe({
        userVisibleOnly: true,
        applicationServerKey,
      });
      const res = await fetch("/api/push/subscribe", {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          subscription: sub.toJSON(),
          devicePushPrefs: devicePrefs,
        }),
      });
      const j = await parseJson<{ ok?: boolean; error?: string }>(res);
      if (!res.ok || !j.ok) throw new Error(j.error || "הרשמה נכשלה");
      setPushMsg("התראות דחיפה הופעלו למכשיר זה.");
      const cur = loadCrmNotificationPrefs();
      persist({ ...cur, schemaVersion: CRM_NOTIFICATION_SCHEMA_VERSION });
      setPrefs(loadCrmNotificationPrefs());
      await loadPushState();
      await refreshPermissionLog();
    } catch (e) {
      setPushMsg(e instanceof Error ? e.message : "הרשמה נכשלה");
    } finally {
      setPushBusy(false);
    }
  }, [devicePrefs, loadPushState, persist, refreshPermissionLog]);

  const resetAllDeviceSubscriptions = useCallback(async () => {
    if (!isAdmin) return;
    if (!window.confirm("לאפס את כל מנויי הדחיפה לכל המשתמשים בטננט? כל אחד יצטרך שוב «הפעל התראות דחיפה למכשיר».")) {
      return;
    }
    setResetBusy(true);
    setResetMsg(null);
    try {
      const res = await fetch("/api/push/reset-all-subscriptions", {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ confirm: true }),
      });
      const j = await parseJson<{ ok?: boolean; usersUpdated?: number; error?: string }>(res);
      if (!res.ok || !j.ok) throw new Error(j.error || "איפוס נכשל");
      setResetMsg(`אופסו מנויים אצל ${j.usersUpdated ?? 0} משתמשים.`);
    } catch (e) {
      setResetMsg(e instanceof Error ? e.message : "איפוס נכשל");
    } finally {
      setResetBusy(false);
    }
  }, [isAdmin]);

  const row = (label: string, description: string, checked: boolean, onChange: (v: boolean) => void) => (
    <label
      style={{
        display: "grid",
        gap: 6,
        padding: "14px 16px",
        borderRadius: 12,
        border: "1px solid #e5e7eb",
        background: "#fafafa",
        cursor: "pointer",
      }}
    >
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 12 }}>
        <span style={{ fontWeight: 700, fontSize: 15 }}>{label}</span>
        <input
          type="checkbox"
          checked={checked}
          onChange={(e) => onChange(e.target.checked)}
          style={{ width: 18, height: 18 }}
        />
      </div>
      <span style={{ fontSize: 13, color: "#6b7280", lineHeight: 1.45 }}>{description}</span>
    </label>
  );

  const browserNeedsConsent =
    prefs.schemaVersion < CRM_NOTIFICATION_SCHEMA_VERSION &&
    ((hideWhatsAppNotificationPrefs ? false : prefs.browserWhatsApp) ||
      prefs.browserNewLead ||
      prefs.browserNewOpportunity ||
      prefs.browserNewOrder);

  return (
    <>
      <SettingsSectionNav active="notifications" showMovingOrders={showMovingOrders} />
      <div style={{ maxWidth: 720 }}>
        <h1 style={{ margin: "0 0 8px", fontSize: 24, fontWeight: 800 }}>התראות</h1>
        <p style={{ margin: "0 0 22px", fontSize: 14, color: "#6b7280", lineHeight: 1.55 }}>
          התראות צפות בתוך ה־CRM (בחלק העליון של המסך), ובנוסף אפשר התראות מהדפדפן או דחיפה אמיתית למכשיר כשהמערכת
          סגורה — ראו למטה.
        </p>
        <div
          style={{
            marginBottom: 20,
            padding: 14,
            borderRadius: 12,
            border: "1px solid #bfdbfe",
            background: "#eff6ff",
            color: "#1e3a5f",
            fontSize: 13,
            lineHeight: 1.55,
          }}
        >
          <strong>דחיפה לטלפון (אנדרואיד / iOS):</strong> זה מתבצע דרך <strong>Web Push</strong> (דפדפן או אפליקציית
          הבית). <strong>אין דרך לאתר</strong> לשכפל את התנהגות «התראות חירום» של המדינה — זה ערוץ סלולרי נפרד.
          ב־<strong>מצב «נא לא להפריע»</strong> או כשהמסך כבוי, מה שיקרה תלוי ב־Android / iOS ובהגדרות הדפדפן (Chrome
          וכו׳); לעיתים ההתראה תגיע בשקט או רק ברקע. ב־<strong>iPhone</strong> מומלץ להוסיף את האתר ל־
          <strong>מסך הבית</strong> ולפתוח ממנו — כך דחיפה ברקע עובדת טוב יותר מאשר טאב רגיל בספארי.
        </div>

        {browserNeedsConsent ? (
          <div
            style={{
              marginBottom: 18,
              padding: 14,
              borderRadius: 12,
              background: "#fffbeb",
              border: "1px solid #fcd34d",
              color: "#92400e",
              fontSize: 14,
              lineHeight: 1.5,
            }}
          >
            נוספו סוגי התראות חדשים (גרסה {CRM_NOTIFICATION_SCHEMA_VERSION}). יש לאשר שוב הרשאת דפדפן כדי לקבל
            התראות מערכת — לחצו על &quot;בקש הרשאת התראות מהדפדפן&quot; למטה.
          </div>
        ) : null}

        <section style={{ marginBottom: 28 }}>
          <h2 style={{ fontSize: 16, fontWeight: 800, margin: "0 0 12px" }}>בתוך המערכת</h2>
          <div style={{ display: "grid", gap: 10 }}>
            {!hideWhatsAppNotificationPrefs
              ? row(
                  "התראה צפה — הודעת וואטסאפ נכנסת",
                  "כרטיס בראש המסך עם מספר השולח וכפתור מעבר לצ׳אטים.",
                  prefs.inAppWhatsApp,
                  (v) => persist({ ...prefs, inAppWhatsApp: v })
                )
              : null}
            {row(
              "התראה צפה — ליד חדש",
              "כרטיס כשנוצר איש קשר חדש (הליד העדכני ביותר במערכת השתנה).",
              prefs.inAppNewLead,
              (v) => persist({ ...prefs, inAppNewLead: v })
            )}
            {row(
              "התראה צפה — הזדמנות חדשה",
              "כרטיס כשנוצרת הזדמנות חדשה.",
              prefs.inAppNewOpportunity,
              (v) => persist({ ...prefs, inAppNewOpportunity: v })
            )}
            {showMovingOrders
              ? row(
                  "התראה צפה — הזמנה חדשה",
                  "כרטיס כשנוצרת הזמנת הובלה חדשה.",
                  prefs.inAppNewOrder,
                  (v) => persist({ ...prefs, inAppNewOrder: v })
                )
              : null}
          </div>
        </section>

        <section style={{ marginBottom: 28 }}>
          <h2 style={{ fontSize: 16, fontWeight: 800, margin: "0 0 12px" }}>
            התראות דחיפה למכשיר (Web Push)
          </h2>
          <p style={{ margin: "0 0 12px", fontSize: 13, color: "#6b7280", lineHeight: 1.55 }}>
            כאן נשלחות התראות דרך <strong>שרת</strong> — גם כשהדפדפן ברקע, המסך כבוי או (במכשירים נתמכים) במסך נעילה.
            <strong> מצב «נא לא להפריע»</strong> ועדיפות התראה נקבעים בהגדרות <strong>מערכת ההפעלה</strong> ובאפליקציית
            הדפדפן (Chrome/Safari); לא ניתן לעקוף אותם מתוך האתר. ב־iOS מומלץ להוסיף את האתר למסך הבית (PWA)
            כדי לקבל דחיפה ברקע.
          </p>
          {!VAPID_PUBLIC || !pushConfigured ? (
            <div
              style={{
                marginBottom: 12,
                padding: 12,
                borderRadius: 10,
                background: "#fffbeb",
                color: "#92400e",
                fontSize: 13,
                lineHeight: 1.5,
              }}
            >
              להפעלת דחיפה יש להגדיר ב־Vercel / בשרת: <code dir="ltr">NEXT_PUBLIC_VAPID_PUBLIC_KEY</code>,{" "}
              <code dir="ltr">VAPID_PRIVATE_KEY</code>, ואופציונלית <code dir="ltr">VAPID_SUBJECT</code> (למשל
              mailto:). יצירת מפתחות: <code dir="ltr">npx web-push generate-vapid-keys</code>.
            </div>
          ) : null}
          <div style={{ display: "grid", gap: 10, marginBottom: 14 }}>
            {!hideWhatsAppNotificationPrefs
              ? row(
                  "דחיפה — הודעת וואטסאפ נכנסת",
                  "נשלח כשנכנסת הודעה לווטסאפ העסקי (אחרי אישור הרשמה למטה).",
                  devicePrefs.whatsapp,
                  (v) => void patchDevicePrefs({ ...devicePrefs, whatsapp: v })
                )
              : null}
            {row(
              "דחיפה — ליד חדש",
              "נשלח כשנוצר איש קשר חדש במסד הנוכחי.",
              devicePrefs.newLead,
              (v) => void patchDevicePrefs({ ...devicePrefs, newLead: v })
            )}
            {row(
              "דחיפה — הזדמנות חדשה",
              "נשלח כשנוצרת הזדמנות חדשה.",
              devicePrefs.newOpportunity,
              (v) => void patchDevicePrefs({ ...devicePrefs, newOpportunity: v })
            )}
            {showMovingOrders ? (
              row(
                "דחיפה — הזמנה חדשה",
                "נשלח כשנוצרת הזמנת הובלה חדשה (קליטה / ידני).",
                devicePrefs.newOrder,
                (v) => void patchDevicePrefs({ ...devicePrefs, newOrder: v })
              )
            ) : null}
          </div>
          <button
            type="button"
            onClick={() => void registerWebPush()}
            disabled={pushBusy || !VAPID_PUBLIC || !pushConfigured}
            style={{
              padding: "10px 16px",
              borderRadius: 10,
              border: "none",
              fontWeight: 700,
              cursor: pushBusy || !VAPID_PUBLIC || !pushConfigured ? "not-allowed" : "pointer",
              background:
                pushBusy || !VAPID_PUBLIC || !pushConfigured
                  ? "#e5e7eb"
                  : "linear-gradient(180deg, #0d9488 0%, #0f766e 100%)",
              color: pushBusy || !VAPID_PUBLIC || !pushConfigured ? "#6b7280" : "#fff",
            }}
          >
            {pushBusy ? "מרשם…" : "הפעל התראות דחיפה למכשיר (אישור הרשאות)"}
          </button>
          {subscriptionCount > 0 ? (
            <p style={{ margin: "10px 0 0", fontSize: 12, color: "#059669", fontWeight: 600 }}>
              מכשיר זה רשום לדחיפה ({subscriptionCount} מנוי).
            </p>
          ) : null}
          {pushMsg ? (
            <p style={{ margin: "10px 0 0", fontSize: 13, color: pushMsg.includes("נכשל") ? "#b91c1c" : "#0369a1" }}>
              {pushMsg}
            </p>
          ) : null}
          {isAdmin ? (
            <div style={{ marginTop: 16, paddingTop: 14, borderTop: "1px solid #e5e7eb" }}>
              <div style={{ fontWeight: 800, marginBottom: 8, fontSize: 14 }}>מנהל מערכת</div>
              <p style={{ margin: "0 0 10px", fontSize: 13, color: "#6b7280", lineHeight: 1.5 }}>
                איפוס מנויי דחיפה לכל המשתמשים בטננט הנוכחי — כדי שכולם יאשרו מחדש מהטלפון אחרי עדכון.
              </p>
              <button
                type="button"
                disabled={resetBusy || !pushConfigured}
                onClick={() => void resetAllDeviceSubscriptions()}
                style={{
                  padding: "8px 14px",
                  borderRadius: 8,
                  border: "1px solid #fecaca",
                  background: resetBusy || !pushConfigured ? "#f3f4f6" : "#fff",
                  color: "#991b1b",
                  fontWeight: 700,
                  cursor: resetBusy || !pushConfigured ? "not-allowed" : "pointer",
                  fontSize: 13,
                }}
              >
                {resetBusy ? "מאפס…" : "אפס מנויי דחיפה לכל המשתמשים"}
              </button>
              {resetMsg ? (
                <p style={{ margin: "8px 0 0", fontSize: 13, color: resetMsg.includes("נכשל") ? "#b91c1c" : "#0369a1" }}>
                  {resetMsg}
                </p>
              ) : null}
            </div>
          ) : null}
        </section>

        <section style={{ marginBottom: 28 }}>
          <h2 style={{ fontSize: 16, fontWeight: 800, margin: "0 0 12px" }}>התראות דפדפן (לשונית פתוחה)</h2>
          <div
            style={{
              padding: "14px 16px",
              borderRadius: 12,
              border: "1px solid #e5e7eb",
              background: "#fff",
              marginBottom: 12,
            }}
          >
            <div style={{ fontWeight: 700, marginBottom: 8 }}>הרשאת התראות</div>
            <p style={{ margin: "0 0 12px", fontSize: 13, color: "#6b7280", lineHeight: 1.5 }}>
              אלה התראות מערכת של הדפדפן בזמן שיש לשונית פתוחה או ברקע קרוב — לא תחליף מלא לדחיפה כשהאפליקציה
              סגורה.
            </p>
            {perm === "unsupported" ? (
              <div style={{ fontSize: 13, color: "#b45309" }}>הדפדפן אינו תומך ב־Notification API.</div>
            ) : (
              <>
                <div style={{ fontSize: 13, marginBottom: 10 }}>
                  סטטוס נוכחי:{" "}
                  <strong dir="ltr">
                    {perm === "granted" ? "מאושר" : perm === "denied" ? "חסום" : "לא נשאל"}
                  </strong>
                </div>
                <button
                  type="button"
                  onClick={() => void requestBrowserPermission()}
                  disabled={perm === "denied"}
                  style={{
                    padding: "10px 16px",
                    borderRadius: 10,
                    border: "none",
                    fontWeight: 700,
                    cursor: perm === "denied" ? "not-allowed" : "pointer",
                    background:
                      perm === "denied"
                        ? "#e5e7eb"
                        : "linear-gradient(180deg, #a78bfa 0%, #6d28d9 100%)",
                    color: perm === "denied" ? "#6b7280" : "#fff",
                  }}
                >
                  בקש הרשאת התראות מהדפדפן
                </button>
                {perm === "denied" ? (
                  <p style={{ margin: "10px 0 0", fontSize: 12, color: "#b45309" }}>
                    ההרשאה נחסמה בהגדרות הדפדפן או המכשיר — יש לאפשר שם ידנית.
                  </p>
                ) : null}
              </>
            )}
          </div>
          <div style={{ display: "grid", gap: 10 }}>
            {!hideWhatsAppNotificationPrefs
              ? row(
                  "התראת דפדפן — וואטסאפ",
                  "מופעל רק אם ההרשאה מאושרת וגם אפשרות זו מסומנת.",
                  prefs.browserWhatsApp,
                  (v) => persistBrowserToggles({ ...prefs, browserWhatsApp: v })
                )
              : null}
            {row(
              "התראת דפדפן — ליד חדש",
              "מופעל רק אם ההרשאה מאושרת וגם אפשרות זו מסומנת.",
              prefs.browserNewLead,
              (v) => persistBrowserToggles({ ...prefs, browserNewLead: v })
            )}
            {row(
              "התראת דפדפן — הזדמנות חדשה",
              "מופעל רק אם ההרשאה מאושרת וגם אפשרות זו מסומנת.",
              prefs.browserNewOpportunity,
              (v) => persistBrowserToggles({ ...prefs, browserNewOpportunity: v })
            )}
            {showMovingOrders ? (
              row(
                "התראת דפדפן — הזמנה חדשה",
                "מופעל רק אם ההרשאה מאושרת וגם אפשרות זו מסומנת.",
                prefs.browserNewOrder,
                (v) => persistBrowserToggles({ ...prefs, browserNewOrder: v })
              )
            ) : null}
          </div>
        </section>

        <section>
          <h2 style={{ fontSize: 16, fontWeight: 800, margin: "0 0 12px" }}>יומן בקשות הרשאה (בשרת)</h2>
          <p style={{ fontSize: 13, color: "#6b7280", marginBottom: 10, lineHeight: 1.5 }}>
            נשמר תחת מסמך המשתמש שלך — זמן, פעולה, טביעת מכשיר, ודפדפן.
          </p>
          <button
            type="button"
            onClick={() => void refreshPermissionLog()}
            disabled={logLoading}
            style={{
              marginBottom: 10,
              padding: "8px 14px",
              borderRadius: 8,
              border: "1px solid #e5e7eb",
              background: "#fff",
              cursor: logLoading ? "wait" : "pointer",
            }}
          >
            רענן יומן
          </button>
          {permLast?.at ? (
            <div style={{ fontSize: 13, marginBottom: 10, color: "#374151" }}>
              <strong>אחרון:</strong> {String(permLast.action)} · {permLast.at}
              {permLast.deviceFingerprint ? (
                <>
                  {" "}
                  · מכשיר <code dir="ltr">{String(permLast.deviceFingerprint).slice(0, 10)}…</code>
                </>
              ) : null}
            </div>
          ) : null}
          <div style={{ maxHeight: 260, overflow: "auto", border: "1px solid #e5e7eb", borderRadius: 10 }}>
            {logLoading ? (
              <div style={{ padding: 12 }}>טוען…</div>
            ) : permLog.length === 0 ? (
              <div style={{ padding: 12, color: "#6b7280" }}>אין רישומים.</div>
            ) : (
              <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 12 }}>
                <thead>
                  <tr style={{ background: "#f3f4f6", textAlign: "right" }}>
                    <th style={{ padding: 8 }}>זמן</th>
                    <th style={{ padding: 8 }}>פעולה</th>
                    <th style={{ padding: 8 }}>מכשיר</th>
                  </tr>
                </thead>
                <tbody>
                  {[...permLog].reverse().map((rowItem, i) => (
                    <tr key={i} style={{ borderTop: "1px solid #eee" }}>
                      <td style={{ padding: 8 }} dir="ltr">
                        {rowItem.at ?? "—"}
                      </td>
                      <td style={{ padding: 8 }}>{rowItem.action ?? "—"}</td>
                      <td style={{ padding: 8 }} dir="ltr">
                        {(rowItem.deviceFingerprint ?? "").slice(0, 8) || "—"}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>
        </section>
      </div>
    </>
  );
}
