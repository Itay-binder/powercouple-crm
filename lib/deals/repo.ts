import { FieldValue } from "firebase-admin/firestore";
import { getAdminDb } from "@/lib/firebase/admin";

export type PropertyDealRecord = {
  id: string;
  name: string;
  clientCount?: number;
  dealType?: string;
  city?: string;
  fullAddress?: string;
  linkedContactIds: string[];
  saleAgreementUrl?: string;
  driveFolderUrl?: string;
  businessPlanUrl?: string;
  /** בהתאמה | נחתם | סיום רכישה | נמכר */
  status?: string;
  notes?: string;
  createdAt: Date | null;
  updatedAt: Date | null;
};

const COLLECTION = "property_deals";

function mapTs(ts: unknown): Date | null {
  if (ts && typeof ts === "object" && "toDate" in ts) {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    return (ts as any).toDate?.() ?? null;
  }
  return null;
}

function readDealDoc(id: string, d: Record<string, unknown>): PropertyDealRecord {
  const links = d.linkedContactIds;
  const linkedContactIds = Array.isArray(links)
    ? links.map((x) => String(x).trim()).filter(Boolean)
    : typeof links === "string"
      ? links
          .split(",")
          .map((s) => s.trim())
          .filter(Boolean)
      : [];
  return {
    id,
    name: String(d.name ?? "").trim() || "ללא שם",
    clientCount: typeof d.clientCount === "number" ? d.clientCount : undefined,
    dealType: typeof d.dealType === "string" ? d.dealType : undefined,
    city: typeof d.city === "string" ? d.city : undefined,
    fullAddress: typeof d.fullAddress === "string" ? d.fullAddress : undefined,
    linkedContactIds,
    saleAgreementUrl: typeof d.saleAgreementUrl === "string" ? d.saleAgreementUrl : undefined,
    driveFolderUrl: typeof d.driveFolderUrl === "string" ? d.driveFolderUrl : undefined,
    businessPlanUrl: typeof d.businessPlanUrl === "string" ? d.businessPlanUrl : undefined,
    status: typeof d.status === "string" ? d.status : undefined,
    notes: typeof d.notes === "string" ? d.notes : undefined,
    createdAt: mapTs(d.createdAt),
    updatedAt: mapTs(d.updatedAt),
  };
}

export async function listPropertyDeals(): Promise<PropertyDealRecord[]> {
  const db = await getAdminDb();
  const snap = await db.collection(COLLECTION).limit(500).get();
  return snap.docs.map((doc) => readDealDoc(doc.id, (doc.data() ?? {}) as Record<string, unknown>));
}

export async function getPropertyDeal(id: string): Promise<PropertyDealRecord | null> {
  const db = await getAdminDb();
  const snap = await db.collection(COLLECTION).doc(id).get();
  if (!snap.exists) return null;
  return readDealDoc(snap.id, (snap.data() ?? {}) as Record<string, unknown>);
}

export type UpsertPropertyDealInput = {
  name: string;
  clientCount?: number;
  dealType?: string;
  city?: string;
  fullAddress?: string;
  linkedContactIds?: string[];
  saleAgreementUrl?: string;
  driveFolderUrl?: string;
  businessPlanUrl?: string;
  status?: string;
  notes?: string;
};

export async function createPropertyDeal(input: UpsertPropertyDealInput): Promise<PropertyDealRecord> {
  const db = await getAdminDb();
  const name = input.name.trim();
  if (!name) throw new Error("שם עסקה נדרש");
  const now = FieldValue.serverTimestamp();
  const ref = await db.collection(COLLECTION).add({
    name,
    clientCount: typeof input.clientCount === "number" ? input.clientCount : 0,
    dealType: input.dealType?.trim() ?? "",
    city: input.city?.trim() ?? "",
    fullAddress: input.fullAddress?.trim() ?? "",
    linkedContactIds: input.linkedContactIds ?? [],
    saleAgreementUrl: input.saleAgreementUrl?.trim() ?? "",
    driveFolderUrl: input.driveFolderUrl?.trim() ?? "",
    businessPlanUrl: input.businessPlanUrl?.trim() ?? "",
    status: input.status?.trim() ?? "בהתאמה",
    notes: input.notes?.trim() ?? "",
    createdAt: now,
    updatedAt: now,
  });
  const again = await ref.get();
  return readDealDoc(ref.id, (again.data() ?? {}) as Record<string, unknown>);
}

export async function updatePropertyDeal(
  id: string,
  patch: Partial<UpsertPropertyDealInput>
): Promise<PropertyDealRecord> {
  const db = await getAdminDb();
  const ref = db.collection(COLLECTION).doc(id);
  const snap = await ref.get();
  if (!snap.exists) throw new Error("עסקה לא נמצאה");

  const payload: Record<string, unknown> = { updatedAt: FieldValue.serverTimestamp() };
  if (patch.name != null) payload.name = patch.name.trim();
  if (patch.clientCount != null) payload.clientCount = patch.clientCount;
  if (patch.dealType != null) payload.dealType = patch.dealType.trim();
  if (patch.city != null) payload.city = patch.city.trim();
  if (patch.fullAddress != null) payload.fullAddress = patch.fullAddress.trim();
  if (patch.linkedContactIds != null) payload.linkedContactIds = patch.linkedContactIds;
  if (patch.saleAgreementUrl != null) payload.saleAgreementUrl = patch.saleAgreementUrl.trim();
  if (patch.driveFolderUrl != null) payload.driveFolderUrl = patch.driveFolderUrl.trim();
  if (patch.businessPlanUrl != null) payload.businessPlanUrl = patch.businessPlanUrl.trim();
  if (patch.status != null) payload.status = patch.status.trim();
  if (patch.notes != null) payload.notes = patch.notes.trim();

  await ref.set(payload, { merge: true });
  const again = await ref.get();
  return readDealDoc(id, (again.data() ?? {}) as Record<string, unknown>);
}

/** חיפוש טקסטואלי פשוט (שם / עיר / כתובת) */
export async function searchPropertyDeals(q: string): Promise<PropertyDealRecord[]> {
  const needle = q.trim().toLowerCase();
  if (!needle) return [];
  const all = await listPropertyDeals();
  return all.filter((d) => {
    const blob = [d.name, d.city, d.fullAddress, d.status, d.notes]
      .filter(Boolean)
      .join(" ")
      .toLowerCase();
    return blob.includes(needle);
  });
}
