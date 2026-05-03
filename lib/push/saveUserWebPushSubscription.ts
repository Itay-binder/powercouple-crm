import type { Firestore } from "firebase-admin/firestore";

export type DevicePushPrefs = {
  whatsapp: boolean;
  newLead: boolean;
  newOrder: boolean;
  newOpportunity: boolean;
};

export type WebPushSubscriptionStored = {
  endpoint: string;
  keys: { p256dh: string; auth: string };
  createdAt: string;
};

function normalizePrefs(
  prev: Record<string, unknown> | undefined,
  patch?: Partial<DevicePushPrefs>
): DevicePushPrefs {
  const p = prev ?? {};
  return {
    whatsapp: patch?.whatsapp ?? (p.whatsapp !== false),
    newLead: patch?.newLead ?? (p.newLead !== false),
    newOrder: patch?.newOrder ?? (p.newOrder !== false),
    newOpportunity: patch?.newOpportunity ?? (p.newOpportunity !== false),
  };
}

export async function saveUserWebPushSubscription(
  db: Firestore,
  userDocId: string,
  subscription: { endpoint: string; keys: { p256dh: string; auth: string } },
  devicePushPrefs?: Partial<DevicePushPrefs>
): Promise<void> {
  const ref = db.collection("users").doc(userDocId);
  await db.runTransaction(async (tx) => {
    const snap = await tx.get(ref);
    const d = (snap.data() ?? {}) as Record<string, unknown>;
    const prevSubs = Array.isArray(d.webPushSubscriptions)
      ? (d.webPushSubscriptions as unknown[])
      : [];
    const nextSubs: WebPushSubscriptionStored[] = [];
    for (const raw of prevSubs) {
      if (!raw || typeof raw !== "object") continue;
      const ep = String((raw as { endpoint?: string }).endpoint ?? "");
      if (!ep || ep === subscription.endpoint) continue;
      const keys = (raw as { keys?: { p256dh?: string; auth?: string } }).keys;
      if (!keys?.p256dh || !keys?.auth) continue;
      nextSubs.push({
        endpoint: ep,
        keys: { p256dh: keys.p256dh, auth: keys.auth },
        createdAt: String((raw as { createdAt?: string }).createdAt ?? new Date().toISOString()),
      });
    }
    nextSubs.push({
      endpoint: subscription.endpoint,
      keys: subscription.keys,
      createdAt: new Date().toISOString(),
    });
    const prefs = normalizePrefs(
      typeof d.devicePushPrefs === "object" && d.devicePushPrefs !== null
        ? (d.devicePushPrefs as Record<string, unknown>)
        : undefined,
      devicePushPrefs
    );
    tx.set(
      ref,
      {
        webPushSubscriptions: nextSubs.slice(-10),
        devicePushPrefs: prefs,
      },
      { merge: true }
    );
  });
}

export async function updateUserDevicePushPrefs(
  db: Firestore,
  userDocId: string,
  patch: Partial<DevicePushPrefs>
): Promise<DevicePushPrefs> {
  const ref = db.collection("users").doc(userDocId);
  let out: DevicePushPrefs = { whatsapp: true, newLead: true, newOrder: true, newOpportunity: true };
  await db.runTransaction(async (tx) => {
    const snap = await tx.get(ref);
    const d = (snap.data() ?? {}) as Record<string, unknown>;
    const prevRaw =
      typeof d.devicePushPrefs === "object" && d.devicePushPrefs !== null
        ? (d.devicePushPrefs as Record<string, unknown>)
        : {};
    const base = normalizePrefs(prevRaw, undefined);
    out = {
      whatsapp: patch.whatsapp !== undefined ? Boolean(patch.whatsapp) : base.whatsapp,
      newLead: patch.newLead !== undefined ? Boolean(patch.newLead) : base.newLead,
      newOrder: patch.newOrder !== undefined ? Boolean(patch.newOrder) : base.newOrder,
      newOpportunity:
        patch.newOpportunity !== undefined ? Boolean(patch.newOpportunity) : base.newOpportunity,
    };
    tx.set(ref, { devicePushPrefs: out }, { merge: true });
  });
  return out;
}

export async function getUserDevicePushState(
  db: Firestore,
  userDocId: string
): Promise<{ prefs: DevicePushPrefs; subscriptionCount: number }> {
  const snap = await db.collection("users").doc(userDocId).get();
  const d = (snap.data() ?? {}) as Record<string, unknown>;
  const prefs = normalizePrefs(
    typeof d.devicePushPrefs === "object" && d.devicePushPrefs !== null
      ? (d.devicePushPrefs as Record<string, unknown>)
      : undefined
  );
  const subs = Array.isArray(d.webPushSubscriptions) ? d.webPushSubscriptions : [];
  return { prefs, subscriptionCount: subs.length };
}
