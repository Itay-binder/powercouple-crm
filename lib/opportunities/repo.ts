import { randomUUID } from "crypto";
import { FieldValue, Timestamp, type Firestore } from "firebase-admin/firestore";
import { getAdminDb, getRequestTenantDatabaseId } from "@/lib/firebase/admin";
import { invalidateTenantCachePrefix, withTenantTtlCache } from "@/lib/server/tenantMemoryCache";
import { allocateRunningCode } from "@/lib/counters/repo";
import { getTenantByDatabaseId } from "@/lib/tenant/config";
import { reconcileContactNotesAcrossEntities } from "@/lib/notes/contactNotesSync";
import { mergeTaskArrays, type RawTaskIn } from "@/lib/tasks/merge";
import { reconcileTasksGoogleCalendar } from "@/lib/googleCalendar/taskSync";
import { fireServerWebhooks } from "@/lib/webhooks/dispatchServerWebhooks";
import { formatIsraelDateTime } from "@/lib/datetime/formatIsrael";
import { normalizeIncomingLabelIds } from "@/lib/labels/repo";
import { ensureMovingOrdersIntakePipeline } from "@/lib/movingOrders/ensureIntakePipeline";
import { MOVING_ORDERS_INTAKE_PIPELINE_ID } from "@/lib/movingOrders/pipelineConstants";
import { statusFromStage } from "@/lib/movingOrders/stageSync";
import { normalizePhone } from "@/lib/leads/repo";
import {
  PC_SALES_PIPELINE_NAME,
  PC_SALES_STAGES,
  PC_WON_STAGE_LABEL,
} from "@/lib/product/powercoupleSpec";

const PIPELINES_LIST_CACHE_TTL_MS = 45_000;

export type PipelineScope = "opportunity" | "moving_order";

export type PipelineRecord = {
  id: string;
  name: string;
  stages: string[];
  scope: PipelineScope;
  createdAt: Date | null;
  updatedAt: Date | null;
};

