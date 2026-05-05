import { FieldValue } from "firebase-admin/firestore";
import { getAdminDb } from "@/lib/firebase/admin";

export type InquiryRecord = {
  id: string;
  content: string;
  responseDraft?: string;
  reminderAt?: string;
  makeTask?: boolean;
  contactId?: string;
  contactName?: string;
  taskId?: string;
  status: "open" | "scheduled" | "answered";
  createdAt: Date | null;
  updatedAt: Date | null;
};

type UpsertInquiryInput = {
  content: string;
  responseDraft?: string;
  reminderAt?: string;
  makeTask?: boolean;
  contactId?: string;
  contactName?: string;
  taskId?: string;
  status?: "open" | "scheduled" | "answered";
};

const COLLECTION = "inquiries";

function mapTs(ts: unknown): Date | null {
  if (ts && typeof ts === "object" && "toDate" in ts) {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    return (ts as any).toDate?.() ?? null;
  }
  return null;
}

function readInquiryDoc(id: string, d: Record<string, unknown>): InquiryRecord {
  const statusRaw = String(d.status ?? "open").trim();
  const status: InquiryRecord["status"] =
    statusRaw === "scheduled" || statusRaw === "answered" ? statusRaw : "open";
  return {
    id,
    content: String(d.content ?? "").trim(),
    responseDraft: typeof d.responseDraft === "string" ? d.responseDraft : undefined,
    reminderAt: typeof d.reminderAt === "string" ? d.reminderAt : undefined,
    makeTask: Boolean(d.makeTask),
    contactId: typeof d.contactId === "string" ? d.contactId : undefined,
    contactName: typeof d.contactName === "string" ? d.contactName : undefined,
    taskId: typeof d.taskId === "string" ? d.taskId : undefined,
    status,
    createdAt: mapTs(d.createdAt),
    updatedAt: mapTs(d.updatedAt),
  };
}

export async function listInquiries(): Promise<InquiryRecord[]> {
  const db = await getAdminDb();
  const snap = await db.collection(COLLECTION).limit(500).get();
  return snap.docs.map((doc) => readInquiryDoc(doc.id, (doc.data() ?? {}) as Record<string, unknown>));
}

export async function createInquiry(input: UpsertInquiryInput): Promise<InquiryRecord> {
  const content = input.content.trim();
  if (!content) throw new Error("תוכן פנייה נדרש");
  const db = await getAdminDb();
  const now = FieldValue.serverTimestamp();
  const ref = await db.collection(COLLECTION).add({
    content,
    responseDraft: input.responseDraft?.trim() ?? "",
    reminderAt: input.reminderAt?.trim() ?? "",
    makeTask: Boolean(input.makeTask),
    contactId: input.contactId?.trim() ?? "",
    contactName: input.contactName?.trim() ?? "",
    taskId: input.taskId?.trim() ?? "",
    status: input.status ?? "open",
    createdAt: now,
    updatedAt: now,
  });
  const again = await ref.get();
  return readInquiryDoc(ref.id, (again.data() ?? {}) as Record<string, unknown>);
}

