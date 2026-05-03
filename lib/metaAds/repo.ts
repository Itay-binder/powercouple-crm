import type { Firestore } from "firebase-admin/firestore";

const COLLECTION = "integrationSettings";
const CONFIG_DOC_ID = "metaAdsConfig";

export type MetaAdsConfig = {
  appId: string;
  businessId: string;
  adAccountId: string;
  accessToken: string;
  statusTogglePasswordHash: string;
  tokenExpiresAt: string; // ISO date, or "" for non-expiring tokens
  updatedAt: string;
};

function asString(v: unknown): string {
  return typeof v === "string" ? v : "";
}

export function normalizeAdAccountId(raw: string): string {
  const trimmed = raw.trim();
  if (!trimmed) return "";
  return trimmed.replace(/^act_/i, "");
}

export async function getMetaAdsConfig(db: Firestore): Promise<MetaAdsConfig | null> {
  const snap = await db.collection(COLLECTION).doc(CONFIG_DOC_ID).get();
  if (!snap.exists) return null;
  const d = (snap.data() ?? {}) as Record<string, unknown>;
  return {
    appId: asString(d.appId).trim(),
    businessId: asString(d.businessId).trim(),
    adAccountId: normalizeAdAccountId(asString(d.adAccountId)),
    accessToken: asString(d.accessToken).trim(),
    statusTogglePasswordHash: asString(d.statusTogglePasswordHash).trim(),
    tokenExpiresAt: asString(d.tokenExpiresAt).trim(),
    updatedAt: asString(d.updatedAt).trim(),
  };
}

export async function saveMetaAdsConfig(
  db: Firestore,
  input: {
    appId?: string;
    businessId?: string;
    adAccountId?: string;
    accessToken?: string;
    statusTogglePasswordHash?: string;
    tokenExpiresAt?: string;
  }
): Promise<MetaAdsConfig> {
  const prev = await getMetaAdsConfig(db);
  const now = new Date().toISOString();
  const next: MetaAdsConfig = {
    appId: input.appId?.trim() ?? prev?.appId ?? "",
    businessId: input.businessId?.trim() ?? prev?.businessId ?? "",
    adAccountId:
      input.adAccountId !== undefined
        ? normalizeAdAccountId(input.adAccountId)
        : (prev?.adAccountId ?? ""),
    accessToken:
      input.accessToken !== undefined ? input.accessToken.trim() : (prev?.accessToken ?? ""),
    statusTogglePasswordHash:
      input.statusTogglePasswordHash !== undefined
        ? input.statusTogglePasswordHash.trim()
        : (prev?.statusTogglePasswordHash ?? ""),
    tokenExpiresAt:
      input.tokenExpiresAt !== undefined
        ? input.tokenExpiresAt.trim()
        : (prev?.tokenExpiresAt ?? ""),
    updatedAt: now,
  };
  await db.collection(COLLECTION).doc(CONFIG_DOC_ID).set(next, { merge: true });
  return next;
}

export async function clearMetaAdsToken(db: Firestore): Promise<void> {
  await db
    .collection(COLLECTION)
    .doc(CONFIG_DOC_ID)
    .set(
      { accessToken: "", tokenExpiresAt: "", updatedAt: new Date().toISOString() },
      { merge: true }
    );
}