export type OpportunityRecord = {
  id: string;
  opportunityCode?: string;
  name: string;
  contactId: string;
  contactName?: string;
  contactEmail?: string;
  contactPhone?: string;
  email?: string;
  phone?: string;
  pipelineId: string;
  stage: string;
  status?: "פתוח" | "זכיה" | "הפסד";
  value?: number;
  utmSource?: string;
  utmCampaign?: string;
  utmMedium?: string;
  utmContent?: string;
  landingpage?: string;
  /** מזהי תגיות מקטלוג labels (מומלץ) */
  labelIds?: string[];
  /** @deprecated טקסט חופשי ישן; יוחלף ב-labelIds */
  tags?: string[];
  lastLeadAt?: Date | null;
  customValues?: Record<string, unknown>;
  assignedRep?: string;
  notes?: Array<{
    id: string;
    text: string;
    createdAt: string;
    createdBy?: string;
    category?: string;
    attachments?: Array<{ id: string; fileName: string; url: string }>;
  }>;
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

export type CreatePipelineInput = {
  name: string;
  stages: string[];
  scope?: PipelineScope;
};

export type CreateOpportunityInput = {
  name?: string;
  contactId: string;
  pipelineId?: string;
  stage?: string;
  value?: number;
  status?: "פתוח" | "זכיה" | "הפסד";
  email?: string;
  phone?: string;
  utmSource?: string;
  utmCampaign?: string;
  utmMedium?: string;
  utmContent?: string;
  landingpage?: string;
  labelIds?: string[];
  tags?: string[];
  customValues?: Record<string, unknown>;
  assignedRep?: string;
  /** ISO — היסטוריית ייבוא: תאריך יצירה במסמך */
  createdAt?: string;
  /** ISO — אם ריק נגזר מ-createdAt או שעת שרת */
  updatedAt?: string;
  /** כאשר true — לא נוספת הפתק האוטומטי "ליד חדש" (למשל ייבוא עם פתקים מהמקור) */
  skipInitialAutoNote?: boolean;
};

function parseIsoFirestoreTimestamp(iso: string | undefined): Timestamp | null {
  if (!iso?.trim()) return null;
  const d = new Date(iso.trim());
  if (Number.isNaN(d.getTime())) return null;
  return Timestamp.fromDate(d);
}

function readStringIdArray(raw: unknown): string[] {
  if (!Array.isArray(raw)) return [];
  return Array.from(new Set(raw.map((x) => String(x).trim()).filter(Boolean)));
}

function mapTs(ts: unknown): Date | null {
  if (ts && typeof ts === "object" && "toDate" in ts) {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    return (ts as any).toDate?.() ?? null;
  }
  return null;
}

async function shouldSeedDefaultPipeline(): Promise<boolean> {
  const dbId = await getRequestTenantDatabaseId();
  const t = getTenantByDatabaseId(dbId);
  if (t?.seedDefaultPipeline === false) return false;
  return true;
}

function buildNewOpportunityLeadNoteText(params: {
  opportunityName: string;
  fullName: string;
  phone: string;
  email: string;
  utmSource: string;
  utmCampaign: string;
  utmMedium: string;
  utmContent: string;
  createdAtLabel: string;
}): string {
  const dash = (s: string) => (s.trim() ? s.trim() : "—");
  return [
    `ליד חדש - ${dash(params.opportunityName)}`,
    "",
    `שם מלא: ${dash(params.fullName)}`,
    `פלאפון: ${dash(params.phone)}`,
    `מייל: ${dash(params.email)}`,
    `utm_source: ${dash(params.utmSource)}`,
    `utm_campaign: ${dash(params.utmCampaign)}`,
    `utm_medium: ${dash(params.utmMedium)}`,
    `utm_content: ${dash(params.utmContent)}`,
    `תאריך יצירה: ${params.createdAtLabel}`,
  ].join("\n");
}

function normalizeStages(stages: string[]): string[] {
  const out = stages
    .map((s) => s.trim().replace(/\s+/g, " "))
    .filter(Boolean);
  return Array.from(new Set(out));
}

function readPipelineScope(d: Record<string, unknown>): PipelineScope {
  return d.scope === "moving_order" ? "moving_order" : "opportunity";
}

function opportunityStagesByPipelineId(
  docs: Array<{ id: string; data: () => Record<string, unknown> | undefined }>
): Map<string, string[]> {
  return new Map(
    docs
      .map((doc) => {
        const d = (doc.data() ?? {}) as Record<string, unknown>;
        if (readPipelineScope(d) !== "opportunity") return null;
        return [doc.id, normalizeStages((d.stages as string[] | undefined) ?? [])] as const;
      })
      .filter((x): x is readonly [string, string[]] => x !== null)
  );
}

export async function getPipelineById(id: string): Promise<PipelineRecord | null> {
  const db = await getAdminDb();
  const snap = await db.collection("pipelines").doc(id).get();
  if (!snap.exists) return null;
  const d = (snap.data() ?? {}) as Record<string, unknown>;
  return {
    id: snap.id,
    name: String(d.name ?? ""),
    stages: normalizeStages((d.stages as string[] | undefined) ?? []),
    scope: readPipelineScope(d),
    createdAt: mapTs(d.createdAt),
    updatedAt: mapTs(d.updatedAt),
  };
}

/** Pipeline stage name that triggers win automation (note + customer pipeline opportunity). */
export const WON_PIPELINE_STAGE_LABEL = PC_WON_STAGE_LABEL;

const CUSTOMERS_PIPELINE_ID = "customers";

function normalizeStageLabel(s: string): string {
  return s.trim().replace(/\s+/g, " ");
}

export async function ensureCustomersPipeline(): Promise<PipelineRecord> {
  const db = await getAdminDb();
  const ref = db.collection("pipelines").doc(CUSTOMERS_PIPELINE_ID);
  const snap = await ref.get();
  if (!snap.exists) {
    const now = FieldValue.serverTimestamp();
    await ref.set({
      name: "לקוחות",
      stages: ["חדש"],
      scope: "opportunity",
      createdAt: now,
      updatedAt: now,
    });
  }
  const again = await ref.get();
  const d = (again.data() ?? {}) as Record<string, unknown>;
  return {
    id: again.id,
    name: String(d.name ?? "לקוחות"),
    stages: normalizeStages((d.stages as string[] | undefined) ?? ["חדש"]),
    scope: readPipelineScope(d),
    createdAt: mapTs(d.createdAt),
    updatedAt: mapTs(d.updatedAt),
  };
}

function pipelineNameSignalsPayingCustomers(name: string): boolean {
  const collapsed = name.trim().toLowerCase().replace(/\s+/g, "");
  if (collapsed.includes("משלמים")) return true;
  if (collapsed === "לקוחות") return true;
  return /לקוחות[\s_-]*משלמים/i.test(name);
}

/** כמה פייפליינים תואמים — עדיפות ל«לקוחות משלמים» המלא */
function payingCustomersPipelineSortKey(name: string): number {
  const c = name.trim().toLowerCase().replace(/\s+/g, "");
  if (c.includes("לקוחות") && c.includes("משלמים")) return 0;
  if (c.includes("משלמים")) return 1;
  return 2;
}

/**
 * פייפליין ניהול ההזדמנויות «לקוחות משלמים» (כמו במסך הפייפליין אצלך).
 * סדר: CRM_PAYING_CUSTOMERS_PIPELINE_ID → שם פייפליין תואם → מסמך customers → יצירה.
 */
export async function getPayingCustomersPipelineId(): Promise<string> {
  const envId = process.env.CRM_PAYING_CUSTOMERS_PIPELINE_ID?.trim();
  if (envId) return envId;

  const db = await getAdminDb();
  const pipelinesSnap = await db.collection("pipelines").get();

  const matches: Array<{ id: string; name: string }> = [];
  for (const doc of pipelinesSnap.docs) {
    const d = (doc.data() ?? {}) as Record<string, unknown>;
    if (readPipelineScope(d) !== "opportunity") continue;
    const name = String(d.name ?? "");
    if (!pipelineNameSignalsPayingCustomers(name)) continue;
    matches.push({ id: doc.id, name });
  }

  if (matches.length >= 1) {
    matches.sort((a, b) => {
      const k = payingCustomersPipelineSortKey(a.name) - payingCustomersPipelineSortKey(b.name);
      if (k !== 0) return k;
      return a.name.localeCompare(b.name, "he");
    });
    return matches[0].id;
  }

  const customersSnap = await db.collection("pipelines").doc(CUSTOMERS_PIPELINE_ID).get();
  if (customersSnap.exists) return CUSTOMERS_PIPELINE_ID;

  return (await ensureCustomersPipeline()).id;
}

export async function getPayingCustomersPipelineMeta(): Promise<{ id: string; name: string }> {
  const id = await getPayingCustomersPipelineId();
  const db = await getAdminDb();
  const snap = await db.collection("pipelines").doc(id).get();
  const name = snap.exists
    ? String((snap.data() as Record<string, unknown>).name ?? id)
    : id;
  return { id, name };
}

function normalizeOpportunityStageByPipeline(
  pipelineStagesById: Map<string, string[]>,
  pipelineId: string,
  stageRaw: unknown
): string {
  let stage = String(stageRaw ?? "").trim();
  const stages = pipelineStagesById.get(pipelineId) ?? [];
  if (stages.length === 0) return stage || "Pending";
  /** מיפוי legacy «זכיה» לשלב רכישת דירה בפייפליין החדש */
  if (normalizeStageLabel(stage) === "זכיה") {
    const win = stages.find(
      (s) => normalizeStageLabel(s) === normalizeStageLabel(WON_PIPELINE_STAGE_LABEL)
    );
    if (win) return win;
  }
  if (stage && stages.includes(stage)) return stage;
  const ns = normalizeStageLabel(stage);
  const hit = stages.find((s) => normalizeStageLabel(s) === ns);
  if (hit) return hit;
  return stages[0];
}

export async function ensureDefaultPipeline(): Promise<PipelineRecord> {
  const db = await getAdminDb();
  const ref = db.collection("pipelines").doc("default-sales");
  const snap = await ref.get();
  const now = FieldValue.serverTimestamp();

  if (!snap.exists) {
    await ref.set({
      name: PC_SALES_PIPELINE_NAME,
      stages: [...PC_SALES_STAGES],
      scope: "opportunity",
      createdAt: now,
      updatedAt: now,
    });
  } else {
    const d0 = (snap.data() ?? {}) as Record<string, unknown>;
    let cur = normalizeStages((d0.stages as string[] | undefined) ?? []);
    cur = cur.map((s) =>
      normalizeStageLabel(s) === "זכיה" ? WON_PIPELINE_STAGE_LABEL : s
    );
    const pick = new Set<string>();
    const merged: string[] = [];
    for (const s of PC_SALES_STAGES) {
      const key = normalizeStageLabel(s);
      if (!pick.has(key)) {
        merged.push(s);
        pick.add(key);
      }
    }
    for (const s of cur) {
      const key = normalizeStageLabel(s);
      if (!pick.has(key)) {
        merged.push(s);
        pick.add(key);
      }
    }
    const prevName = String(d0.name ?? "").trim();
    const nextName =
      prevName === "מוקד מכירות" || prevName === "" ? PC_SALES_PIPELINE_NAME : prevName;
    await ref.set(
      {
        name: nextName,
        stages: normalizeStages(merged),
        updatedAt: now,
      },
      { merge: true }
    );
  }

  const again = await ref.get();
  const d = (again.data() ?? {}) as Record<string, unknown>;
  return {
    id: again.id,
    name: String(d.name ?? PC_SALES_PIPELINE_NAME),
    stages: normalizeStages((d.stages as string[] | undefined) ?? [...PC_SALES_STAGES]),
    scope: readPipelineScope(d),
    createdAt: mapTs(d.createdAt),
    updatedAt: mapTs(d.updatedAt),
  };
}

export async function listPipelinesFromDb(db: Firestore, scope: PipelineScope): Promise<PipelineRecord[]> {
  const snap = await db.collection("pipelines").get();
  const rows = snap.docs
    .map((doc) => {
      const d = (doc.data() ?? {}) as Record<string, unknown>;
      return {
        id: doc.id,
        name: String(d.name ?? ""),
        stages: normalizeStages((d.stages as string[] | undefined) ?? []),
        scope: readPipelineScope(d),
        createdAt: mapTs(d.createdAt),
        updatedAt: mapTs(d.updatedAt),
      } satisfies PipelineRecord;
    })
    .filter((p) => p.scope === scope);
  return rows.sort((a, b) => a.name.localeCompare(b.name, "he"));
}

export async function listPipelines(scope: PipelineScope = "opportunity"): Promise<PipelineRecord[]> {
  let bypassCache = false;
  if (scope === "opportunity" && (await shouldSeedDefaultPipeline())) {
    await ensureDefaultPipeline();
    await ensureCustomersPipeline();
    bypassCache = true;
  }
  if (scope === "moving_order") {
    await ensureMovingOrdersIntakePipeline();
  }
  const db = await getAdminDb();
  const dbId = await getRequestTenantDatabaseId();
  if (bypassCache) {
    invalidateTenantCachePrefix(`pl:${dbId}:`);
    return listPipelinesFromDb(db, scope);
  }
  return withTenantTtlCache(`pl:${dbId}:${scope}`, PIPELINES_LIST_CACHE_TTL_MS, () =>
    listPipelinesFromDb(db, scope)
  );
}

export async function createPipeline(input: CreatePipelineInput): Promise<PipelineRecord> {
  const db = await getAdminDb();
  const name = input.name.trim();
  if (!name) throw new Error("Pipeline name is required");
  const stages = normalizeStages(input.stages);
  if (stages.length === 0) throw new Error("At least one stage is required");

  const now = FieldValue.serverTimestamp();
  const scope: PipelineScope = input.scope ?? "opportunity";
  const ref = await db.collection("pipelines").add({
    name,
    stages,
    scope,
    createdAt: now,
    updatedAt: now,
  });
  const snap = await ref.get();
  const d = (snap.data() ?? {}) as Record<string, unknown>;
  invalidateTenantCachePrefix(`pl:${await getRequestTenantDatabaseId()}:`);
  return {
    id: snap.id,
    name: String(d.name ?? name),
    stages: normalizeStages((d.stages as string[] | undefined) ?? stages),
    scope: readPipelineScope(d),
    createdAt: mapTs(d.createdAt),
    updatedAt: mapTs(d.updatedAt),
  };
}

/** ההזדמנות האחרונה שנוצרה — לסקר התראות */
export async function getNewestOpportunityByCreatedAt(): Promise<{
  id: string;
  name: string;
  contactName: string;
  createdAt: string;
} | null> {
  const db = await getAdminDb();
  try {
    const snap = await db.collection("opportunities").orderBy("createdAt", "desc").limit(1).get();
    if (snap.empty) return null;
    const doc = snap.docs[0]!;
    const d = (doc.data() ?? {}) as Record<string, unknown>;
    const createdAt = mapTs(d.createdAt);
    if (!createdAt) return null;
    return {
      id: doc.id,
      name: String(d.name ?? "").trim(),
      contactName: String(d.contactName ?? "").trim(),
      createdAt: createdAt.toISOString(),
    };
  } catch {
    return null;
  }
}

export async function listOpportunities(pipelineId?: string | null): Promise<OpportunityRecord[]> {
  if (await shouldSeedDefaultPipeline()) {
    await ensureDefaultPipeline();
  }
  const db = await getAdminDb();
  const pipelinesSnap = await db.collection("pipelines").get();
  const pipelineStagesById = opportunityStagesByPipelineId(pipelinesSnap.docs);
  let snap;
  if (pipelineId?.trim()) {
    snap = await db.collection("opportunities").where("pipelineId", "==", pipelineId.trim()).get();
  } else {
    snap = await db.collection("opportunities").get();
  }

  const out = snap.docs.map((doc) => {
    const d = (doc.data() ?? {}) as Record<string, unknown>;
    return {
      id: doc.id,
      opportunityCode:
        typeof d.opportunityCode === "string" && d.opportunityCode.trim()
          ? d.opportunityCode.trim()
          : undefined,
      name: String(d.name ?? ""),
      contactId: String(d.contactId ?? ""),
      contactName: typeof d.contactName === "string" ? d.contactName : undefined,
      contactEmail: typeof d.contactEmail === "string" ? d.contactEmail : undefined,
      contactPhone: typeof d.contactPhone === "string" ? d.contactPhone : undefined,
      email: typeof d.email === "string" ? d.email : undefined,
      phone: typeof d.phone === "string" ? d.phone : undefined,
      pipelineId: String(d.pipelineId ?? ""),
      stage: normalizeOpportunityStageByPipeline(
        pipelineStagesById,
        String(d.pipelineId ?? ""),
        d.stage
      ),
      status:
        d.status === "זכיה" || d.status === "הפסד" || d.status === "פתוח"
          ? d.status
          : "פתוח",
      value: typeof d.value === "number" ? d.value : undefined,
      utmSource: typeof d.utmSource === "string" ? d.utmSource : undefined,
      utmCampaign: typeof d.utmCampaign === "string" ? d.utmCampaign : undefined,
      utmMedium: typeof d.utmMedium === "string" ? d.utmMedium : undefined,
      utmContent: typeof d.utmContent === "string" ? d.utmContent : undefined,
      landingpage: typeof d.landingpage === "string" ? d.landingpage : undefined,
      labelIds: readStringIdArray(d.labelIds),
      tags: Array.isArray(d.tags) ? (d.tags as string[]).map(String) : undefined,
      lastLeadAt: mapTs(d.lastLeadAt),
      customValues:
        typeof d.customValues === "object"
          ? (d.customValues as Record<string, unknown>)
          : undefined,
      assignedRep: typeof d.assignedRep === "string" ? d.assignedRep : undefined,
      notes: Array.isArray(d.notes)
        ? (d.notes as Array<{ id: string; text: string; createdAt: string; createdBy?: string }>)
        : undefined,
      tasks: Array.isArray(d.tasks)
        ? (d.tasks as Array<{
            id: string;
            title: string;
            dueAt: string;
            done: boolean;
            status?: "todo" | "in_progress" | "done";
            comments?: Array<{ id: string; text: string; createdAt: string }>;
            createdAt: string;
          }>)
        : undefined,
      createdAt: mapTs(d.createdAt),
      updatedAt: mapTs(d.updatedAt),
    } satisfies OpportunityRecord;
  });

  return out.sort((a, b) => {
    const at = a.createdAt?.getTime() ?? 0;
    const bt = b.createdAt?.getTime() ?? 0;
    return bt - at;
  });
}

export async function createOpportunity(input: CreateOpportunityInput): Promise<OpportunityRecord> {
  const db = await getAdminDb();
  const contactId = input.contactId.trim();
  if (!contactId) throw new Error("contactId is required");

  const importCreated = parseIsoFirestoreTimestamp(input.createdAt);
  const importUpdated = parseIsoFirestoreTimestamp(input.updatedAt);

  let pipelineId = input.pipelineId?.trim() ?? "";
  if (!pipelineId) {
    if (await shouldSeedDefaultPipeline()) {
      pipelineId = (await ensureDefaultPipeline()).id;
    }
  }
  if (!pipelineId.trim()) {
    throw new Error("Pipeline is required (create a pipeline in Settings / Pipeline first)");
  }
  const pipelineSnap = await db.collection("pipelines").doc(pipelineId).get();
  if (!pipelineSnap.exists) throw new Error("Pipeline not found");
  const pd = (pipelineSnap.data() ?? {}) as Record<string, unknown>;
  const stages = normalizeStages((pd.stages as string[] | undefined) ?? ["Pending"]);
  const requestedStage = input.stage?.trim();
  const stage =
    requestedStage && stages.includes(requestedStage)
      ? requestedStage
      : stages[0] || "Pending";

  const contactSnap = await db.collection("leads").doc(contactId).get();
  if (!contactSnap.exists) throw new Error("Contact not found");
  const cd = (contactSnap.data() ?? {}) as Record<string, unknown>;
  const resolvedLabelIds = await normalizeIncomingLabelIds({
    labelIds: input.labelIds,
    tags: input.tags,
  });

  const now = FieldValue.serverTimestamp();
  const existingSame = await db
    .collection("opportunities")
    .where("pipelineId", "==", pipelineId)
    .where("contactId", "==", contactId)
    .limit(1)
    .get();

  if (!existingSame.empty) {
    const existingRef = existingSame.docs[0].ref;
    const existingData = (existingSame.docs[0].data() ?? {}) as Record<string, unknown>;
    const existingOpportunityCode =
      typeof existingData.opportunityCode === "string" && existingData.opportunityCode.trim()
        ? existingData.opportunityCode.trim()
        : await allocateRunningCode("opportunities", "O-");
    await existingRef.set(
      {
        opportunityCode: existingOpportunityCode,
        name: input.name?.trim() || (typeof cd.name === "string" ? cd.name : "Opportunity"),
        stage,
        status: input.status ?? "פתוח",
        value: typeof input.value === "number" ? input.value : null,
        email: input.email?.trim() || (typeof cd.email === "string" ? cd.email : ""),
        phone: input.phone?.trim() || (typeof cd.phone === "string" ? cd.phone : ""),
        utmSource: input.utmSource?.trim() || "",
        utmCampaign: input.utmCampaign?.trim() || "",
        utmMedium: input.utmMedium?.trim() || "",
        utmContent: input.utmContent?.trim() || "",
        landingpage: input.landingpage?.trim() || "",
        labelIds: resolvedLabelIds,
        tags: FieldValue.delete(),
        customValues: input.customValues ?? {},
        assignedRep:
          input.assignedRep?.trim() ||
          (typeof cd.assignedRep === "string" ? cd.assignedRep : ""),
        ...(importCreated ? { createdAt: importCreated } : {}),
        lastLeadAt: importCreated ?? importUpdated ?? now,
        updatedAt: importUpdated ?? importCreated ?? now,
      },
      { merge: true }
    );
    const updated = await existingRef.get();
    const d = (updated.data() ?? {}) as Record<string, unknown>;
    return {
      id: updated.id,
      opportunityCode: typeof d.opportunityCode === "string" ? d.opportunityCode : undefined,
      name: String(d.name ?? ""),
      contactId: String(d.contactId ?? contactId),
      contactName: typeof d.contactName === "string" ? d.contactName : undefined,
      contactEmail: typeof d.contactEmail === "string" ? d.contactEmail : undefined,
      contactPhone: typeof d.contactPhone === "string" ? d.contactPhone : undefined,
      email: typeof d.email === "string" ? d.email : undefined,
      phone: typeof d.phone === "string" ? d.phone : undefined,
      pipelineId: String(d.pipelineId ?? pipelineId),
      stage: String(d.stage ?? stage),
      status:
        d.status === "זכיה" || d.status === "הפסד" || d.status === "פתוח"
          ? d.status
          : "פתוח",
      value: typeof d.value === "number" ? d.value : undefined,
      utmSource: typeof d.utmSource === "string" ? d.utmSource : undefined,
      utmCampaign: typeof d.utmCampaign === "string" ? d.utmCampaign : undefined,
      utmMedium: typeof d.utmMedium === "string" ? d.utmMedium : undefined,
      utmContent: typeof d.utmContent === "string" ? d.utmContent : undefined,
      landingpage: typeof d.landingpage === "string" ? d.landingpage : undefined,
      labelIds: readStringIdArray(d.labelIds),
      tags: Array.isArray(d.tags) ? (d.tags as string[]).map(String) : undefined,
      lastLeadAt: mapTs(d.lastLeadAt),
      customValues:
        typeof d.customValues === "object"
          ? (d.customValues as Record<string, unknown>)
          : undefined,
      assignedRep: typeof d.assignedRep === "string" ? d.assignedRep : undefined,
      notes: Array.isArray(d.notes)
        ? (d.notes as Array<{ id: string; text: string; createdAt: string }>)
        : undefined,
      tasks: Array.isArray(d.tasks)
        ? (d.tasks as Array<{
            id: string;
            title: string;
            dueAt: string;
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

  const opportunityCode = await allocateRunningCode("opportunities", "O-");
  const oppName = input.name?.trim() || (typeof cd.name === "string" ? cd.name : "Opportunity");
  const resolvedFullName = typeof cd.name === "string" ? cd.name : "";
  const resolvedEmail = input.email?.trim() || (typeof cd.email === "string" ? cd.email : "");
  const resolvedPhone = input.phone?.trim() || (typeof cd.phone === "string" ? cd.phone : "");
  const utmS = input.utmSource?.trim() || "";
  const utmCa = input.utmCampaign?.trim() || "";
  const utmMe = input.utmMedium?.trim() || "";
  const utmCo = input.utmContent?.trim() || "";
  const noteInstant = importCreated ? importCreated.toDate() : new Date();
  const createdAtLabel = formatIsraelDateTime(noteInstant);
  const initialNote = input.skipInitialAutoNote
    ? null
    : {
        id: randomUUID(),
        text: buildNewOpportunityLeadNoteText({
          opportunityName: oppName,
          fullName: resolvedFullName,
          phone: resolvedPhone,
          email: resolvedEmail,
          utmSource: utmS,
          utmCampaign: utmCa,
          utmMedium: utmMe,
          utmContent: utmCo,
          createdAtLabel,
        }),
        createdAt: noteInstant.toISOString(),
        createdBy: "המערכת",
      };

  const createdAtField = importCreated ?? now;
  const updatedAtField = importUpdated ?? importCreated ?? now;
  const lastLeadField = importCreated ?? now;

  const ref = await db.collection("opportunities").add({
    opportunityCode,
    name: oppName,
    contactId,
    contactName: typeof cd.name === "string" ? cd.name : "",
    contactEmail: typeof cd.email === "string" ? cd.email : "",
    contactPhone: typeof cd.phone === "string" ? cd.phone : "",
    email: resolvedEmail,
    phone: resolvedPhone,
    pipelineId,
    stage,
    status: input.status ?? "פתוח",
    value: typeof input.value === "number" ? input.value : null,
    utmSource: utmS,
    utmCampaign: utmCa,
    utmMedium: utmMe,
    utmContent: utmCo,
    landingpage: input.landingpage?.trim() || "",
    labelIds: resolvedLabelIds,
    lastLeadAt: lastLeadField,
    customValues: input.customValues ?? {},
    assignedRep:
      input.assignedRep?.trim() ||
      (typeof cd.assignedRep === "string" ? cd.assignedRep : ""),
    notes: initialNote ? [initialNote] : [],
    tasks: [],
    createdAt: createdAtField,
    updatedAt: updatedAtField,
  });

  await reconcileContactNotesAcrossEntities(contactId);

  fireServerWebhooks(db, "opportunity_created", {
    opportunity: {
      id: ref.id,
      opportunityCode,
      name: oppName,
      stage,
      pipelineId,
      contactId,
      value: typeof input.value === "number" ? input.value : null,
    },
  });

  void import("@/lib/push/sendTenantWebPush")
    .then(({ notifyTenantUsersWebPush }) =>
      notifyTenantUsersWebPush(db, {
        kind: "new_opportunity",
        title: "הזדמנות חדשה ב־CRM",
        body: `${oppName} · ${typeof cd.name === "string" ? cd.name : ""}`.trim().slice(0, 180),
        relativeUrl: `/pipeline?openOpportunityId=${encodeURIComponent(ref.id)}`,
        tag: `opp-${ref.id}-${Date.now()}`,
      })
    )
    .catch(() => {});

  const snap = await ref.get();
  const d = (snap.data() ?? {}) as Record<string, unknown>;
  return {
    id: snap.id,
    opportunityCode: typeof d.opportunityCode === "string" ? d.opportunityCode : undefined,
    name: String(d.name ?? ""),
    contactId: String(d.contactId ?? contactId),
    contactName: typeof d.contactName === "string" ? d.contactName : undefined,
    contactEmail: typeof d.contactEmail === "string" ? d.contactEmail : undefined,
    contactPhone: typeof d.contactPhone === "string" ? d.contactPhone : undefined,
    email: typeof d.email === "string" ? d.email : undefined,
    phone: typeof d.phone === "string" ? d.phone : undefined,
    pipelineId: String(d.pipelineId ?? pipelineId),
    stage: String(d.stage ?? stage),
    status:
      d.status === "זכיה" || d.status === "הפסד" || d.status === "פתוח"
        ? d.status
        : "פתוח",
    value: typeof d.value === "number" ? d.value : undefined,
    utmSource: typeof d.utmSource === "string" ? d.utmSource : undefined,
    utmCampaign: typeof d.utmCampaign === "string" ? d.utmCampaign : undefined,
    utmMedium: typeof d.utmMedium === "string" ? d.utmMedium : undefined,
    utmContent: typeof d.utmContent === "string" ? d.utmContent : undefined,
    landingpage: typeof d.landingpage === "string" ? d.landingpage : undefined,
    labelIds: readStringIdArray(d.labelIds),
    tags: Array.isArray(d.tags) ? (d.tags as string[]).map(String) : undefined,
    lastLeadAt: mapTs(d.lastLeadAt),
    customValues:
      typeof d.customValues === "object"
        ? (d.customValues as Record<string, unknown>)
        : undefined,
    assignedRep: typeof d.assignedRep === "string" ? d.assignedRep : undefined,
    notes: Array.isArray(d.notes)
      ? (d.notes as Array<{ id: string; text: string; createdAt: string; createdBy?: string }>)
      : undefined,
    tasks: Array.isArray(d.tasks)
      ? (d.tasks as Array<{
          id: string;
          title: string;
          dueAt: string;
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

export async function appendOpportunityNote(
  id: string,
  input: {
    text: string;
    createdBy?: string;
    id?: string;
    createdAt?: string;
  }
): Promise<OpportunityRecord> {
  const db = await getAdminDb();
  const ref = db.collection("opportunities").doc(id);
  const snap = await ref.get();
  if (!snap.exists) throw new Error("Opportunity not found");

  const rawText = typeof input.text === "string" ? input.text : "";
  if (!rawText.trim()) throw new Error("Note text is required");

  const existing = (snap.data() ?? {}) as Record<string, unknown>;
  const prev = Array.isArray(existing.notes)
    ? [
        ...(existing.notes as Array<{
          id: string;
          text: string;
          createdAt: string;
          createdBy?: string;
        }>),
      ]
    : [];

  const note = {
    id: input.id?.trim() || randomUUID(),
    text: rawText,
    createdAt: input.createdAt?.trim() || new Date().toISOString(),
    ...(input.createdBy?.trim() ? { createdBy: input.createdBy.trim() } : {}),
  };

  await ref.set(
    {
      notes: [...prev, note],
      updatedAt: FieldValue.serverTimestamp(),
    },
    { merge: true }
  );

  const contactId = String(existing.contactId ?? "").trim();
  if (contactId) await reconcileContactNotesAcrossEntities(contactId);

  return (await getOpportunityById(id)) as OpportunityRecord;
}

/**
 * מוצא הזדמנות בפייפליין לקוחות משלמים לפי טלפון (מותאם לוובהוק שאלון מוביל).
 * אם יש כמה — נבחר העדכנית ביותר לפי updatedAt.
 */
export async function findCustomersPipelineOpportunityByNormalizedPhone(
  phoneRaw: string
): Promise<string | null> {
  const target = normalizePhone(phoneRaw);
  if (!target) return null;
  const pipelineId = await getPayingCustomersPipelineId();
  const db = await getAdminDb();
  const snap = await db
    .collection("opportunities")
    .where("pipelineId", "==", pipelineId)
    .get();
  let bestId: string | null = null;
  let bestTime = -1;
  for (const doc of snap.docs) {
    const d = (doc.data() ?? {}) as Record<string, unknown>;
    const p1 = normalizePhone(typeof d.phone === "string" ? d.phone : undefined);
    const p2 = normalizePhone(typeof d.contactPhone === "string" ? d.contactPhone : undefined);
    if (p1 !== target && p2 !== target) continue;
    const u = d.updatedAt;
    let t = 0;
    if (u && typeof u === "object" && "toDate" in u) {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      t = ((u as any).toDate?.() as Date | undefined)?.getTime?.() ?? 0;
    }
    if (t >= bestTime) {
      bestTime = t;
      bestId = doc.id;
    }
  }
  return bestId;
}

export async function getOpportunityById(id: string): Promise<OpportunityRecord | null> {
  const db = await getAdminDb();
  const [snap, pipelinesSnap] = await Promise.all([
    db.collection("opportunities").doc(id).get(),
    db.collection("pipelines").get(),
  ]);
  if (!snap.exists) return null;
  const pipelineStagesById = opportunityStagesByPipelineId(pipelinesSnap.docs);
  const d = (snap.data() ?? {}) as Record<string, unknown>;
  return {
    id: snap.id,
    opportunityCode: typeof d.opportunityCode === "string" ? d.opportunityCode : undefined,
    name: String(d.name ?? ""),
    contactId: String(d.contactId ?? ""),
    contactName: typeof d.contactName === "string" ? d.contactName : undefined,
    contactEmail: typeof d.contactEmail === "string" ? d.contactEmail : undefined,
    contactPhone: typeof d.contactPhone === "string" ? d.contactPhone : undefined,
    email: typeof d.email === "string" ? d.email : undefined,
    phone: typeof d.phone === "string" ? d.phone : undefined,
    pipelineId: String(d.pipelineId ?? ""),
    stage: normalizeOpportunityStageByPipeline(
      pipelineStagesById,
      String(d.pipelineId ?? ""),
      d.stage
    ),
    status:
      d.status === "זכיה" || d.status === "הפסד" || d.status === "פתוח"
        ? d.status
        : "פתוח",
    value: typeof d.value === "number" ? d.value : undefined,
    utmSource: typeof d.utmSource === "string" ? d.utmSource : undefined,
    utmCampaign: typeof d.utmCampaign === "string" ? d.utmCampaign : undefined,
    utmMedium: typeof d.utmMedium === "string" ? d.utmMedium : undefined,
    utmContent: typeof d.utmContent === "string" ? d.utmContent : undefined,
    landingpage: typeof d.landingpage === "string" ? d.landingpage : undefined,
    labelIds: readStringIdArray(d.labelIds),
    tags: Array.isArray(d.tags) ? (d.tags as string[]).map(String) : undefined,
    lastLeadAt: mapTs(d.lastLeadAt),
    customValues:
      typeof d.customValues === "object"
        ? (d.customValues as Record<string, unknown>)
        : undefined,
    assignedRep: typeof d.assignedRep === "string" ? d.assignedRep : undefined,
    notes: Array.isArray(d.notes)
      ? (d.notes as Array<{ id: string; text: string; createdAt: string; createdBy?: string }>)
      : undefined,
    tasks: Array.isArray(d.tasks)
      ? (d.tasks as Array<{ id: string; title: string; dueAt: string; done: boolean; createdAt: string }>)
      : undefined,
    createdAt: mapTs(d.createdAt),
    updatedAt: mapTs(d.updatedAt),
  };
}

export async function updateOpportunity(
  id: string,
  input: {
    name?: string;
    contactId?: string;
    pipelineId?: string;
    stage?: string;
    status?: "פתוח" | "זכיה" | "הפסד";
    value?: number | null;
    /** ISO — ייבוא היסטורי */
    createdAt?: string;
    /** ISO — ייבוא היסטורי */
    updatedAt?: string;
    /** עדכון «ליד אחרון» (למשל אחרי שליחת התאמת הזמנה) */
    lastLeadAt?: Date | null;
    email?: string;
    phone?: string;
    utmSource?: string;
    utmCampaign?: string;
    utmMedium?: string;
    utmContent?: string;
    landingpage?: string;
    labelIds?: string[];
    tags?: string[];
    assignedRep?: string;
    customValues?: Record<string, unknown>;
    notes?: Array<{
      id: string;
      text: string;
      createdAt: string;
      createdBy?: string;
      category?: string;
      attachments?: Array<{ id: string; fileName: string; url: string }>;
    }>;
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
  }
): Promise<OpportunityRecord> {
  const db = await getAdminDb();
  const ref = db.collection("opportunities").doc(id);
  const snap = await ref.get();
  if (!snap.exists) throw new Error("Opportunity not found");
  const existing = (snap.data() ?? {}) as Record<string, unknown>;
  const parsedUpd = parseIsoFirestoreTimestamp(input.updatedAt);
  const parsedCre = parseIsoFirestoreTimestamp(input.createdAt);
  const payload: Record<string, unknown> = {
    updatedAt: parsedUpd ?? FieldValue.serverTimestamp(),
  };
  if (parsedCre) payload.createdAt = parsedCre;
  if (input.name !== undefined) payload.name = input.name.trim();
  if (input.contactId !== undefined) {
    const nextContactId = input.contactId.trim();
    if (!nextContactId) throw new Error("contactId cannot be empty");
    const contactSnap = await db.collection("leads").doc(nextContactId).get();
    if (!contactSnap.exists) throw new Error("Contact not found");
    const cd = (contactSnap.data() ?? {}) as Record<string, unknown>;
    payload.contactId = nextContactId;
    payload.contactName = typeof cd.name === "string" ? cd.name : "";
    payload.contactEmail = typeof cd.email === "string" ? cd.email : "";
    payload.contactPhone = typeof cd.phone === "string" ? cd.phone : "";
  }
  const targetPipelineId =
    input.pipelineId !== undefined
      ? input.pipelineId.trim()
      : String(existing.pipelineId ?? "").trim();
  if (!targetPipelineId) throw new Error("pipelineId is required");
  const pipelineSnap = await db.collection("pipelines").doc(targetPipelineId).get();
  if (!pipelineSnap.exists) throw new Error("Pipeline not found");
  const pipelineData = (pipelineSnap.data() ?? {}) as Record<string, unknown>;
  const stages = normalizeStages((pipelineData.stages as string[] | undefined) ?? []);
  if (stages.length === 0) throw new Error("Pipeline must contain stages");
  if (input.pipelineId !== undefined) payload.pipelineId = targetPipelineId;
  if (input.stage !== undefined) {
    const nextStage = input.stage.trim();
    payload.stage = stages.includes(nextStage) ? nextStage : stages[0];
  } else if (input.pipelineId !== undefined) {
    const currentStage = String(existing.stage ?? "").trim();
    payload.stage = stages.includes(currentStage) ? currentStage : stages[0];
  }
  if (input.status !== undefined) payload.status = input.status;
  /** גרירה לשלב «זכיה» בלי לשלוח status — מיישרים את סטטוס ההזדמנות (עמודת הסטטוס בלוח הייתה נשארת «פתוח»). */
  if (input.status === undefined && input.stage !== undefined) {
    const stAfterStage = String(
      payload.stage !== undefined ? payload.stage : existing.stage ?? ""
    ).trim();
    const existingStatusTri =
      existing.status === "זכיה" || existing.status === "הפסד" || existing.status === "פתוח"
        ? existing.status
        : "פתוח";
    if (
      normalizeStageLabel(stAfterStage) === WON_PIPELINE_STAGE_LABEL &&
      existingStatusTri !== "הפסד"
    ) {
      payload.status = "זכיה";
    }
  }
  if (input.value !== undefined) payload.value = input.value;
  if (input.email !== undefined) payload.email = input.email.trim();
  if (input.phone !== undefined) payload.phone = input.phone.trim();
  if (input.utmSource !== undefined) payload.utmSource = input.utmSource.trim();
  if (input.utmCampaign !== undefined) payload.utmCampaign = input.utmCampaign.trim();
  if (input.utmMedium !== undefined) payload.utmMedium = input.utmMedium.trim();
  if (input.utmContent !== undefined) payload.utmContent = input.utmContent.trim();
  if (input.landingpage !== undefined) payload.landingpage = input.landingpage.trim();
  if (input.labelIds !== undefined) {
    payload.labelIds = Array.from(new Set(input.labelIds.map((x) => String(x).trim()).filter(Boolean)));
    payload.tags = FieldValue.delete();
  } else if (input.tags !== undefined) {
    payload.labelIds = await normalizeIncomingLabelIds({ tags: input.tags });
    payload.tags = FieldValue.delete();
  }
  if (input.assignedRep !== undefined) payload.assignedRep = input.assignedRep.trim();
  if (input.lastLeadAt !== undefined) {
    payload.lastLeadAt = input.lastLeadAt === null ? FieldValue.delete() : input.lastLeadAt;
  }
  if (input.customValues !== undefined) payload.customValues = input.customValues;
  if (input.notes !== undefined) payload.notes = input.notes;
  if (input.tasks !== undefined) {
    const prevTasks = Array.isArray(existing.tasks) ? [...(existing.tasks as RawTaskIn[])] : [];
    const merged = mergeTaskArrays(prevTasks, input.tasks as RawTaskIn[]);
    const oppLabel = (typeof existing.name === "string" && existing.name) || id;
    const reconciled = await Promise.all(
      merged.map((t) =>
        reconcileTasksGoogleCalendar(prevTasks, [t], {
          entityType: "opportunity",
          entityId: id,
          entityLabel: String(oppLabel),
        }).then((r) => r[0] ?? t)
      )
    );
    payload.tasks = reconciled;
  }

  const nextStageStr = String(
    payload.stage !== undefined ? payload.stage : existing.stage ?? ""
  ).trim();
  const nextStatusVal =
    payload.status !== undefined
      ? payload.status
      : existing.status === "זכיה" || existing.status === "הפסד" || existing.status === "פתוח"
        ? existing.status
        : "פתוח";
  const prevStageStr = String(existing.stage ?? "").trim();
  const prevStatusVal =
    existing.status === "זכיה" || existing.status === "הפסד" || existing.status === "פתוח"
      ? existing.status
      : "פתוח";

  const becameWon =
    (normalizeStageLabel(nextStageStr) === WON_PIPELINE_STAGE_LABEL ||
      nextStatusVal === "זכיה") &&
    normalizeStageLabel(prevStageStr) !== WON_PIPELINE_STAGE_LABEL &&
    prevStatusVal !== "זכיה";

  let winNoteForContact: { id: string; text: string; createdAt: string; createdBy?: string } | null =
    null;
  let firstCustomerStageForNewOpp: string | null = null;
  let targetCustomersPipelineIdForNewOpp: string | null = null;

  if ((await shouldSeedDefaultPipeline()) && becameWon && existing.winAutomationDone !== true) {
    const payingCustomersPipelineId = await getPayingCustomersPipelineId();
    if (targetPipelineId !== payingCustomersPipelineId) {
      const dupSnap = await db
        .collection("opportunities")
        .where("sourceOpportunityId", "==", id)
        .get();
      const hasDupInTargetPipeline = dupSnap.docs.some((doc) => {
        const d = (doc.data() ?? {}) as Record<string, unknown>;
        return String(d.pipelineId ?? "").trim() === payingCustomersPipelineId;
      });
      if (!hasDupInTargetPipeline) {
        if (payingCustomersPipelineId === CUSTOMERS_PIPELINE_ID) {
          await ensureCustomersPipeline();
        }
        const cpSnap = await db.collection("pipelines").doc(payingCustomersPipelineId).get();
        const cpd = (cpSnap.data() ?? {}) as Record<string, unknown>;
        const custStages = normalizeStages((cpd.stages as string[] | undefined) ?? ["חדש"]);
        firstCustomerStageForNewOpp = custStages[0] || "חדש";
        targetCustomersPipelineIdForNewOpp = payingCustomersPipelineId;

        const winNote = {
          id: randomUUID(),
          text: "לקוח חדש",
          createdAt: new Date().toISOString(),
          createdBy: "המערכת",
        };
        winNoteForContact = winNote;

        const baseNotes =
          input.notes !== undefined
            ? [...input.notes]
            : Array.isArray(existing.notes)
              ? [
                  ...(existing.notes as Array<{
                    id: string;
                    text: string;
                    createdAt: string;
                    createdBy?: string;
                  }>),
                ]
              : [];
        payload.notes = [...baseNotes, winNote];
        payload.winAutomationDone = true;
      } else {
        payload.winAutomationDone = true;
      }
    }
  }

  await ref.set(payload, { merge: true });

  if (input.pipelineId !== undefined) {
    const prevPipelineId = String(existing.pipelineId ?? "").trim();
    if (prevPipelineId && prevPipelineId !== targetPipelineId) {
      fireServerWebhooks(db, "opportunity_pipeline_changed", {
        opportunity: {
          id,
          pipelineId: targetPipelineId,
          previousPipelineId: prevPipelineId,
          stage: nextStageStr,
        },
      });
    }
  }
  if (prevStageStr !== nextStageStr) {
    fireServerWebhooks(db, "opportunity_stage_changed", {
      opportunity: {
        id,
        stage: nextStageStr,
        previousStage: prevStageStr,
        pipelineId: targetPipelineId,
      },
    });
  }

  if (winNoteForContact && firstCustomerStageForNewOpp && targetCustomersPipelineIdForNewOpp) {
    const afterSnap = await ref.get();
    const after = (afterSnap.data() ?? {}) as Record<string, unknown>;
    const cid = String(after.contactId ?? "").trim();
    if (cid) {
      const opportunityCode = await allocateRunningCode("opportunities", "O-");
      const exName = String(after.name ?? "").trim();
      const now = FieldValue.serverTimestamp();
      await db.collection("opportunities").add({
        opportunityCode,
        name: exName || "לקוח חדש",
        contactId: cid,
        contactName: typeof after.contactName === "string" ? after.contactName : "",
        contactEmail: typeof after.contactEmail === "string" ? after.contactEmail : "",
        contactPhone: typeof after.contactPhone === "string" ? after.contactPhone : "",
        email: typeof after.email === "string" ? after.email : "",
        phone: typeof after.phone === "string" ? after.phone : "",
        pipelineId: targetCustomersPipelineIdForNewOpp,
        stage: firstCustomerStageForNewOpp,
        status: "פתוח",
        value: null,
        utmSource: typeof after.utmSource === "string" ? after.utmSource : "",
        utmCampaign: typeof after.utmCampaign === "string" ? after.utmCampaign : "",
        utmMedium: typeof after.utmMedium === "string" ? after.utmMedium : "",
        utmContent: typeof after.utmContent === "string" ? after.utmContent : "",
        landingpage: typeof after.landingpage === "string" ? after.landingpage : "",
        labelIds: readStringIdArray(after.labelIds),
        customValues:
          typeof after.customValues === "object" && after.customValues !== null
            ? after.customValues
            : {},
        assignedRep: typeof after.assignedRep === "string" ? after.assignedRep : "",
        sourceOpportunityId: id,
        notes: [],
        tasks: [],
        lastLeadAt: now,
        createdAt: now,
        updatedAt: now,
      });
    }
  }

  // Keep contact-level activity history synced with opportunity activity.
  if (input.notes !== undefined || input.tasks !== undefined) {
    const existing = (snap.data() ?? {}) as Record<string, unknown>;
    const contactId = String(
      input.contactId?.trim() || existing.contactId || ""
    ).trim();
    if (contactId) {
      const contactRef = db.collection("leads").doc(contactId);
      const contactSnap = await contactRef.get();
      if (contactSnap.exists) {
        const cd = (contactSnap.data() ?? {}) as Record<string, unknown>;
        const contactNotes = Array.isArray(cd.notes)
          ? (cd.notes as Array<{ id: string; text: string; createdAt: string; createdBy?: string }>)
          : [];
        const contactTasks = Array.isArray(cd.tasks)
          ? (cd.tasks as Array<{
              id: string;
              title: string;
              dueAt: string;
              done: boolean;
              status?: "todo" | "in_progress" | "done";
              comments?: Array<{ id: string; text: string; createdAt: string }>;
              createdAt: string;
            }>)
          : [];
        const nextNotes = input.notes ?? [];
        const nextTasks = input.tasks ?? [];

        const notesMap = new Map(contactNotes.map((n) => [n.id, n]));
        for (const n of nextNotes) notesMap.set(n.id, n);
        const tasksMap = new Map(contactTasks.map((t) => [t.id, t]));
        for (const t of nextTasks) tasksMap.set(t.id, t);

        await contactRef.set(
          {
            notes: Array.from(notesMap.values()),
            tasks: Array.from(tasksMap.values()),
            updatedAt: FieldValue.serverTimestamp(),
          },
          { merge: true }
        );
      }
    }
  }

  const notesPayloadTouched = Object.prototype.hasOwnProperty.call(payload, "notes");
  const again = await ref.get();
  const againData = (again.data() ?? {}) as Record<string, unknown>;
  const finalContactId = String(againData.contactId ?? "").trim();
  if (
    finalContactId &&
    (input.notes !== undefined || winNoteForContact != null || notesPayloadTouched)
  ) {
    await reconcileContactNotesAcrossEntities(finalContactId);
  }

  const refreshed = await ref.get();
  return (await getOpportunityById(refreshed.id)) as OpportunityRecord;
}

export async function updatePipeline(
  id: string,
  input: { name?: string; stages?: string[] }
): Promise<PipelineRecord> {
  const db = await getAdminDb();
  const ref = db.collection("pipelines").doc(id);
  const snap = await ref.get();
  if (!snap.exists) throw new Error("Pipeline not found");
  const prev = (snap.data() ?? {}) as Record<string, unknown>;
  const prevScope = readPipelineScope(prev);
  const prevStages = normalizeStages((prev.stages as string[] | undefined) ?? []);
  const nextStages = input.stages ? normalizeStages(input.stages) : undefined;
  const payload: Record<string, unknown> = { updatedAt: FieldValue.serverTimestamp() };
  if (input.name !== undefined) payload.name = input.name.trim();
  if (nextStages !== undefined) {
    if (nextStages.length === 0) throw new Error("At least one stage is required");
    payload.stages = nextStages;
  }
  await ref.set(payload, { merge: true });

  // If stages were removed, move entities from removed stage
  // to the nearest previous remaining stage (fallback to first stage).
  if (nextStages) {
    const nextSet = new Set(nextStages);
    const removed = prevStages.filter((s) => !nextSet.has(s));
    if (removed.length) {
      const coll =
        prevScope === "moving_order"
          ? await db.collection("movingOrders").where("pipelineId", "==", id).get()
          : await db.collection("opportunities").where("pipelineId", "==", id).get();
      for (const removedStage of removed) {
        const removedIdx = prevStages.indexOf(removedStage);
        let fallback = nextStages[0];
        for (let i = removedIdx - 1; i >= 0; i--) {
          const candidate = prevStages[i];
          if (nextSet.has(candidate)) {
            fallback = candidate;
            break;
          }
        }
        const batch = db.batch();
        let touched = 0;
        for (const doc of coll.docs) {
          const d = (doc.data() ?? {}) as Record<string, unknown>;
          if (String(d.stage ?? "") === removedStage) {
            const extra: Record<string, unknown> = {
              stage: fallback,
              updatedAt: FieldValue.serverTimestamp(),
            };
            if (prevScope === "moving_order") {
              extra.status = statusFromStage(fallback);
            }
            batch.set(doc.ref, extra, { merge: true });
            touched++;
          }
        }
        if (touched > 0) await batch.commit();
      }
    }
  }

  const again = await ref.get();
  const d = (again.data() ?? {}) as Record<string, unknown>;
  invalidateTenantCachePrefix(`pl:${await getRequestTenantDatabaseId()}:`);
  return {
    id: again.id,
    name: String(d.name ?? ""),
    stages: normalizeStages((d.stages as string[] | undefined) ?? []),
    scope: readPipelineScope(d),
    createdAt: mapTs(d.createdAt),
    updatedAt: mapTs(d.updatedAt),
  };
}

export async function duplicatePipeline(id: string): Promise<PipelineRecord> {
  const db = await getAdminDb();
  const src = await db.collection("pipelines").doc(id).get();
  if (!src.exists) throw new Error("Pipeline not found");
  const d = (src.data() ?? {}) as Record<string, unknown>;
  const name = String(d.name ?? "").trim();
  const stages = normalizeStages((d.stages as string[] | undefined) ?? []);
  if (!name || stages.length === 0) throw new Error("Pipeline has invalid data");
  return createPipeline({
    name: `${name} (copy)`,
    stages,
    scope: readPipelineScope(d),
  });
}

export async function deleteOpportunity(id: string): Promise<void> {
  const raw = id.trim();
  if (!raw) throw new Error("Opportunity id is required");
  const db = await getAdminDb();
  const ref = db.collection("opportunities").doc(raw);
  const snap = await ref.get();
  if (!snap.exists) throw new Error("Opportunity not found");
  await ref.delete();
}

export async function resetAllOpportunities(params?: {
  execute?: boolean;
}): Promise<{ total: number; deleted: number; mode: "dry-run" | "execute" }> {
  const execute = params?.execute === true;
  const db = await getAdminDb();
  const snap = await db.collection("opportunities").get();
  const total = snap.size;
  if (!execute) {
    return { total, deleted: 0, mode: "dry-run" };
  }

  let deleted = 0;
  let batch = db.batch();
  let inBatch = 0;
  for (const doc of snap.docs) {
    batch.delete(doc.ref);
    inBatch += 1;
    if (inBatch >= 450) {
      await batch.commit();
      deleted += inBatch;
      batch = db.batch();
      inBatch = 0;
    }
  }
  if (inBatch > 0) {
    await batch.commit();
    deleted += inBatch;
  }
  return { total, deleted, mode: "execute" };
}

export async function deletePipeline(id: string): Promise<void> {
  if (id === "default-sales" && (await shouldSeedDefaultPipeline())) {
    throw new Error("Default pipeline cannot be deleted");
  }
  if (id === MOVING_ORDERS_INTAKE_PIPELINE_ID) {
    throw new Error("Default moving orders pipeline cannot be deleted");
  }
  const db = await getAdminDb();
  const pref = await db.collection("pipelines").doc(id).get();
  const scope = pref.exists ? readPipelineScope((pref.data() ?? {}) as Record<string, unknown>) : "opportunity";
  if (scope === "moving_order") {
    const snap = await db.collection("movingOrders").where("pipelineId", "==", id).limit(1).get();
    if (!snap.empty) {
      throw new Error("Cannot delete pipeline with existing orders");
    }
  } else {
    const snap = await db.collection("opportunities").where("pipelineId", "==", id).limit(1).get();
    if (!snap.empty) {
      throw new Error("Cannot delete pipeline with existing opportunities");
    }
  }
  await db.collection("pipelines").doc(id).delete();
  invalidateTenantCachePrefix(`pl:${await getRequestTenantDatabaseId()}:`);
}

