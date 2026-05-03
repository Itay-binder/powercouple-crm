import { FieldValue } from "firebase-admin/firestore";
import { getAdminDb } from "@/lib/firebase/admin";

export type CheckoutPageRecord = {
  id: string;
  name: string;
  url: string;
  isActive: boolean;
  createdAt: Date | null;
  updatedAt: Date | null;
};

function mapTs(ts: unknown): Date | null {
  if (ts && typeof ts === "object" && "toDate" in ts) {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    return (ts as any).toDate?.() ?? null;
  }
  return null;
}

function normalizeUrl(raw: string): string {
  const trimmed = raw.trim();
  if (!trimmed) throw new Error("url is required");
  if (/^https?:\/\//i.test(trimmed)) return trimmed;
  return `https://${trimmed}`;
}

export async function listCheckoutPages(): Promise<CheckoutPageRecord[]> {
  const db = await getAdminDb();
  const snap = await db.collection("checkoutPages").get();
  const out = snap.docs.map((doc) => {
    const d = (doc.data() ?? {}) as Record<string, unknown>;
    return {
      id: doc.id,
      name: String(d.name ?? ""),
      url: String(d.url ?? ""),
      isActive: d.isActive !== false,
      createdAt: mapTs(d.createdAt),
      updatedAt: mapTs(d.updatedAt),
    } satisfies CheckoutPageRecord;
  });
  return out.sort((a, b) => {
    const at = a.createdAt?.getTime() ?? 0;
    const bt = b.createdAt?.getTime() ?? 0;
    return bt - at;
  });
}

export async function createCheckoutPage(input: {
  name?: string;
  url: string;
}): Promise<CheckoutPageRecord> {
  const url = normalizeUrl(input.url);
  const name = input.name?.trim() || new URL(url).hostname;
  const now = FieldValue.serverTimestamp();
  const dbAdd = await getAdminDb();
  const ref = await dbAdd.collection("checkoutPages").add({
    name,
    url,
    isActive: true,
    createdAt: now,
    updatedAt: now,
  });
  const snap = await ref.get();
  const d = (snap.data() ?? {}) as Record<string, unknown>;
  return {
    id: snap.id,
    name: String(d.name ?? name),
    url: String(d.url ?? url),
    isActive: d.isActive !== false,
    createdAt: mapTs(d.createdAt),
    updatedAt: mapTs(d.updatedAt),
  };
}

export async function updateCheckoutPage(
  id: string,
  input: { name?: string; url?: string; isActive?: boolean }
): Promise<CheckoutPageRecord> {
  const dbUp = await getAdminDb();
  const ref = dbUp.collection("checkoutPages").doc(id);
  const snap = await ref.get();
  if (!snap.exists) throw new Error("Checkout page not found");
  const payload: Record<string, unknown> = {
    updatedAt: FieldValue.serverTimestamp(),
  };
  if (input.name !== undefined) payload.name = input.name.trim();
  if (input.url !== undefined) payload.url = normalizeUrl(input.url);
  if (input.isActive !== undefined) payload.isActive = input.isActive;
  await ref.set(payload, { merge: true });
  const again = await ref.get();
  const d = (again.data() ?? {}) as Record<string, unknown>;
  return {
    id: again.id,
    name: String(d.name ?? ""),
    url: String(d.url ?? ""),
    isActive: d.isActive !== false,
    createdAt: mapTs(d.createdAt),
    updatedAt: mapTs(d.updatedAt),
  };
}

export async function deleteCheckoutPage(id: string): Promise<void> {
  const dbDel = await getAdminDb();
  await dbDel.collection("checkoutPages").doc(id).delete();
}

