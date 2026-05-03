import type { Firestore } from "firebase-admin/firestore";
import webpush from "web-push";
import { getVapidKeys } from "@/lib/push/vapid";

export type TenantPushKind = "whatsapp_inbound" | "new_lead" | "new_order" | "new_opportunity";

export type TenantWebPushInput = {
  kind: TenantPushKind;
  title: string;
  body: string;
  /** נתיב יחסי (עם / בתחילה) — נפתח בלשונית חדשה */
  relativeUrl: string;
  tag: string;
};

let vapidConfigured = false;

function ensureVapid(): boolean {
  const keys = getVapidKeys();
  if (!keys) return false;
  if (!vapidConfigured) {
    webpush.setVapidDetails(keys.subject, keys.publicKey, keys.privateKey);
    vapidConfigured = true;
  }
  return true;
}

function channelAllowed(
  kind: TenantPushKind,
  prefs: {
    whatsapp?: boolean;
    newLead?: boolean;
    newOrder?: boolean;
    newOpportunity?: boolean;
  } | undefined
): boolean {
  const p = prefs ?? {};
  if (kind === "whatsapp_inbound") return p.whatsapp !== false;
  if (kind === "new_lead") return p.newLead !== false;
  if (kind === "new_opportunity") return p.newOpportunity !== false;
  return p.newOrder !== false;
}

async function removeDeadSubscription(db: Firestore, userDocId: string, endpoint: string): Promise<void> {
  const ref = db.collection("users").doc(userDocId);
  const snap = await ref.get();
  const d = (snap.data() ?? {}) as Record<string, unknown>;
  const prev = Array.isArray(d.webPushSubscriptions) ? (d.webPushSubscriptions as unknown[]) : [];
  const filtered = prev.filter((raw) => {
    if (!raw || typeof raw !== "object") return false;
    return String((raw as { endpoint?: string }).endpoint ?? "") !== endpoint;
  });
  await ref.set({ webPushSubscriptions: filtered }, { merge: true });
}

/**
 * שולח Web Push לכל משתמש מאושר במסד עם מנוי פעיל.
 * דורש NEXT_PUBLIC_VAPID_PUBLIC_KEY + VAPID_PRIVATE_KEY בשרת; אחרת יוצא בשקט.
 */
export async function notifyTenantUsersWebPush(db: Firestore, input: TenantWebPushInput): Promise<void> {
  if (!ensureVapid()) return;
  const payload = JSON.stringify({
    title: input.title,
    body: input.body,
    url: input.relativeUrl.startsWith("/") ? input.relativeUrl : `/${input.relativeUrl}`,
    tag: input.tag,
    /** ל-Service Worker — עדיפות גבוהה במכשירים שמכבדים (לא עוקף «נא לא להפריע») */
    priority: "high",
    ts: Date.now(),
  });
  let snap;
  try {
    snap = await db.collection("users").get();
  } catch {
    return;
  }
  for (const doc of snap.docs) {
    const d = doc.data() as Record<string, unknown>;
    if (!Boolean(d.approved)) continue;
    const prefs =
      typeof d.devicePushPrefs === "object" && d.devicePushPrefs !== null
        ? (d.devicePushPrefs as {
            whatsapp?: boolean;
            newLead?: boolean;
            newOrder?: boolean;
            newOpportunity?: boolean;
          })
        : undefined;
    if (!channelAllowed(input.kind, prefs)) continue;
    const subs = Array.isArray(d.webPushSubscriptions) ? d.webPushSubscriptions : [];
    for (const raw of subs) {
      if (!raw || typeof raw !== "object") continue;
      const ep = String((raw as { endpoint?: string }).endpoint ?? "");
      const keys = (raw as { keys?: { p256dh?: string; auth?: string } }).keys;
      if (!ep || !keys?.p256dh || !keys?.auth) continue;
      try {
        await webpush.sendNotification(
          { endpoint: ep, keys: { p256dh: keys.p256dh, auth: keys.auth } },
          payload,
          { urgency: "high", TTL: 86_400 }
        );
      } catch (e: unknown) {
        const status = (e as { statusCode?: number }).statusCode;
        if (status === 404 || status === 410) {
          void removeDeadSubscription(db, doc.id, ep).catch(() => {});
        }
      }
    }
  }
}
