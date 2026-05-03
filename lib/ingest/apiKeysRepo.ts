import { randomBytes } from "crypto";
import { FieldValue } from "firebase-admin/firestore";
import { getAdminDb } from "@/lib/firebase/admin";
import { hashIngestApiKeyPlaintext, verifyIngestApiKeyPlaintext } from "@/lib/ingest/apiKeyCrypto";

const COLLECTION = "ingestApiKeys";

/** Prefix for keys we issue (doc id embedded for O(1) lookup). */
export const INGEST_KEY_PREFIX = "csk_live_";

export type IngestApiKeyRecord = {
  id: string;
  label: string;
  createdAt: Date | null;
  createdBy?: string;
  revoked: boolean;
  hint?: string;
};

function mapTs(ts: unknown): Date | null {
  if (ts && typeof ts === "object" && "toDate" in ts) {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    return (ts as any).toDate?.() ?? null;
  }
  return null;
}

export async function listIngestApiKeys(): Promise<IngestApiKeyRecord[]> {
  const db = await getAdminDb();
  const snap = await db.collection(COLLECTION).get();
  const rows = snap.docs.map((doc) => {
    const d = (doc.data() ?? {}) as Record<string, unknown>;
    return {
      id: doc.id,
      label: String(d.label ?? ""),
      createdAt: mapTs(d.createdAt),
      createdBy: typeof d.createdBy === "string" ? d.createdBy : undefined,
      revoked: d.revoked === true,
      hint: typeof d.hint === "string" ? d.hint : undefined,
    } satisfies IngestApiKeyRecord;
  });
  return rows.sort((a, b) => {
    const at = a.createdAt?.getTime() ?? 0;
    const bt = b.createdAt?.getTime() ?? 0;
    return bt - at;
  });
}

/**
 * Creates a key; returns plaintext once. Stored: scrypt hash + salt only.
 */
export async function createIngestApiKey(input: {
  label?: string;
  createdBy?: string;
}): Promise<{ id: string; plaintext: string }> {
  const db = await getAdminDb();
  const ref = db.collection(COLLECTION).doc();
  const docId = ref.id;
  const secret = randomBytes(24).toString("base64url");
  const plaintext = `${INGEST_KEY_PREFIX}${docId}_${secret}`;
  const { saltB64, hashB64 } = hashIngestApiKeyPlaintext(plaintext);
  const hint = secret.slice(-4);
  const now = FieldValue.serverTimestamp();
  await ref.set({
    saltB64,
    hashB64,
    label: input.label?.trim() || "API key",
    hint,
    createdBy: input.createdBy?.trim() || "",
    revoked: false,
    createdAt: now,
    updatedAt: now,
  });
  return { id: docId, plaintext };
}

export async function revokeIngestApiKey(id: string): Promise<void> {
  const raw = id.trim();
  if (!raw) throw new Error("Invalid key id");
  const db = await getAdminDb();
  const ref = db.collection(COLLECTION).doc(raw);
  const snap = await ref.get();
  if (!snap.exists) throw new Error("Key not found");
  await ref.set(
    { revoked: true, updatedAt: FieldValue.serverTimestamp() },
    { merge: true }
  );
}

/**
 * If plaintext matches our format, load that doc and verify scrypt hash.
 */
export async function verifyStoredIngestApiKey(plaintext: string): Promise<boolean> {
  const m = plaintext.match(
    new RegExp(`^${INGEST_KEY_PREFIX.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}([A-Za-z0-9]+)_([A-Za-z0-9_-]+)$`)
  );
  if (!m) return false;
  const docId = m[1];
  const db = await getAdminDb();
  const snap = await db.collection(COLLECTION).doc(docId).get();
  if (!snap.exists) return false;
  const d = (snap.data() ?? {}) as Record<string, unknown>;
  if (d.revoked === true) return false;
  const saltB64 = typeof d.saltB64 === "string" ? d.saltB64 : "";
  const hashB64 = typeof d.hashB64 === "string" ? d.hashB64 : "";
  if (!saltB64 || !hashB64) return false;
  return verifyIngestApiKeyPlaintext(plaintext, saltB64, hashB64);
}
