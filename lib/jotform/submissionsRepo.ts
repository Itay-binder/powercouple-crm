import { FieldValue } from "firebase-admin/firestore";
import { getAdminDb } from "@/lib/firebase/admin";
import type { JotformAnswer } from "@/lib/jotform/client";

export type JotformSubmissionRecord = {
  id: string;
  submissionId: string;
  formId: string;
  contactId?: string;
  opportunityId?: string;
  customerName?: string;
  customerPhone?: string;
  customerEmail?: string;
  driveFolderUrl?: string;
  answers: JotformAnswer[];
  files: Array<{ label: string; url: string }>;
  submittedAt: string;
  createdAt: Date | null;
};

const COLLECTION = "jotformSubmissions";

function mapTs(ts: unknown): Date | null {
  if (ts && typeof ts === "object" && "toDate" in ts) {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    return (ts as any).toDate?.() ?? null;
  }
  return null;
}

function toRecord(id: string, d: Record<string, unknown>): JotformSubmissionRecord {
  return {
    id,
    submissionId: String(d.submissionId ?? "").trim(),
    formId: String(d.formId ?? "").trim(),
    contactId: typeof d.contactId === "string" ? d.contactId : undefined,
    opportunityId: typeof d.opportunityId === "string" ? d.opportunityId : undefined,
    customerName: typeof d.customerName === "string" ? d.customerName : undefined,
    customerPhone: typeof d.customerPhone === "string" ? d.customerPhone : undefined,
    customerEmail: typeof d.customerEmail === "string" ? d.customerEmail : undefined,
    driveFolderUrl: typeof d.driveFolderUrl === "string" ? d.driveFolderUrl : undefined,
    answers: Array.isArray(d.answers)
      ? (d.answers as JotformAnswer[])
      : [],
    files: Array.isArray(d.files)
      ? (d.files as Array<{ label: string; url: string }>)
      : [],
    submittedAt: String(d.submittedAt ?? ""),
    createdAt: mapTs(d.createdAt),
  };
}

export async function upsertJotformSubmission(input: {
  submissionId: string;
  formId: string;
  contactId?: string;
  opportunityId?: string;
  customerName?: string;
  customerPhone?: string;
  customerEmail?: string;
  driveFolderUrl?: string;
  answers: JotformAnswer[];
  files: Array<{ label: string; url: string }>;
  submittedAt: string;
}): Promise<void> {
  const db = await getAdminDb();
  const id = `${input.formId}_${input.submissionId}`.replace(/[^\w\-]/g, "_");
  await db.collection(COLLECTION).doc(id).set(
    {
      submissionId: input.submissionId,
      formId: input.formId,
      contactId: input.contactId ?? "",
      opportunityId: input.opportunityId ?? "",
      customerName: input.customerName ?? "",
      customerPhone: input.customerPhone ?? "",
      customerEmail: input.customerEmail ?? "",
      driveFolderUrl: input.driveFolderUrl ?? "",
      answers: input.answers,
      files: input.files,
      submittedAt: input.submittedAt,
      createdAt: FieldValue.serverTimestamp(),
      updatedAt: FieldValue.serverTimestamp(),
    },
    { merge: true }
  );
}

export async function listJotformSubmissionsByTarget(input: {
  contactId?: string;
  opportunityId?: string;
}): Promise<JotformSubmissionRecord[]> {
  const db = await getAdminDb();
  let snap;
  if (input.opportunityId?.trim()) {
    snap = await db.collection(COLLECTION).where("opportunityId", "==", input.opportunityId.trim()).limit(100).get();
  } else if (input.contactId?.trim()) {
    snap = await db.collection(COLLECTION).where("contactId", "==", input.contactId.trim()).limit(100).get();
  } else {
    return [];
  }
  return snap.docs
    .map((doc) => toRecord(doc.id, (doc.data() ?? {}) as Record<string, unknown>))
    .sort((a, b) => String(b.submittedAt).localeCompare(String(a.submittedAt)));
}

