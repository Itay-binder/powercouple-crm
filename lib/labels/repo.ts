import { randomUUID } from "crypto";
import { FieldValue, type Firestore } from "firebase-admin/firestore";
import { getAdminDb, getRequestTenantDatabaseId } from "@/lib/firebase/admin";
import { invalidateTenantCachePrefix, withTenantTtlCache } from "@/lib/server/tenantMemoryCache";

const LABELS_CACHE_TTL_MS = 45_000;

export const LABEL_COLOR_PRESETS = [
  "#2563eb",
  "#0d9488",
  "#eab308",
  "#dc2626",
  "#7c3aed",
  "#9ca3af",
  "#92400e",
  "#ea580c",
  "#4b5563",
  "#ec4899",
] as const;

export type LabelRecord = {
  id: string;
  name: string;
  color: string;
  sortOrder: number;
  createdAt: Date | null;
  updatedAt: Date | null;
};

export type ResolvedLabel = { id: string; name: string; color: string };

function mapTs(ts: unknown): Date | null {
  if (ts && typeof ts === "object" && "toDate" in ts) {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    return (ts as any).toDate?.() ?? null;
  }
  return null;
}

function mapDoc(id: string, d: Record<string, unknown>): LabelRecord {
  return {
    id,
    name: String(d.name ?? "").trim() || id,
    color: typeof d.color === "string" && d.color.trim() ? d.color.trim() : LABEL_COLOR_PRESETS[0],
    sortOrder: typeof d.sortOrder === "number" && !Number.isNaN(d.sortOrder) ? d.sortOrder : 0,
    createdAt: mapTs(d.createdAt),
    updatedAt: mapTs(d.updatedAt),
  };
}

export async function listLabelsFromDb(db: Firestore): Promise<LabelRecord[]> {
  const snap = await db.collection("labels").get();
  const rows = snap.docs.map((doc) => mapDoc(doc.id, (doc.data() ?? {}) as Record<string, unknown>));
  return rows.sort((a, b) => {
    if (a.sortOrder !== b.sortOrder) return a.sortOrder - b.sortOrder;
    return a.name.localeCompare(b.name, "he");
  });
}

export async function listLabels(): Promise<LabelRecord[]> {
  const dbId = await getRequestTenantDatabaseId();
  const db = await getAdminDb();
  return withTenantTtlCache(`lbl:${dbId}`, LABELS_CACHE_TTL_MS, () => listLabelsFromDb(db));
}

export async function getLabelById(id: string): Promise<LabelRecord | null> {
  const db = await getAdminDb();
  const snap = await db.collection("labels").doc(id).get();
  if (!snap.exists) return null;
  return mapDoc(snap.id, (snap.data() ?? {}) as Record<string, unknown>);
}

export async function createLabel(input: { name: string; color?: string }): Promise<LabelRecord> {
  const db = await getAdminDb();
  const dbId = await getRequestTenantDatabaseId();
  const name = input.name.trim();
  if (!name) throw new Error("Label name is required");
  const color =
    input.color?.trim() && /^#[0-9A-Fa-f]{6}$/.test(input.color.trim())
      ? input.color.trim()
      : LABEL_COLOR_PRESETS[0];
  const id = `lbl_${randomUUID().replace(/-/g, "")}`;
  const now = FieldValue.serverTimestamp();
  const all = await listLabelsFromDb(db);
  const maxOrder = all.reduce((m, x) => Math.max(m, x.sortOrder), 0);
  const sortOrder = maxOrder + 1;
  await db.collection("labels").doc(id).set({
    name,
    color,
    sortOrder,
    createdAt: now,
    updatedAt: now,
  });
  invalidateTenantCachePrefix(`lbl:${dbId}`);
  const snap = await db.collection("labels").doc(id).get();
  return mapDoc(snap.id, (snap.data() ?? {}) as Record<string, unknown>);
}

