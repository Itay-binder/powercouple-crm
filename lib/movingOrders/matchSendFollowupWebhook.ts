import { randomUUID } from "crypto";
import { FieldValue, type Firestore } from "firebase-admin/firestore";
import { getAdminDb } from "@/lib/firebase/admin";
import { getMovingOrder } from "@/lib/movingOrders/repo";
import { buildMatchSendWebhookPayloadForDrivers } from "@/lib/movingOrders/postMatchSendWebhook";

const FOLLOWUP_DELAY_MS = 2 * 60 * 60 * 1000;
const FOLLOWUP_COLLECTION = "scheduledMatchSendFollowups";
const MAKE_FOLLOWUP_URL = "https://hook.us1.make.com/kgtwapbvijifymfdyltt6jag1a2qb557";

type FollowupDoc = {
  id: string;
  movingOrderId: string;
  orderId: string;
  driverIds: string[];
  notifyCustomer: boolean;
  createdAt: string;
  dueAt: string;
  sentAt: string | null;
  attempts: number;
  lastError?: string;
};

export async function enqueueMatchSendFollowupWebhook(params: {
  db: Firestore;
  movingOrderId: string;
  orderId: string;
  driverIds: string[];
  notifyCustomer: boolean;
  sentAt?: string;
}): Promise<void> {
  const normalizedDriverIds = [...new Set(params.driverIds.map((x) => String(x).trim()).filter(Boolean))];
  if (normalizedDriverIds.length === 0) return;

  const sentAt = params.sentAt?.trim() || new Date().toISOString();
  const sentAtTs = new Date(sentAt).getTime();
  const dueAt = new Date(
    (Number.isNaN(sentAtTs) ? Date.now() : sentAtTs) + FOLLOWUP_DELAY_MS
  ).toISOString();

  const id = randomUUID();
  const doc: FollowupDoc = {
    id,
    movingOrderId: params.movingOrderId,
    orderId: params.orderId,
    driverIds: normalizedDriverIds,
    notifyCustomer: params.notifyCustomer,
    createdAt: sentAt,
    dueAt,
    sentAt: null,
    attempts: 0,
  };

  await params.db
    .collection("movingOrders")
    .doc(params.movingOrderId)
    .collection(FOLLOWUP_COLLECTION)
    .doc(id)
    .set(doc);
}

async function postToMake(payload: Record<string, unknown>): Promise<{ ok: boolean; status: number }> {
  try {
    const res = await fetch(MAKE_FOLLOWUP_URL, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });
    return { ok: res.ok, status: res.status };
  } catch {
    return { ok: false, status: 0 };
  }
}

export type MatchSendFollowupSweepResult = {
  scanned: number;
  sent: number;
  failed: number;
  skipped: number;
  errors: string[];
};

export async function sweepMatchSendFollowupWebhooks(db?: Firestore): Promise<MatchSendFollowupSweepResult> {
  const d = db ?? (await getAdminDb());
  const nowIso = new Date().toISOString();
  const out: MatchSendFollowupSweepResult = { scanned: 0, sent: 0, failed: 0, skipped: 0, errors: [] };

  const snap = await d
    .collectionGroup(FOLLOWUP_COLLECTION)
    .where("dueAt", "<=", nowIso)
    .limit(200)
    .get();

  out.scanned = snap.size;

  for (const doc of snap.docs) {
    const raw = (doc.data() ?? {}) as Partial<FollowupDoc>;
    if (typeof raw.sentAt === "string" && raw.sentAt.trim()) {
      out.skipped++;
      continue;
    }

    const movingOrderId = String(raw.movingOrderId ?? "").trim();
    const driverIds = Array.isArray(raw.driverIds) ? raw.driverIds.map((x) => String(x).trim()).filter(Boolean) : [];
    const notifyCustomer = raw.notifyCustomer === true;
    if (!movingOrderId || driverIds.length === 0) {
      await doc.ref.set(
        {
          sentAt: nowIso,
          lastError: "invalid followup payload",
          updatedAt: FieldValue.serverTimestamp(),
        },
        { merge: true }
      );
      out.skipped++;
      continue;
    }

    const order = await getMovingOrder(movingOrderId, d);
    if (!order) {
      await doc.ref.set(
        {
          sentAt: nowIso,
          lastError: "moving order not found",
          updatedAt: FieldValue.serverTimestamp(),
        },
        { merge: true }
      );
      out.skipped++;
      continue;
    }

    const matchPayload = await buildMatchSendWebhookPayloadForDrivers(order, driverIds, notifyCustomer);
    if (!matchPayload) {
      await doc.ref.set(
        {
          sentAt: nowIso,
          lastError: "no movers payload",
          updatedAt: FieldValue.serverTimestamp(),
        },
        { merge: true }
      );
      out.skipped++;
      continue;
    }

    const webhookPayload = {
      event: "moving_order_match_send_followup_2h",
      sentAt: nowIso,
      followupDelayMinutes: 120,
      originalSendAt: raw.createdAt ?? null,
      dueAt: raw.dueAt ?? null,
      ...matchPayload,
    };
    const res = await postToMake(webhookPayload);
    if (res.ok) {
      await doc.ref.set(
        {
          sentAt: nowIso,
          lastHttpStatus: res.status,
          attempts: Number(raw.attempts ?? 0) + 1,
          updatedAt: FieldValue.serverTimestamp(),
        },
        { merge: true }
      );
      out.sent++;
      continue;
    }

    await doc.ref.set(
      {
        attempts: Number(raw.attempts ?? 0) + 1,
        lastHttpStatus: res.status,
        lastError: `http ${res.status || "network_error"}`,
        updatedAt: FieldValue.serverTimestamp(),
      },
      { merge: true }
    );
    out.failed++;
    out.errors.push(`${movingOrderId}:${doc.id}:http_${res.status || "network_error"}`);
  }

  return out;
}
