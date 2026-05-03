import type { Firestore } from "firebase-admin/firestore";
import { getWebhookTriggers, isHotAfikWebhookTenantDb } from "@/lib/webhooks/triggersRepo";
import { WEBHOOK_EVENT_DEFAULT_URLS, type WebhookEventId } from "@/lib/webhooks/triggersTypes";

function buildBody(event: WebhookEventId, payload: Record<string, unknown>): string {
  return JSON.stringify({ ...payload, event, sentAt: new Date().toISOString() });
}

async function sendToUrls(
  urls: string[],
  body: string
): Promise<boolean> {
  if (urls.length === 0) return false;
  let anyOk = false;
  await Promise.all(
    urls.map(async (url) => {
      try {
        const res = await fetch(url, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body,
        });
        if (res.ok) anyOk = true;
      } catch {
        /* ignore */
      }
    })
  );
  return anyOk;
}

/**
 * למשימות: מחזיר true רק אם נשלח לפחות ל-URL אחד והתקבלה תשובה ok (לסימון reminderWebhookFiredAt).
 */
export async function postWebhookForEvent(
  db: Firestore,
  event: WebhookEventId,
  payload: Record<string, unknown>
): Promise<boolean> {
  let triggers: Awaited<ReturnType<typeof getWebhookTriggers>>;
  try {
    triggers = await getWebhookTriggers(db);
  } catch {
    return false;
  }
  const targets = triggers.filter((t) => t.enabled && t.event === event && t.url.trim());
  const urls = targets.map((t) => t.url.trim());
  const fallback = WEBHOOK_EVENT_DEFAULT_URLS[event]?.trim();
  const blockMakeFallback = await isHotAfikWebhookTenantDb(db);
  if (urls.length === 0 && fallback && !blockMakeFallback) {
    return sendToUrls([fallback], buildBody(event, payload));
  }
  return sendToUrls(urls, buildBody(event, payload));
}

/**
 * לאירועי CRM (לידים/הזדמנויות): לא מפיל את הזרימה; לוג שגיאות בקונסולה.
 */
export async function dispatchServerWebhooks(
  db: Firestore,
  event: WebhookEventId,
  payload: Record<string, unknown>
): Promise<void> {
  let triggers: Awaited<ReturnType<typeof getWebhookTriggers>>;
  try {
    triggers = await getWebhookTriggers(db);
  } catch {
    return;
  }
  const targets = triggers.filter((t) => t.enabled && t.event === event && t.url.trim());
  const body = buildBody(event, payload);
  await Promise.all(
    targets.map(async (t) => {
      try {
        const res = await fetch(t.url.trim(), {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body,
        });
        if (!res.ok) console.warn(`[webhook] ${event} ${t.id} HTTP ${res.status}`);
      } catch (e) {
        console.warn(`[webhook] ${event} ${t.id}`, e);
      }
    })
  );
}

export function fireServerWebhooks(
  db: Firestore,
  event: WebhookEventId,
  payload: Record<string, unknown>
): void {
  void dispatchServerWebhooks(db, event, payload).catch(() => {});
}