export async function updateLabel(
  id: string,
  input: Partial<{ name: string; color: string; sortOrder: number }>
): Promise<LabelRecord> {
  const db = await getAdminDb();
  const ref = db.collection("labels").doc(id);
  const snap = await ref.get();
  if (!snap.exists) throw new Error("Label not found");
  const payload: Record<string, unknown> = { updatedAt: FieldValue.serverTimestamp() };
  if (input.name !== undefined) {
    const n = input.name.trim();
    if (!n) throw new Error("Label name cannot be empty");
    payload.name = n;
  }
  if (input.color !== undefined) {
    const c = input.color.trim();
    if (!/^#[0-9A-Fa-f]{6}$/.test(c)) throw new Error("Invalid color (use #RRGGBB)");
    payload.color = c;
  }
  if (input.sortOrder !== undefined) {
    if (Number.isNaN(input.sortOrder)) throw new Error("Invalid sortOrder");
    payload.sortOrder = input.sortOrder;
  }
  await ref.set(payload, { merge: true });
  invalidateTenantCachePrefix(`lbl:${await getRequestTenantDatabaseId()}`);
  const again = await ref.get();
  return mapDoc(again.id, (again.data() ?? {}) as Record<string, unknown>);
}

/** מסיר את המזהה מכל ההזדמנויות והלידים (batch) */
export async function deleteLabel(id: string): Promise<void> {
  const db = await getAdminDb();
  const dbId = await getRequestTenantDatabaseId();
  const ref = db.collection("labels").doc(id);
  const snap = await ref.get();
  if (!snap.exists) return;

  const opps = await db.collection("opportunities").where("labelIds", "array-contains", id).get();
  const leads = await db.collection("leads").where("labelIds", "array-contains", id).get();

  let batch = db.batch();
  let n = 0;
  const commitIfNeeded = async () => {
    if (n >= 450) {
      await batch.commit();
      batch = db.batch();
      n = 0;
    }
  };

  for (const doc of opps.docs) {
    const d = (doc.data() ?? {}) as Record<string, unknown>;
    const cur = Array.isArray(d.labelIds) ? (d.labelIds as string[]).filter((x) => x !== id) : [];
    batch.update(doc.ref, { labelIds: cur, updatedAt: FieldValue.serverTimestamp() });
    n++;
    await commitIfNeeded();
  }
  for (const doc of leads.docs) {
    const d = (doc.data() ?? {}) as Record<string, unknown>;
    const cur = Array.isArray(d.labelIds) ? (d.labelIds as string[]).filter((x) => x !== id) : [];
    batch.update(doc.ref, { labelIds: cur, updatedAt: FieldValue.serverTimestamp() });
    n++;
    await commitIfNeeded();
  }
  batch.delete(ref);
  n++;
  await batch.commit();
  invalidateTenantCachePrefix(`lbl:${dbId}`);
}

export async function normalizeIncomingLabelIds(input: {
  labelIds?: string[];
  tags?: string[];
}): Promise<string[]> {
  const rawIds = (input.labelIds ?? []).map((x) => String(x).trim()).filter(Boolean);
  if (rawIds.length) return Array.from(new Set(rawIds));
  const tagStrs = (input.tags ?? []).map((x) => String(x).trim()).filter(Boolean);
  if (!tagStrs.length) return [];
  const labels = await listLabels();
  const byName = new Map(labels.map((l) => [l.name.trim().toLowerCase(), l.id]));
  const out: string[] = [];
  for (const t of tagStrs) {
    const id = byName.get(t.toLowerCase());
    if (id) out.push(id);
  }
  return Array.from(new Set(out));
}

export function enrichOpportunitiesForApi<T extends { labelIds?: string[]; tags?: string[] }>(
  opportunities: T[],
  catalog: LabelRecord[]
): Array<
  T & {
    labelIds: string[];
    labels: ResolvedLabel[];
    tags: string[];
  }
> {
  const byId = new Map(catalog.map((l) => [l.id, l]));
  const byName = new Map(catalog.map((l) => [l.name.trim().toLowerCase(), l]));

  return opportunities.map((o) => {
    let ids = [...(o.labelIds ?? [])];
    if (!ids.length && (o.tags?.length ?? 0) > 0) {
      ids = (o.tags ?? [])
        .map((t) => byName.get(String(t).trim().toLowerCase())?.id)
        .filter(Boolean) as string[];
    }
    const labels: ResolvedLabel[] = ids.map((lid) => {
      const L = byId.get(lid);
      return L
        ? { id: L.id, name: L.name, color: L.color }
        : { id: lid, name: lid, color: "#9ca3af" };
    });
    return {
      ...o,
      labelIds: ids,
      labels,
      tags: labels.map((x) => x.name),
    };
  });
}
