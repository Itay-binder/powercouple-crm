import { getAdminDb } from "@/lib/firebase/admin";

export type ExternalRef = {
  provider: string;
  externalId: string;
  entityType: "contact" | "opportunity";
  entityId: string;
};

function normalizeProvider(provider: string): string {
  return provider.trim().toLowerCase();
}

function normalizeExternalId(externalId: string): string {
  return externalId.trim().toLowerCase();
}

function docId(provider: string, externalId: string): string {
  return `${normalizeProvider(provider)}:${normalizeExternalId(externalId)}`;
}

export async function getExternalRef(
  provider: string,
  externalId: string
): Promise<ExternalRef | null> {
  const id = docId(provider, externalId);
  const db = await getAdminDb();
  const snap = await db.collection("externalRefs").doc(id).get();
  if (!snap.exists) return null;
  const d = (snap.data() ?? {}) as Record<string, unknown>;
  return {
    provider: String(d.provider ?? normalizeProvider(provider)),
    externalId: String(d.externalId ?? normalizeExternalId(externalId)),
    entityType: (d.entityType as "contact" | "opportunity") ?? "contact",
    entityId: String(d.entityId ?? ""),
  };
}

export async function upsertExternalRef(input: ExternalRef): Promise<void> {
  const id = docId(input.provider, input.externalId);
  const db = await getAdminDb();
  await db.collection("externalRefs").doc(id).set(
    {
      provider: normalizeProvider(input.provider),
      externalId: normalizeExternalId(input.externalId),
      entityType: input.entityType,
      entityId: input.entityId,
      updatedAt: new Date(),
    },
    { merge: true }
  );
}

