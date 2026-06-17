"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { useRouter } from "next/navigation";
import { mutate } from "swr";
import { CRM_NOTIFICATION_SCHEMA_VERSION } from "@/lib/crmNotificationPrefsSchema";

const PREFS_KEY = "liftygo_crm_notification_prefs";

export type CrmNotificationPrefs = {
  /** גרסת סכימה — מתחת לערך הנוכחי יוצג בקשה לאשר מחדש (דפדפן) */
  schemaVersion: number;
  inAppWhatsApp: boolean;
  inAppNewLead: boolean;
  inAppNewOpportunity: boolean;
  inAppNewOrder: boolean;
  browserWhatsApp: boolean;
  browserNewLead: boolean;
  browserNewOpportunity: boolean;
  browserNewOrder: boolean;
};

function defaultPrefs(): CrmNotificationPrefs {
  return {
    schemaVersion: CRM_NOTIFICATION_SCHEMA_VERSION,
    inAppWhatsApp: true,
    inAppNewLead: true,
    inAppNewOpportunity: true,
    inAppNewOrder: true,
    browserWhatsApp: false,
    browserNewLead: false,
    browserNewOpportunity: false,
    browserNewOrder: false,
  };
}

export function saveCrmNotificationPrefs(p: CrmNotificationPrefs) {
  if (typeof window === "undefined") return;
  localStorage.setItem(PREFS_KEY, JSON.stringify(p));
  window.dispatchEvent(new Event("liftygo-crm-prefs-updated"));
}

export function loadCrmNotificationPrefs(): CrmNotificationPrefs {
  if (typeof window === "undefined") return defaultPrefs();
  try {
    const raw = localStorage.getItem(PREFS_KEY);
    if (!raw) return defaultPrefs();
    const j = JSON.parse(raw) as Partial<CrmNotificationPrefs> & Record<string, unknown>;
    const base = defaultPrefs();
    const hasLegacy = !("schemaVersion" in j);
    const schemaVersion =
      typeof j.schemaVersion === "number" && Number.isFinite(j.schemaVersion)
        ? j.schemaVersion
        : hasLegacy
          ? 0
          : CRM_NOTIFICATION_SCHEMA_VERSION;
    return {
      ...base,
      schemaVersion,
      inAppWhatsApp: j.inAppWhatsApp !== false,
      inAppNewLead: j.inAppNewLead !== false,
      inAppNewOpportunity: j.inAppNewOpportunity !== false,
      inAppNewOrder: j.inAppNewOrder !== false,
      browserWhatsApp: Boolean(j.browserWhatsApp),
      browserNewLead: Boolean(j.browserNewLead),
      browserNewOpportunity: Boolean(j.browserNewOpportunity),
      browserNewOrder: Boolean(j.browserNewOrder),
    };
  } catch {
    return defaultPrefs();
  }
}

type PollWa = {
  id: string;
  phone: string;
  contactName?: string;
  lastInboundAt: string | null;
  lastMessageAt: string;
  unreadCount: number;
};

type WaBaselineSnap = {
  lastInboundAt: string | null;
  lastMessageAt: string;
  unreadCount: number;
};

type PollLead = { id: string; name: string; phone: string; createdAt: string };

type PollOpportunity = { id: string; name: string; contactName: string; createdAt: string };

type PollOrder = { id: string; orderId: string; name: string; phone: string; createdAt: string };

type PollOk = {
  ok: true;
  whatsapp: PollWa[];
  latestLead: PollLead | null;
  latestOpportunity: PollOpportunity | null;
  latestOrder: PollOrder | null;
};

type InAppToast = {
  id: string;
  kind: "wa" | "lead" | "opp" | "order";
  title: string;
  body: string;
  threadId?: string;
  leadId?: string;
  opportunityId?: string;
  orderId?: string;
};

async function parseJson<T>(res: Response): Promise<T> {
  return (await res.json()) as T;
}

function pushBrowserNotification(title: string, body: string, tag: string) {
  if (typeof window === "undefined" || typeof Notification === "undefined") return;
  if (Notification.permission !== "granted") return;
  try {
    new Notification(title, { body, tag, dir: "rtl" });
  } catch {
    /* ignore */
  }
}

type CrmGlobalNotificationsProps = { tenantId?: string | null };

