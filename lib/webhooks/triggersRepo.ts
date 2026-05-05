import { randomUUID } from "crypto";
import type { Firestore } from "firebase-admin/firestore";
import { FieldValue } from "firebase-admin/firestore";
import { getRequestTenantDatabaseId } from "@/lib/firebase/admin";
import { getTenantByDatabaseId } from "@/lib/tenant/config";
import {
  ALL_WEBHOOK_EVENTS,
  SETTINGS_WEBHOOK_EVENTS,
  WEBHOOK_EVENT_LABELS,
  type WebhookEventId,
  type WebhookTriggerRow,
} from "@/lib/webhooks/triggersTypes";

const COLLECTION = "integrationSettings";
const DOC_ID = "webhookTriggers";

export type { WebhookEventId, WebhookTriggerRow };
export { WEBHOOK_EVENT_LABELS, ALL_WEBHOOK_EVENTS };

/** טננט hot-afik: אין טריגרים פעילים ואין URL — הלקוח יגדיר בעצמו. */
export function buildBlankWebhookTriggers(): WebhookTriggerRow[] {
  return SETTINGS_WEBHOOK_EVENTS.map((event) => ({
    id: `def-${event}`,
    label: WEBHOOK_EVENT_LABELS[event],
    event,
    enabled: false,
    url: "",
  }));
}

export function buildDefaultTriggers(): WebhookTriggerRow[] {
  return buildBlankWebhookTriggers();
}

function readFirestoreDatabaseId(db: Firestore): string | null {
  const w = db as unknown as {
    databaseId?: string;
    _databaseId?: string | { id?: string };
  };
  if (typeof w.databaseId === "string" && w.databaseId.trim()) return w.databaseId.trim();
  if (typeof w._databaseId === "string" && w._databaseId.trim()) return w._databaseId.trim();
  if (w._databaseId && typeof w._databaseId === "object") {
    const id = (w._databaseId as { id?: string }).id;
    if (typeof id === "string" && id.trim()) return id.trim();
  }
  return null;
}

async function resolveWebhookFirestoreDatabaseId(db: Firestore): Promise<string> {
  const fromInstance = readFirestoreDatabaseId(db);
  if (fromInstance) return fromInstance;
  return getRequestTenantDatabaseId();
}

export async function isHotAfikWebhookTenantDb(db: Firestore): Promise<boolean> {
  const id = await resolveWebhookFirestoreDatabaseId(db);
  return getTenantByDatabaseId(id)?.id === "hot-afik";
}

function isValidUrl(s: string): boolean {
  const t = s.trim();
  if (!t) return true;
  try {
    const u = new URL(t);
    return u.protocol === "http:" || u.protocol === "https:";
  } catch {
    return false;
  }
}

export function parseWebhookTriggers(raw: unknown): WebhookTriggerRow[] | null {
  if (!raw || typeof raw !== "object") return null;
  const triggers = (raw as { triggers?: unknown }).triggers;
  if (!Array.isArray(triggers)) return null;
  const events = new Set<string>(ALL_WEBHOOK_EVENTS);
  const out: WebhookTriggerRow[] = [];
  for (const row of triggers) {
    if (!row || typeof row !== "object") continue;
    const o = row as Record<string, unknown>;
    const id = String(o.id ?? "").trim();
    const event = String(o.event ?? "").trim() as WebhookEventId;
    if (!id || !events.has(event)) continue;
    const url = String(o.url ?? "").trim();
    if (!isValidUrl(url)) continue;
    out.push({
      id,
      label: String(o.label ?? "").trim() || WEBHOOK_EVENT_LABELS[event],
      event,
      enabled: Boolean(o.enabled),
      url,
    });
  }
  return out.length > 0 ? out : null;
}

export async function getWebhookTriggers(db: Firestore): Promise<WebhookTriggerRow[]> {
  const databaseId = await resolveWebhookFirestoreDatabaseId(db);
  const useBlankDefaults = getTenantByDatabaseId(databaseId)?.id === "hot-afik";
  const snap = await db.collection(COLLECTION).doc(DOC_ID).get();
  const rawData = snap.data() as {
    hotAfikTriggersResetV1?: boolean;
    crmTriggersResetV2?: boolean;
    triggers?: unknown;
  } | undefined;

  if (!rawData?.crmTriggersResetV2 || (useBlankDefaults && !rawData?.hotAfikTriggersResetV1)) {
    const blank = buildBlankWebhookTriggers();
    await db.collection(COLLECTION).doc(DOC_ID).set(
      {
        triggers: blank,
        crmTriggersResetV2: true,
        hotAfikTriggersResetV1: true,
        updatedAt: FieldValue.serverTimestamp(),
      },
      { merge: true }
    );
    return blank;
  }

  const defaults = buildDefaultTriggers();
  if (!snap.exists) return defaults;
  const parsed = parseWebhookTriggers(snap.data());
  if (!parsed) return defaults;
  const byEvent = new Map<WebhookEventId, WebhookTriggerRow>();
  for (const t of parsed) byEvent.set(t.event, t);
  return defaults.map((d) => byEvent.get(d.event) ?? d);
}

export async function saveWebhookTriggers(
  db: Firestore,
  triggers: WebhookTriggerRow[]
): Promise<void> {
  const events = new Set<string>(ALL_WEBHOOK_EVENTS);
  for (const t of triggers) {
    if (!t.id?.trim()) throw new Error("כל טריגר חייב מזהה");
    if (!events.has(t.event)) throw new Error(`סוג אירוע לא חוקי: ${t.event}`);
    if (t.enabled && !t.url.trim()) {
      throw new Error(`טריגר מופעל חייב URL: ${t.label || t.id}`);
    }
    if (t.url.trim() && !isValidUrl(t.url)) throw new Error(`URL לא חוקי: ${t.label || t.id}`);
  }
  await db.collection(COLLECTION).doc(DOC_ID).set(
    {
      triggers,
      updatedAt: FieldValue.serverTimestamp(),
    },
    { merge: true }
  );
}

export function newTriggerId(): string {
  return randomUUID();
}
