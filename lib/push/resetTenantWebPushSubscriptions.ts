import { FieldValue, type Firestore } from "firebase-admin/firestore";

const BATCH = 400;

/**
 * מוחק את כל מנויי Web Push מכל מסמכי users במסד הנוכחי (טננט).
 * דורש הרצה ממנהל — אחרי זה כל משתמש צריך שוב «הפעל התראות דחיפה למכשיר».
 */
export async function clearAllWebPushSubscriptionsForTenant(db: Firestore): Promise<{ usersUpdated: number }> {
  const snap = await db.collection("users").get();
  let usersUpdated = 0;
  let batch = db.batch();
  let ops = 0;

  const flush = async () => {
    if (ops === 0) return;
    await batch.commit();
    batch = db.batch();
    ops = 0;
  };

  for (const doc of snap.docs) {
    const d = (doc.data() ?? {}) as Record<string, unknown>;
    const subs = Array.isArray(d.webPushSubscriptions) ? d.webPushSubscriptions : [];
    if (subs.length === 0) continue;
    batch.set(
      doc.ref,
      {
        webPushSubscriptions: [],
        webPushSubscriptionsClearedAt: FieldValue.serverTimestamp(),
      },
      { merge: true }
    );
    ops += 1;
    usersUpdated += 1;
    if (ops >= BATCH) {
      await flush();
    }
  }
  await flush();
  return { usersUpdated };
}
