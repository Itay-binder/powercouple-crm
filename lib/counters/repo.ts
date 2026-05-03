import { FieldValue } from "firebase-admin/firestore";
import { getAdminDb } from "@/lib/firebase/admin";

export async function allocateRunningCode(
  counterId: string,
  prefix: string,
  padLength = 4
): Promise<string> {
  const db = await getAdminDb();
  const ref = db.collection("counters").doc(counterId);

  const seq = await db.runTransaction(async (tx) => {
    const snap = await tx.get(ref);
    const rawNext = snap.exists ? Number((snap.data()?.next as number | undefined) ?? 1) : 1;
    const next = Number.isFinite(rawNext) && rawNext > 0 ? Math.floor(rawNext) : 1;
    tx.set(
      ref,
      {
        next: next + 1,
        updatedAt: FieldValue.serverTimestamp(),
        createdAt: snap.exists
          ? (snap.data()?.createdAt ?? FieldValue.serverTimestamp())
          : FieldValue.serverTimestamp(),
      },
      { merge: true }
    );
    return next;
  });

  return `${prefix}${String(seq).padStart(padLength, "0")}`;
}
