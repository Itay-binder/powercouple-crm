import { randomUUID } from "crypto";
import type { Firestore } from "firebase-admin/firestore";
import { FieldValue } from "firebase-admin/firestore";
import { getRequestTenantDatabaseId } from "@/lib/firebase/admin";
import { getTenantByDatabaseId } from "@/lib/tenant/config";
import {
  ALL_WEBHOOK_EVENTS,
  WEBHOOK_EVENT_LABELS,
  type WebhookEventId,
  type WebhookTriggerRow,
} from "@/lib/webhooks/triggersTypes";

const COLLECTION = "integrationSettings";
const DOC_ID = "webhookTriggers";

export type { WebhookEventId, WebhookTriggerRow };
export { WEBHOOK_EVENT_LABELS, ALL_WEBHOOK_EVENTS };

const DEFAULT_MAKE =
  "https://hook.us1.make.com/y713jevs12gt2ge6uuh7j7180q3c6fey";

function envBaseUrl(): string {
  return process.env.CRM_TASK_WEBHOOK_URL?.trim() || DEFAULT_MAKE;
}

/** טננט hot-afik: אין טריגרים פעילים ואין URL — הלקוח יגדיר בעצמו. */
export function buildBlankWebhookTriggers(): WebhookTriggerRow[] {
  return [
    {
      id: "def-task-reminder-custom",
      label: "תזכורת משימה (ברירת מחדל)",
      event: "task_reminder_custom",
      enabled: false,
      url: "",
    },
    {
      id: "def-task-deadline-15m",
      label: "15 דק׳ לפני דדליין (ברירת מחדל)",
      event: "task_reminder_deadline_15m",
      enabled: false,
      url: "",
    },
    {
      id: "def-lead-created",
      label: "קליטת ליד",
      event: "lead_created",
      enabled: false,
      url: "",
    },
    {
      id: "def-lead-stage",
      label: "שינוי שלב איש קשר",
      event: "lead_stage_changed",
      enabled: false,
      url: "",
    },
    {
      id: "def-opp-created",
      label: "הזדמנות חדשה",
      event: "opportunity_created",
      enabled: false,
      url: "",
    },
    {
      id: "def-opp-stage",
      label: "שינוי שלב בהזדמנות",
      event: "opportunity_stage_changed",
      enabled: false,
      url: "",
    },
    {
      id: "def-opp-pipeline",
      label: "מעבר הזדמנות בין פייפליינים",
      event: "opportunity_pipeline_changed",
      enabled: false,
      url: "",
    },
    {
      id: "def-moving-order-dispatch",
      label: "שליחת הזמנת הובלה למובילים",
      event: "moving_order_dispatch",
      enabled: false,
      url: "",
    },
    {
      id: "def-moving-order-match-send",
      label: "התאמת הזמנות — שליחה למובילים",
      event: "moving_order_match_send",
      enabled: false,
      url: "",
    },
    {
      id: "def-moving-order-match-cancel",
      label: "התאמת הזמנות — דחייה",
      event: "moving_order_match_cancel",
      enabled: false,
      url: "",
    },
  ];
}

export function buildDefaultTriggers(): WebhookTriggerRow[] {
  const base = envBaseUrl();
  return [
    {
      id: "def-task-reminder-custom",
      label: "תזכורת משימה (ברירת מחדל)",
      event: "task_reminder_custom",
      enabled: true,
      url: base,
    },
    {
      id: "def-task-deadline-15m",
      label: "15 דק׳ לפני דדליין (ברירת מחדל)",
      event: "task_reminder_deadline_15m",
      enabled: true,
      url: base,
    },
    {
      id: "def-lead-created",
      label: "קליטת ליד",
      event: "lead_created",
      enabled: false,
      url: "",
    },
    {
      id: "def-lead-stage",
      label: "שינוי שלב איש קשר",
      event: "lead_stage_changed",
      enabled: false,
      url: "",
    },
    {
      id: "def-opp-created",
      label: "הזדמנות חדשה",
      event: "opportunity_created",
      enabled: false,
      url: "",
    },
    {
      id: "def-opp-stage",
      label: "שינוי שלב בהזדמנות",
      event: "opportunity_stage_changed",
      enabled: false,
      url: "",
    },
    {
      id: "def-opp-pipeline",
      label: "מעבר הזדמנות בין פייפליינים",
      event: "opportunity_pipeline_changed",
      enabled: false,
      url: "",
    },
    {
      id: "def-moving-order-dispatch",
      label: "שליחת הזמנת הובלה למובילים",
      event: "moving_order_dispatch",
      enabled: false,
      url: "",
    },
    {
      id: "def-moving-order-match-send",
      label: "התאמת הזמנות — שליחה למובילים",
      event: "moving_order_match_send",
      enabled: true,
      url: "https://hook.us1.make.com/7ig76p1u6ycbq5au3smo14ufelkdyer3",
    },
    {
      id: "def-moving-order-match-cancel",
      label: "התאמת הזמנות — דחייה",
      event: "moving_order_match_cancel",
      enabled: true,
      url: "https://hook.us1.make.com/jjbdvct4ygbx7ee6wixpiao6zrcglxql",
    },
  ];
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
  const rawData = snap.data() as { hotAfikTriggersResetV1?: boolean; triggers?: unknown } | undefined;

  if (useBlankDefaults && !rawData?.hotAfikTriggersResetV1) {
    const blank = buildBlankWebhookTriggers();
    await db.collection(COLLECTION).doc(DOC_ID).set(
      {
        triggers: blank,
        hotAfikTriggersResetV1: true,
        updatedAt: FieldValue.serverTimestamp(),
      },
      { merge: true }
    );
    return blank;
  }

  const defaults = useBlankDefaults ? buildBlankWebhookTriggers() : buildDefaultTriggers();
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
