import type { Firestore } from "firebase-admin/firestore";

const COLLECTION = "integrationSettings";
const DOC_ID = "canvaConfig";

export type CanvaConfig = {
  accessToken: string;
  refreshToken: string;
  expiresAt: string;
  updatedAt: string;
};

function asString(v: unknown): string {
  return typeof v === "string" ? v : "";
}

export async function getCanvaConfig(db: Firestore): Promise<CanvaConfig | null> {
  const snap = await db.collection(COLLECTION).doc(DOC_ID).get();
  if (!snap.exists) return null;
  const d = (snap.data() ?? {}) as Record<string, unknown>;
  const accessToken = asString(d.accessToken).trim();
  if (!accessToken) return null;
  return {
    accessToken,
    refreshToken: asString(d.refreshToken).trim(),
    expiresAt: asString(d.expiresAt).trim(),
    updatedAt: asString(d.updatedAt).trim(),
  };
}

export async function saveCanvaConfig(
  db: Firestore,
  input: { accessToken: string; refreshToken: string; expiresAt: string }
): Promise<CanvaConfig> {
  const now = new Date().toISOString();
  const next: CanvaConfig = {
    accessToken: input.accessToken.trim(),
    refreshToken: input.refreshToken.trim(),
    expiresAt: input.expiresAt.trim(),
    updatedAt: now,
  };
  await db.collection(COLLECTION).doc(DOC_ID).set(next, { merge: true });
  return next;
}

export async function clearCanvaConfig(db: Firestore): Promise<void> {
  await db
    .collection(COLLECTION)
    .doc(DOC_ID)
    .set(
      { accessToken: "", refreshToken: "", expiresAt: "", updatedAt: new Date().toISOString() },
      { merge: true }
    );
}