export default function CrmGlobalNotifications({ tenantId = null }: CrmGlobalNotificationsProps) {
  const router = useRouter();
  const [mounted, setMounted] = useState(false);
  const [toasts, setToasts] = useState<InAppToast[]>([]);
  const initRef = useRef(false);
  const tenantIdRef = useRef(tenantId);
  tenantIdRef.current = tenantId;
  const waBaselineRef = useRef<Map<string, WaBaselineSnap>>(new Map());
  const leadBaselineRef = useRef<{ id: string; createdAt: string }>({ id: "", createdAt: "" });
  const oppBaselineRef = useRef<{ id: string; createdAt: string }>({ id: "", createdAt: "" });
  const orderBaselineRef = useRef<{ id: string; createdAt: string }>({ id: "", createdAt: "" });
  const prefsRef = useRef(loadCrmNotificationPrefs());

  useEffect(() => {
    setMounted(true);
  }, []);

  const dismissToast = useCallback((id: string) => {
    setToasts((prev) => prev.filter((t) => t.id !== id));
  }, []);

  const addToast = useCallback((t: Omit<InAppToast, "id">) => {
    const id = `${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;
    setToasts((prev) => [{ ...t, id }, ...prev].slice(0, 5));
    window.setTimeout(() => dismissToast(id), 12_000);
  }, [dismissToast]);

  const poll = useCallback(async () => {
    prefsRef.current = loadCrmNotificationPrefs();
    const prefs = prefsRef.current;
    const res = await fetch("/api/crm/notifications/poll", { credentials: "include", cache: "no-store" });
    if (res.status === 401) return;
    const j = await parseJson<PollOk | { ok: false; error?: string }>(res);
    if (!res.ok || !j.ok || !("whatsapp" in j)) return;

    const snapFor = (t: PollWa): WaBaselineSnap => ({
      lastInboundAt: t.lastInboundAt ?? null,
      lastMessageAt: t.lastMessageAt,
      unreadCount: Number(t.unreadCount ?? 0),
    });
    const nextWaMap = new Map<string, WaBaselineSnap>(j.whatsapp.map((t) => [t.id, snapFor(t)]));

    if (!initRef.current) {
      waBaselineRef.current = new Map(nextWaMap);
      if (j.latestLead) {
        leadBaselineRef.current = { id: j.latestLead.id, createdAt: j.latestLead.createdAt };
      } else {
        leadBaselineRef.current = { id: "__none__", createdAt: "" };
      }
      if (j.latestOpportunity) {
        oppBaselineRef.current = { id: j.latestOpportunity.id, createdAt: j.latestOpportunity.createdAt };
      } else {
        oppBaselineRef.current = { id: "__none__", createdAt: "" };
      }
      if (j.latestOrder) {
        orderBaselineRef.current = { id: j.latestOrder.id, createdAt: j.latestOrder.createdAt };
      } else {
        orderBaselineRef.current = { id: "__none__", createdAt: "" };
      }
      initRef.current = true;
      return;
    }

    const prevAll = waBaselineRef.current;
    const nextBaseline = new Map(prevAll);

    for (const t of j.whatsapp) {
      const prev = prevAll.get(t.id);
      const curIn = t.lastInboundAt ?? null;
      const curUn = Number(t.unreadCount ?? 0);
      const prevUn = prev?.unreadCount ?? 0;
      const inboundTimeAdvanced =
        curIn != null &&
        (!prev?.lastInboundAt || (prev.lastInboundAt != null && curIn > prev.lastInboundAt));
      const unreadRose = curUn > prevUn;
      /** שיחה חדשה שלא הייתה במפה; אחרת רק עליית unread או זמן הודעת לקוח */
      const newThreadFirstSeen = !prev && (curUn > 0 || Boolean(curIn));
      const looksNewInbound = inboundTimeAdvanced || unreadRose || newThreadFirstSeen;

      if (looksNewInbound) {
        const waMutedForTenant = tenantIdRef.current === "hot-afik";
        const label = t.contactName?.trim() || t.phone;
        if (!waMutedForTenant && prefs.inAppWhatsApp) {
          addToast({
            kind: "wa",
            title: "הודעת וואטסאפ חדשה",
            body: `מספר: ${t.phone}${t.contactName ? ` · ${t.contactName}` : ""}`,
            threadId: t.id,
          });
        }
        if (
          !waMutedForTenant &&
          prefs.browserWhatsApp &&
          prefs.schemaVersion >= CRM_NOTIFICATION_SCHEMA_VERSION
        ) {
          const tagKey = curIn || `${t.lastMessageAt}-${curUn}`;
          pushBrowserNotification("הודעת וואטסאפ חדשה", `מ־${label}`, `wa-${t.id}-${tagKey}`);
        }
      }
      nextBaseline.set(t.id, snapFor(t));
    }
    waBaselineRef.current = nextBaseline;

    if (j.latestLead) {
      const prev = leadBaselineRef.current;
      if (j.latestLead.id !== prev.id) {
        if (prefs.inAppNewLead) {
          addToast({
            kind: "lead",
            title: "ליד חדש נכנס",
            body: `${j.latestLead.name || "ללא שם"} · ${j.latestLead.phone || "—"}`,
            leadId: j.latestLead.id,
          });
        }
        if (prefs.browserNewLead && prefs.schemaVersion >= CRM_NOTIFICATION_SCHEMA_VERSION) {
          pushBrowserNotification(
            "ליד חדש ב־CRM",
            `${j.latestLead.name || "ללא שם"} · ${j.latestLead.phone || "—"}`,
            `lead-${j.latestLead.id}`
          );
        }
      }
      leadBaselineRef.current = { id: j.latestLead.id, createdAt: j.latestLead.createdAt };
    }

    if (j.latestOpportunity) {
      const prev = oppBaselineRef.current;
      if (j.latestOpportunity.id !== prev.id) {
        if (prefs.inAppNewOpportunity) {
          addToast({
            kind: "opp",
            title: "הזדמנות חדשה",
            body: `${j.latestOpportunity.name || "ללא שם"}${j.latestOpportunity.contactName ? ` · ${j.latestOpportunity.contactName}` : ""}`,
            opportunityId: j.latestOpportunity.id,
          });
        }
        if (prefs.browserNewOpportunity && prefs.schemaVersion >= CRM_NOTIFICATION_SCHEMA_VERSION) {
          pushBrowserNotification(
            "הזדמנות חדשה ב־CRM",
            `${j.latestOpportunity.name || "ללא שם"}`,
            `opp-${j.latestOpportunity.id}`
          );
        }
      }
      oppBaselineRef.current = { id: j.latestOpportunity.id, createdAt: j.latestOpportunity.createdAt };
    }

    if (j.latestOrder) {
      const prev = orderBaselineRef.current;
      if (j.latestOrder.id !== prev.id) {
        if (prefs.inAppNewOrder) {
          addToast({
            kind: "order",
            title: "הזמנה חדשה",
            body: `${j.latestOrder.orderId}${j.latestOrder.name ? ` · ${j.latestOrder.name}` : ""}`,
            orderId: j.latestOrder.id,
          });
        }
        if (prefs.browserNewOrder && prefs.schemaVersion >= CRM_NOTIFICATION_SCHEMA_VERSION) {
          pushBrowserNotification(
            "הזמנה חדשה במערכת",
            `${j.latestOrder.orderId}`,
            `order-${j.latestOrder.id}`
          );
        }
        /** אותו poll כבר רץ כל ~4ש׳ — מרענן את רשימות ההזמנות בלי להמתין ל־focus */
        void mutate("crm-moving-orders");
        void mutate("crm-moving-orders-by-opportunities");
      }
      orderBaselineRef.current = { id: j.latestOrder.id, createdAt: j.latestOrder.createdAt };
    }
  }, [addToast]);

  useEffect(() => {
    const refresh = () => {
      prefsRef.current = loadCrmNotificationPrefs();
    };
    const onStorage = (e: StorageEvent) => {
      if (e.key === PREFS_KEY) refresh();
    };
    window.addEventListener("storage", onStorage);
    window.addEventListener("liftygo-crm-prefs-updated", refresh);
    return () => {
      window.removeEventListener("storage", onStorage);
      window.removeEventListener("liftygo-crm-prefs-updated", refresh);
    };
  }, []);

  useEffect(() => {
    let cancelled = false;
    const tick = () => {
      if (cancelled) return;
      void poll().catch(() => {});
    };
    tick();
    const ms = () => (document.visibilityState === "hidden" ? 30_000 : 4_000);
    let id = window.setInterval(tick, ms());
    const vis = () => {
      window.clearInterval(id);
      id = window.setInterval(tick, ms());
      if (document.visibilityState === "visible") tick();
    };
    document.addEventListener("visibilitychange", vis);
    return () => {
      cancelled = true;
      window.clearInterval(id);
      document.removeEventListener("visibilitychange", vis);
    };
  }, [poll]);

  const layer = (
    <div
      aria-live="polite"
      style={{
        position: "fixed",
        top: 0,
        left: 0,
        right: 0,
        zIndex: 2147483000,
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        gap: 8,
        padding: "12px 12px 0",
        pointerEvents: "none",
        boxSizing: "border-box",
      }}
    >
      <style>{`@keyframes crmToastIn{from{opacity:0;transform:translateY(-8px)}to{opacity:1;transform:translateY(0)}}`}</style>
      {toasts.map((t) => (
        <div
          key={t.id}
          dir="rtl"
          role="status"
          style={{
            pointerEvents: "auto",
            width: "100%",
            maxWidth: 560,
            background: "linear-gradient(180deg, #ffffff 0%, #f9fafb 100%)",
            borderRadius: 12,
            boxShadow: "0 10px 40px rgba(0,0,0,0.1), 0 0 0 1px rgba(0,0,0,0.06)",
            border: "1px solid #e5e7eb",
            padding: "10px 14px",
            display: "flex",
            flexWrap: "wrap",
            alignItems: "center",
            gap: "10px 12px",
            animation: "crmToastIn 0.22s ease-out",
          }}
        >
          <div style={{ flex: "1 1 200px", minWidth: 0 }}>
            <div style={{ fontWeight: 800, fontSize: 14, color: "#111827" }}>{t.title}</div>
            <div style={{ fontSize: 13, color: "#4b5563", lineHeight: 1.45, marginTop: 2 }}>{t.body}</div>
          </div>
          <div style={{ display: "flex", gap: 8, flexWrap: "wrap", marginInlineStart: "auto" }}>
            <button
              type="button"
              onClick={() => dismissToast(t.id)}
              style={{
                padding: "6px 12px",
                borderRadius: 8,
                border: "1px solid #e5e7eb",
                background: "#fff",
                fontWeight: 600,
                fontSize: 13,
                cursor: "pointer",
              }}
            >
              סגור
            </button>
            {t.kind === "wa" && t.threadId ? (
              <button
                type="button"
                onClick={() => {
                  dismissToast(t.id);
                  router.push(`/whatsapp-automations/chats?thread=${encodeURIComponent(t.threadId!)}`);
                }}
                style={{
                  padding: "6px 12px",
                  borderRadius: 8,
                  border: "none",
                  background: "linear-gradient(180deg, #a78bfa 0%, #6d28d9 100%)",
                  color: "#fff",
                  fontWeight: 700,
                  fontSize: 13,
                  cursor: "pointer",
                }}
              >
                מעבר להודעה
              </button>
            ) : null}
            {t.kind === "lead" && t.leadId ? (
              <button
                type="button"
                onClick={() => {
                  dismissToast(t.id);
                  router.push(`/contacts?openContactId=${encodeURIComponent(t.leadId!)}`);
                }}
                style={{
                  padding: "6px 12px",
                  borderRadius: 8,
                  border: "none",
                  background: "linear-gradient(180deg, #a78bfa 0%, #6d28d9 100%)",
                  color: "#fff",
                  fontWeight: 700,
                  fontSize: 13,
                  cursor: "pointer",
                }}
              >
                מעבר לאיש קשר
              </button>
            ) : null}
            {t.kind === "opp" && t.opportunityId ? (
              <button
                type="button"
                onClick={() => {
                  dismissToast(t.id);
                  router.push(`/pipeline?openOpportunityId=${encodeURIComponent(t.opportunityId!)}`);
                }}
                style={{
                  padding: "6px 12px",
                  borderRadius: 8,
                  border: "none",
                  background: "linear-gradient(180deg, #a78bfa 0%, #6d28d9 100%)",
                  color: "#fff",
                  fontWeight: 700,
                  fontSize: 13,
                  cursor: "pointer",
                }}
              >
                מעבר להזדמנות
              </button>
            ) : null}
            {t.kind === "order" && t.orderId ? (
              <button
                type="button"
                onClick={() => {
                  dismissToast(t.id);
                  router.push("/orders");
                }}
                style={{
                  padding: "6px 12px",
                  borderRadius: 8,
                  border: "none",
                  background: "linear-gradient(180deg, #a78bfa 0%, #6d28d9 100%)",
                  color: "#fff",
                  fontWeight: 700,
                  fontSize: 13,
                  cursor: "pointer",
                }}
              >
                מעבר להזמנות
              </button>
            ) : null}
          </div>
        </div>
      ))}
    </div>
  );

  if (!mounted) return null;
  return createPortal(layer, document.body);
}
