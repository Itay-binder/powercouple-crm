import { FieldValue } from "firebase-admin/firestore";
import { getAdminDb } from "@/lib/firebase/admin";

export type PropertyDealRecord = {
  id: string;
  name: string;
  /** פייפליין עסקאות נדל״ן (`scope: property_deal`) */
  pipelineId?: string;
  /** שלב בתוך הפייפליין */
  pipelineStage?: string;
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
  tasks?: Array<{
    id: string;
    title: string;
    dueAt: string;
    reminderAt?: string;
    done: boolean;
    status?: "todo" | "in_progress" | "done";
    comments?: Array<{ id: string; text: string; createdAt: string }>;
    createdAt: string;
  }>;
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
    pipelineId: typeof d.pipelineId === "string" ? d.pipelineId.trim() : undefined,
    pipelineStage: typeof d.pipelineStage === "string" ? d.pipelineStage.trim() : undefined,
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
    tasks: Array.isArray(d.tasks)
      ? (d.tasks as Array<{
          id: string;
          title: string;
          dueAt: string;
          reminderAt?: string;
          done: boolean;
          status?: "todo" | "in_progress" | "done";
          comments?: Array<{ id: string; text: string; createdAt: string }>;
          createdAt: string;
        }>)
      : undefined,
    createdAt: mapTs(d.createdAt),
    updatedAt: mapTs(d.updatedAt),
  };
}

async function syncDealNotesToLinkedContacts(input: {
  linkedContactIds: string[];
  noteText: string;
  dealId: string;
  dealName: string;
}): Promise<void> {
  const text = input.noteText.trim();
  const contactIds = Array.from(new Set(input.linkedContactIds.map((x) => x.trim()).filter(Boolean)));
  if (!text || contactIds.length === 0) return;
  const db = await getAdminDb();
  await Promise.all(
    contactIds.map(async (cid) => {
      const ref = db.collection("leads").doc(cid);
      const snap = await ref.get();
      if (!snap.exists) return;
      const data = (snap.data() ?? {}) as Record<string, unknown>;
      const prev = Array.isArray(data.notes)
        ? (data.notes as Array<{ id: string; text: string; createdAt: string; createdBy?: string; category?: string }>)
        : [];
      const marker = `[Deal ${input.dealName || input.dealId}]`;
      const nextText = `${marker} ${text}`.trim();
      if (prev.some((n) => String(n.text ?? "").trim() === nextText)) return;
      await ref.set(
        {
          notes: [
            ...prev,
            {
              id: crypto.randomUUID(),
              text: nextText,
              createdAt: new Date().toISOString(),
              createdBy: "מערכת עסקאות",
              category: "עסקאות נדל\"ן",
            },
          ],
          updatedAt: FieldValue.serverTimestamp(),
        },
        { merge: true }
      );
    })
  );
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
  pipelineId?: string;
  pipelineStage?: string;
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
  tasks?: Array<{
    id: string;
    title: string;
    dueAt: string;
    reminderAt?: string;
    done: boolean;
    status?: "todo" | "in_progress" | "done";
    comments?: Array<{ id: string; text: string; createdAt: string }>;
    createdAt: string;
  }>;
};

export async function createPropertyDeal(input: UpsertPropertyDealInput): Promise<PropertyDealRecord> {
  const db = await getAdminDb();
  const name = input.name.trim();
  if (!name) throw new Error("שם עסקה נדרש");
  const now = FieldValue.serverTimestamp();
  const pid = input.pipelineId?.trim();
  const pst = input.pipelineStage?.trim();
  const ref = await db.collection(COLLECTION).add({
    name,
    ...(pid ? { pipelineId: pid } : {}),
    ...(pst ? { pipelineStage: pst } : {}),
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
    tasks: input.tasks ?? [],
    createdAt: now,
    updatedAt: now,
  });
  const again = await ref.get();
  const created = readDealDoc(ref.id, (again.data() ?? {}) as Record<string, unknown>);
  if (created.notes?.trim()) {
    await syncDealNotesToLinkedContacts({
      linkedContactIds: created.linkedContactIds,
      noteText: created.notes,
      dealId: created.id,
      dealName: created.name,
    });
  }
  return created;
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
  if (patch.pipelineId !== undefined) {
    const x = patch.pipelineId.trim();
    payload.pipelineId = x || FieldValue.delete();
  }
  if (patch.pipelineStage !== undefined) {
    const x = patch.pipelineStage.trim();
    payload.pipelineStage = x || FieldValue.delete();
  }
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
  if (patch.tasks != null) payload.tasks = patch.tasks;

  await ref.set(payload, { merge: true });
  const again = await ref.get();
  const updated = readDealDoc(id, (again.data() ?? {}) as Record<string, unknown>);
  if (patch.notes !== undefined) {
    await syncDealNotesToLinkedContacts({
      linkedContactIds: updated.linkedContactIds,
      noteText: updated.notes ?? "",
      dealId: updated.id,
      dealName: updated.name,
    });
  }
  return updated;
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
