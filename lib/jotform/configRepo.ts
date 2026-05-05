import { FieldValue } from "firebase-admin/firestore";
import { getAdminDb } from "@/lib/firebase/admin";

export type JotformFieldMapping = {
  questionId: string;
  label: string;
  questionType: string;
  contactFieldId: string;
  opportunityFieldId: string;
  isFile: boolean;
};

export type JotformIntegrationConfig = {
  enabled: boolean;
  apiKey?: string;
  formId?: string;
  formUrl?: string;
  driveParentFolderId?: string;
  webhookToken?: string;
  mappings: JotformFieldMapping[];
  updatedAt?: Date | null;
};

const COLLECTION = "integrationSettings";
const DOC_ID = "jotform";

function mapTs(ts: unknown): Date | null {
  if (ts && typeof ts === "object" && "toDate" in ts) {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    return (ts as any).toDate?.() ?? null;
  }
  return null;
}

export function parseJotformFormId(input: string): string {
  const raw = input.trim();
  if (!raw) return "";
  if (/^\d{6,}$/.test(raw)) return raw;
  const m = raw.match(/jotform\.com\/(\d{6,})/i);
  if (m?.[1]) return m[1];
  return "";
}

export function parseDriveFolderId(input: string): string {
  const raw = input.trim();
  if (!raw) return "";
  const m = raw.match(/\/folders\/([a-zA-Z0-9_-]+)/);
  if (m?.[1]) return m[1];
  if (/^[a-zA-Z0-9_-]{10,}$/.test(raw)) return raw;
  return "";
}

export async function getJotformConfig(): Promise<JotformIntegrationConfig> {
  const db = await getAdminDb();
  const snap = await db.collection(COLLECTION).doc(DOC_ID).get();
  if (!snap.exists) return { enabled: false, mappings: [] };
  const d = (snap.data() ?? {}) as Record<string, unknown>;
  const mappings = Array.isArray(d.mappings)
    ? d.mappings
        .filter((x) => x && typeof x === "object")
        .map((x) => {
          const m = x as Record<string, unknown>;
          return {
            questionId: String(m.questionId ?? "").trim(),
            label: String(m.label ?? "").trim(),
            questionType: String(m.questionType ?? "").trim(),
            contactFieldId: String(m.contactFieldId ?? "").trim(),
            opportunityFieldId: String(m.opportunityFieldId ?? "").trim(),
            isFile: Boolean(m.isFile),
          } satisfies JotformFieldMapping;
        })
        .filter((m) => m.questionId && m.contactFieldId && m.opportunityFieldId)
    : [];
  return {
    enabled: Boolean(d.enabled),
    apiKey: typeof d.apiKey === "string" ? d.apiKey : undefined,
    formId: typeof d.formId === "string" ? d.formId : undefined,
    formUrl: typeof d.formUrl === "string" ? d.formUrl : undefined,
    driveParentFolderId:
      typeof d.driveParentFolderId === "string" ? d.driveParentFolderId : undefined,
    webhookToken: typeof d.webhookToken === "string" ? d.webhookToken : undefined,
    mappings,
    updatedAt: mapTs(d.updatedAt),
  };
}

export async function saveJotformConfig(
  patch: Partial<JotformIntegrationConfig>
): Promise<JotformIntegrationConfig> {
  const db = await getAdminDb();
  const ref = db.collection(COLLECTION).doc(DOC_ID);
  const payload: Record<string, unknown> = { updatedAt: FieldValue.serverTimestamp() };
  if (patch.enabled !== undefined) payload.enabled = Boolean(patch.enabled);
  if (patch.apiKey !== undefined) payload.apiKey = patch.apiKey.trim();
  if (patch.formId !== undefined) payload.formId = patch.formId.trim();
  if (patch.formUrl !== undefined) payload.formUrl = patch.formUrl.trim();
  if (patch.driveParentFolderId !== undefined) {
    payload.driveParentFolderId = patch.driveParentFolderId.trim();
  }
  if (patch.webhookToken !== undefined) payload.webhookToken = patch.webhookToken.trim();
  if (patch.mappings !== undefined) payload.mappings = patch.mappings;
  await ref.set(payload, { merge: true });
  return getJotformConfig();
}

