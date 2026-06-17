import { randomUUID } from "crypto";
import {
  FieldValue,
  Timestamp,
  type DocumentData,
  type DocumentReference,
  type Firestore,
} from "firebase-admin/firestore";
import { getAdminDb } from "@/lib/firebase/admin";
import { allocateRunningCode } from "@/lib/counters/repo";
import {
  propagateExactNotesToAllOpportunities,
  reconcileContactNotesAcrossEntities,
} from "@/lib/notes/contactNotesSync";
import { mergeTaskArrays, type RawTaskIn } from "@/lib/tasks/merge";
import { reconcileTasksGoogleCalendar } from "@/lib/googleCalendar/taskSync";
import { fireServerWebhooks } from "@/lib/webhooks/dispatchServerWebhooks";
import { listLabelsFromDb, normalizeIncomingLabelIds } from "@/lib/labels/repo";
import { parseYmdBoundary } from "@/lib/datetime/ymdBoundary";
import { isoCreatedAtInJerusalemCalendarDay } from "@/lib/datetime/taskTimestamps";

export type LeadRecord = {
  id: string; // doc id = normalized unique key
  contactCode?: string;
  email?: string;
  phone?: string;
  name?: string;
  stage: string;
  status?: "פתוח" | "זכיה" | "הפסד";
  pipelineId?: string;
  source?: string;
  utm?: Record<string, string>;
  customFields?: Record<string, unknown>;
  assignedRep?: string;
  labelIds?: string[];
  /** @deprecated */
  tags?: string[];
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
    done: boolean;
    status?: "todo" | "in_progress" | "done";
    comments?: Array<{ id: string; text: string; createdAt: string }>;
    createdAt: string;
  }>;
  createdAt: Date | null;
  updatedAt: Date | null;
};

export function isLeadWhatsAppMarketingApproved(lead: Pick<LeadRecord, "customFields">): boolean {
  const raw = lead.customFields?.whatsappMarketingApproved;
  return raw !== false;
}

const HASER_LABEL_NAME = "הסר";
const HASER_LABEL_COLOR = "#b91c1c";

export type LeadUpsertInput = {
  id?: string;
  uniqueKey?: string;
  email?: string;
  phone?: string;
  name?: string;
  firstName?: string;
  lastName?: string;
  stage?: string;
  status?: "פתוח" | "זכיה" | "הפסד";
  pipelineId?: string;
  source?: string;
  utm?: Record<string, string>;
  customFields?: Record<string, unknown>;
  assignedRep?: string;
  /**
   * Optional: when importing historical data from integrations.
   * Accepts ISO date/time.
   */
  createdAt?: string;
  /** ISO date/time; on update overrides server clock when backfilling imports */
  updatedAt?: string;
};

/** מזהה מסמך leads — מנורמל (אימייל lower-case, טלפון כפי שמוחזר מ-normalizePhone). */
export function normalizeUniqueKey(raw: string): string {
  return raw.trim().toLowerCase();
}

export function normalizePhone(raw?: string): string | undefined {
  if (!raw?.trim()) return undefined;
  const digits = raw.replace(/[^\d+]/g, "").replace(/^\+/, "");
  if (!digits) return undefined;

  // כבר בפורמט בינלאומי ישראלי (ללא +).
  if (digits.startsWith("972")) {
    // טעות נפוצה: 972052... במקום 97252...
    if (digits.startsWith("9720") && digits.length > 4 && digits[4] === "5") {
      return `972${digits.slice(4)}`;
    }
    return digits;
  }

  // מקומי עם 0: 052..., 03..., 072...
  if (digits.startsWith("0")) return `972${digits.slice(1)}`;

  // נייד ישראלי בלי קידומת מדינה ובלי 0 מוביל (למשל 526660006 → 972526660006).
  if (digits.length === 9 && /^5[0-9]\d{7}$/.test(digits)) {
    return `972${digits}`;
  }

  // ברירת מחדל: ספרות בלבד (מספרים בינלאומיים אחרים וכו׳).
  return digits.replace(/[^\d]/g, "");
}

function pickUniqueKey(input: LeadUpsertInput): { docId: string; email?: string; phone?: string } | null {
  if (input.uniqueKey && input.uniqueKey.trim()) {
    const docId = normalizeUniqueKey(input.uniqueKey);
    return { docId, email: input.email, phone: normalizePhone(input.phone) };
  }

  // Phone before email: stable id for automations / integrations that key on mobile.
  if (input.phone && input.phone.trim()) {
    const phone = normalizePhone(input.phone);
    if (phone) {
      const email = input.email?.trim() ? input.email.trim().toLowerCase() : undefined;
      return { docId: normalizeUniqueKey(phone), phone, ...(email ? { email } : {}) };
    }
  }

  if (input.email && input.email.trim()) {
    const email = input.email.trim().toLowerCase();
    return { docId: normalizeUniqueKey(email), email };
  }

  return null;
}

function toName(input: LeadUpsertInput): string | undefined {
  if (input.name && input.name.trim()) return input.name.trim();
  const fn = input.firstName?.trim();
  const ln = input.lastName?.trim();
  if (fn || ln) return [fn, ln].filter(Boolean).join(" ");
  return undefined;
}

function readStringIdArray(raw: unknown): string[] {
  if (!Array.isArray(raw)) return [];
  return Array.from(new Set(raw.map((x) => String(x).trim()).filter(Boolean)));
}

function maybeParseDate(input?: string): Date | null {
  if (!input?.trim()) return null;
  const d = new Date(input);
  if (Number.isNaN(d.getTime())) return null;
  return d;
}

function mapDocToLead(docId: string, data: Record<string, unknown>): LeadRecord {
  const createdAtTs = data.createdAt;
  const updatedAtTs = data.updatedAt;

  const createdAt =
    createdAtTs && typeof createdAtTs === "object" && "toDate" in createdAtTs
      ? // eslint-disable-next-line @typescript-eslint/no-explicit-any
        (createdAtTs as any).toDate?.() ?? null
      : null;

  const updatedAt =
    updatedAtTs && typeof updatedAtTs === "object" && "toDate" in updatedAtTs
      ? // eslint-disable-next-line @typescript-eslint/no-explicit-any
        (updatedAtTs as any).toDate?.() ?? null
      : null;

  return {
    id: docId,
    contactCode: typeof data.contactCode === "string" ? data.contactCode : undefined,
    email: typeof data.email === "string" ? data.email : undefined,
    phone: typeof data.phone === "string" ? data.phone : undefined,
    name: typeof data.name === "string" ? data.name : undefined,
    stage: typeof data.stage === "string" && data.stage.trim() ? data.stage : "Pending",
    status:
      data.status === "זכיה" || data.status === "הפסד" || data.status === "פתוח"
        ? data.status
        : "פתוח",
    pipelineId: typeof data.pipelineId === "string" ? data.pipelineId : undefined,
    source: typeof data.source === "string" ? data.source : undefined,
    utm: typeof data.utm === "object" ? (data.utm as Record<string, string>) : undefined,
    customFields:
      typeof data.customFields === "object" ? (data.customFields as Record<string, unknown>) : undefined,
    assignedRep: typeof data.assignedRep === "string" ? data.assignedRep : undefined,
    labelIds: readStringIdArray(data.labelIds),
    tags: Array.isArray(data.tags) ? (data.tags as string[]).map(String) : undefined,
    notes: Array.isArray(data.notes)
      ? (data.notes as Array<{ id: string; text: string; createdAt: string }>)
      : undefined,
    tasks: Array.isArray(data.tasks)
      ? (data.tasks as Array<{
          id: string;
          title: string;
          dueAt: string;
          done: boolean;
          status?: "todo" | "in_progress" | "done";
          comments?: Array<{ id: string; text: string; createdAt: string }>;
          createdAt: string;
        }>)
      : undefined,
    createdAt,
    updatedAt,
  };
}

export async function upsertLead(input: LeadUpsertInput): Promise<LeadRecord> {
  const db = await getAdminDb();
  const picked =
    input.id?.trim()
      ? { docId: normalizeUniqueKey(input.id), email: input.email, phone: input.phone }
      : pickUniqueKey(input);
  if (!picked) throw new Error("Missing uniqueKey (email or phone)");

  const stage = (input.stage?.trim() || "Pending").replace(/\s+/g, " ");
  const pipelineId = input.pipelineId?.trim() || undefined;
  const name = toName(input);

  const docRef = db.collection("leads").doc(picked.docId);

  const createdAtDate = maybeParseDate(input.createdAt);
  const updatedAtDate = maybeParseDate(input.updatedAt);

  const snap = await docRef.get();
  const nowUpdate = FieldValue.serverTimestamp();

  if (!snap.exists) {
    const contactCode = await allocateRunningCode("contacts", "C-");
    const payload: Record<string, unknown> = {
      stage,
      contactCode,
      createdAt: createdAtDate ? createdAtDate : nowUpdate,
      updatedAt: updatedAtDate ?? (createdAtDate ? createdAtDate : nowUpdate),
    };
    payload.status = input.status ?? "פתוח";
    if (picked.email) payload.email = picked.email;
    if (picked.phone) payload.phone = picked.phone;
    if (name) payload.name = name;
    if (pipelineId) payload.pipelineId = pipelineId;
    const source = input.source?.trim();
    if (source) payload.source = source;
    if (input.utm) payload.utm = input.utm;
    if (input.customFields) payload.customFields = input.customFields;
    if (input.assignedRep?.trim()) payload.assignedRep = input.assignedRep.trim();
    await docRef.set(payload);
    fireServerWebhooks(db, "lead_created", {
      lead: {
        id: picked.docId,
        stage,
        name: name ?? null,
        email: picked.email ?? null,
        phone: picked.phone ?? null,
        pipelineId: pipelineId ?? null,
        source: source ?? null,
      },
    });
    void import("@/lib/push/sendTenantWebPush")
      .then(({ notifyTenantUsersWebPush }) =>
        notifyTenantUsersWebPush(db, {
          kind: "new_lead",
          title: "ליד חדש ב־CRM",
          body: `${name || "ללא שם"} · ${picked.phone ?? picked.email ?? ""}`.trim().slice(0, 180),
          relativeUrl: `/contacts?openContactId=${encodeURIComponent(picked.docId)}`,
          tag: `lead-${picked.docId}-${Date.now()}`,
        })
      )
      .catch(() => {});
  } else {
    const prev = (snap.data() ?? {}) as Record<string, unknown>;
    const payload: Record<string, unknown> = {
      stage,
      updatedAt: updatedAtDate ?? nowUpdate,
    };
    if (createdAtDate) payload.createdAt = createdAtDate;
    if (typeof prev.contactCode !== "string" || !String(prev.contactCode).trim()) {
      payload.contactCode = await allocateRunningCode("contacts", "C-");
    }
    payload.status = input.status ?? ((prev.status as string | undefined) ?? "פתוח");
    if (picked.email ?? prev.email) payload.email = picked.email ?? prev.email;
    if (picked.phone ?? prev.phone) payload.phone = picked.phone ?? prev.phone;
    if (name ?? prev.name) payload.name = name ?? prev.name;
    if (pipelineId) payload.pipelineId = pipelineId;
    const source = input.source?.trim() || (prev.source as string | undefined);
    if (source) payload.source = source;
    if (input.utm ?? prev.utm) payload.utm = input.utm ?? prev.utm;
    if (input.customFields ?? prev.customFields) payload.customFields = input.customFields ?? prev.customFields;
    const assignedRep = input.assignedRep?.trim() || (prev.assignedRep as string | undefined);
    if (assignedRep) payload.assignedRep = assignedRep;
    const prevStage = String(prev.stage ?? "Pending").trim() || "Pending";
    await docRef.set(payload, { merge: true });
    if (prevStage !== stage) {
      fireServerWebhooks(db, "lead_stage_changed", {
        lead: {
          id: picked.docId,
          stage,
          previousStage: prevStage,
          name: (name ?? (typeof prev.name === "string" ? prev.name : undefined)) as string | undefined,
        },
      });
    }
  }

  const again = await docRef.get();
  const data = (again.data() ?? {}) as Record<string, unknown>;
  return mapDocToLead(again.id, data);
}

function dateToYmd(d: Date): string {
  // Return UTC ymd for stable lexicographic compare.
  return d.toISOString().slice(0, 10);
}

export async function listLeadsFiltered(dateFrom?: string | null, dateTo?: string | null): Promise<LeadRecord[]> {
  const db = await getAdminDb();
  const from = dateFrom?.trim();
  const to = dateTo?.trim();

  if (from || to) {
    const fromD = from ? parseYmdBoundary(from, "from") : new Date(0);
    const toD = to ? parseYmdBoundary(to, "to") : new Date(8640000000000000);
    const snap = await db
      .collection("leads")
      .where("createdAt", ">=", Timestamp.fromDate(fromD))
      .where("createdAt", "<=", Timestamp.fromDate(toD))
      .get();
    return snap.docs.map((d) => mapDocToLead(d.id, d.data() as Record<string, unknown>));
  }

  const snap = await db.collection("leads").get();
  const leads = snap.docs.map((d) => mapDocToLead(d.id, d.data() as Record<string, unknown>));
  return leads;
}

/** ספירת לידים (אנשי קשר) שנוצרו ביום לוח ישראלי — סריקה עד maxFetch אחרונים לפי createdAt */
export async function countLeadsCreatedInIsraelDay(
  ymd: string,
  opts: { maxFetch?: number; db?: FirebaseFirestore.Firestore } = {}
): Promise<number> {
  const db = opts.db ?? (await getAdminDb());
  const maxFetch = Math.min(8000, Math.max(1, opts.maxFetch ?? 4000));
  const snap = await db.collection("leads").orderBy("createdAt", "desc").limit(maxFetch).get();
  let n = 0;
  for (const doc of snap.docs) {
    const lead = mapDocToLead(doc.id, doc.data() as Record<string, unknown>);
    if (!lead.createdAt) continue;
    if (isoCreatedAtInJerusalemCalendarDay(lead.createdAt.toISOString(), ymd)) n += 1;
  }
  return n;
}

/**
 * מוזג labelIds מהזדמנויות לתוך רשומות אנשי הקשר.
 * תגית שמוגדרת על הזדמנות של איש קשר תיחשב גם כתגית של איש הקשר עצמו.
 */
export async function enrichLeadsWithOpportunityLabels(leads: LeadRecord[]): Promise<LeadRecord[]> {
  if (!leads.length) return leads;
  const db = await getAdminDb();
  const snap = await db.collection("opportunities").get();
  const oppLabelMap = new Map<string, Set<string>>();
  for (const doc of snap.docs) {
    const d = (doc.data() ?? {}) as Record<string, unknown>;
    const contactId = String(d.contactId ?? "").trim();
    if (!contactId) continue;
    const labelIds = Array.isArray(d.labelIds)
      ? (d.labelIds as unknown[]).map((x) => String(x).trim()).filter(Boolean)
      : [];
    if (!labelIds.length) continue;
    const set = oppLabelMap.get(contactId) ?? new Set<string>();
    for (const lid of labelIds) set.add(lid);
    oppLabelMap.set(contactId, set);
  }
  return leads.map((lead) => {
    const oppLabels = oppLabelMap.get(lead.id);
    if (!oppLabels?.size) return lead;
    const merged = Array.from(new Set([...(lead.labelIds ?? []), ...oppLabels]));
    return { ...lead, labelIds: merged };
  });
}

export async function getLeadById(id: string): Promise<LeadRecord | null> {
  const docId = normalizeUniqueKey(id);
  const db = await getAdminDb();
  const snap = await db.collection("leads").doc(docId).get();
  if (!snap.exists) return null;
  return mapDocToLead(snap.id, (snap.data() ?? {}) as Record<string, unknown>);
}

export async function appendLeadNote(
  id: string,
  input: {
    text: string;
    createdBy?: string;
    id?: string;
    createdAt?: string;
    category?: string;
  }
): Promise<LeadRecord> {
  const docId = normalizeUniqueKey(id);
  const db = await getAdminDb();
  const ref = db.collection("leads").doc(docId);
  const snap = await ref.get();
  if (!snap.exists) throw new Error("Contact not found");

  const rawText = typeof input.text === "string" ? input.text : "";
  if (!rawText.trim()) throw new Error("Note text is required");

  const data = (snap.data() ?? {}) as Record<string, unknown>;
  const prev = Array.isArray(data.notes)
    ? [
        ...(data.notes as Array<{
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
    ...(input.category?.trim() ? { category: input.category.trim() } : {}),
  };

  await ref.set(
    {
      notes: [...prev, note],
      updatedAt: FieldValue.serverTimestamp(),
    },
    { merge: true }
  );

  await reconcileContactNotesAcrossEntities(docId);

  const again = await ref.get();
  return mapDocToLead(again.id, (again.data() ?? {}) as Record<string, unknown>);
}

export async function updateLead(
  id: string,
  input: {
    name?: string;
    email?: string;
    phone?: string;
    stage?: string;
    pipelineId?: string;
    status?: "פתוח" | "זכיה" | "הפסד";
    assignedRep?: string;
    labelIds?: string[];
    tags?: string[];
    customFields?: Record<string, unknown>;
    notes?: Array<{
      id: string;
      text: string;
      createdAt: string;
      createdBy?: string;
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
): Promise<LeadRecord> {
  const docId = normalizeUniqueKey(id);
  const db = await getAdminDb();
  const ref = db.collection("leads").doc(docId);
  const snap = await ref.get();
  if (!snap.exists) throw new Error("Contact not found");

  const payload: Record<string, unknown> = { updatedAt: FieldValue.serverTimestamp() };
  if (input.name !== undefined) payload.name = input.name.trim();
  if (input.email !== undefined) payload.email = input.email.trim().toLowerCase();
  if (input.phone !== undefined) payload.phone = normalizePhone(input.phone) ?? "";
  if (input.stage !== undefined) payload.stage = input.stage.trim() || "Pending";
  if (input.pipelineId !== undefined) {
    const pid = input.pipelineId.trim();
    payload.pipelineId = pid || FieldValue.delete();
  }
  if (input.status !== undefined) payload.status = input.status;
  if (input.assignedRep !== undefined) payload.assignedRep = input.assignedRep.trim();
  if (input.labelIds !== undefined) {
    payload.labelIds = Array.from(new Set(input.labelIds.map((x) => String(x).trim()).filter(Boolean)));
    payload.tags = FieldValue.delete();
  } else if (input.tags !== undefined) {
    payload.labelIds = await normalizeIncomingLabelIds({ tags: input.tags });
    payload.tags = FieldValue.delete();
  }
  if (input.customFields !== undefined) payload.customFields = input.customFields;
  if (input.notes !== undefined) payload.notes = input.notes;
  if (input.tasks !== undefined) {
    const prevData = (snap.data() ?? {}) as Record<string, unknown>;
    const prevTasks = Array.isArray(prevData.tasks) ? [...(prevData.tasks as RawTaskIn[])] : [];
    const merged = mergeTaskArrays(prevTasks, input.tasks as RawTaskIn[]);
    const leadLabel =
      (typeof prevData.name === "string" && prevData.name) ||
      (typeof prevData.email === "string" && prevData.email) ||
      docId;
    const reconciled = await Promise.all(
      merged.map((t) =>
        reconcileTasksGoogleCalendar(prevTasks, [t], {
          entityType: "contact",
          entityId: docId,
          entityLabel: String(leadLabel),
        }).then((r) => r[0] ?? t)
      )
    );
    payload.tasks = reconciled;
  }
  const beforeLead = (snap.data() ?? {}) as Record<string, unknown>;
  await ref.set(payload, { merge: true });

  if (input.stage !== undefined) {
    const prevStage = String(beforeLead.stage ?? "Pending").trim() || "Pending";
    const nextStage = input.stage.trim() || "Pending";
    if (prevStage !== nextStage) {
      fireServerWebhooks(db, "lead_stage_changed", {
        lead: {
          id: docId,
          stage: nextStage,
          previousStage: prevStage,
          name: typeof beforeLead.name === "string" ? beforeLead.name : undefined,
        },
      });
    }
  }

  if (input.notes !== undefined && Array.isArray(input.notes)) {
    await propagateExactNotesToAllOpportunities(
      docId,
      input.notes as Array<{ id: string; text: string; createdAt: string; createdBy?: string }>
    );
  }

  const again = await ref.get();
  return mapDocToLead(again.id, (again.data() ?? {}) as Record<string, unknown>);
}

export async function setLeadWhatsAppMarketingApprovalByPhone(
  phoneRaw: string,
  approved: boolean,
  reason?: string,
  /** ל-webhook של מטא — אותו מסד כמו appendWhatsAppChatMessage (בלי tenant מהדפדפן) */
  dbOverride?: Firestore
): Promise<{ normalizedPhone?: string; updatedLeadIds: string[] }> {
  const normalizedPhone = normalizePhone(phoneRaw);
  if (!normalizedPhone) return { normalizedPhone: undefined, updatedLeadIds: [] };
  const db = dbOverride ?? (await getAdminDb());
  const refs = await collectLeadRefsByPhone(db, normalizedPhone);
  if (!refs.size) return { normalizedPhone, updatedLeadIds: [] };
  await applyLeadWhatsAppMarketingApprovalUpdates(refs, approved, reason);
  return { normalizedPhone, updatedLeadIds: Array.from(refs.keys()) };
}

async function collectLeadRefsByPhone(
  db: Firestore,
  normalizedPhone: string
): Promise<Map<string, DocumentReference<DocumentData>>> {
  const refs = new Map<string, DocumentReference<DocumentData>>();

  const byPhone = await db.collection("leads").where("phone", "==", normalizedPhone).limit(50).get();
  for (const doc of byPhone.docs) refs.set(doc.id, doc.ref);

  const byId = await db.collection("leads").doc(normalizedPhone).get();
  if (byId.exists) refs.set(byId.id, byId.ref);
  return refs;
}

async function applyLeadWhatsAppMarketingApprovalUpdates(
  refs: Map<string, DocumentReference<DocumentData>>,
  approved: boolean,
  reason?: string
): Promise<void> {
  const firstRef = Array.from(refs.values())[0];
  if (!firstRef) return;
  const db = firstRef.firestore;
  const haserLabelId = await getOrCreateHaserLabelId(db);
  const entries = await Promise.all(
    Array.from(refs.entries()).map(async ([id, ref]) => {
      const snap = await ref.get();
      return { id, ref, data: (snap.data() ?? {}) as Record<string, unknown> };
    })
  );
  const nowIso = new Date().toISOString();
  const updates = entries.map(({ ref, data }) => {
    const nextLabelIds = nextLeadLabelIdsForHaser(data.labelIds, haserLabelId, approved);
    return ref.set(
      {
        "customFields.whatsappMarketingApproved": approved,
        "customFields.whatsappMarketingApprovalUpdatedAt": nowIso,
        ...(approved
          ? { "customFields.whatsappMarketingApprovalReason": FieldValue.delete() }
          : {
              "customFields.whatsappMarketingApprovalReason": reason?.trim() || "opt_out_keyword",
            }),
        labelIds: nextLabelIds,
        tags: FieldValue.delete(),
        updatedAt: FieldValue.serverTimestamp(),
      },
      { merge: true }
    );
  });
  await Promise.all(updates);
}

function nextLeadLabelIdsForHaser(
  rawLabelIds: unknown,
  haserLabelId: string,
  approved: boolean
): string[] {
  const cur = Array.isArray(rawLabelIds)
    ? Array.from(new Set(rawLabelIds.map((x) => String(x).trim()).filter(Boolean)))
    : [];
  if (!haserLabelId) return cur;
  if (!approved) {
    return cur.includes(haserLabelId) ? cur : [...cur, haserLabelId];
  }
  return cur.filter((id) => id !== haserLabelId);
}

async function getOrCreateHaserLabelId(db: Firestore): Promise<string> {
  const labels = await listLabelsFromDb(db);
  const existing = labels.find((l) => l.name.trim() === HASER_LABEL_NAME);
  if (existing) return existing.id;
  const id = `lbl_${randomUUID().replace(/-/g, "")}`;
  const maxOrder = labels.reduce((m, x) => Math.max(m, x.sortOrder), 0);
  await db.collection("labels").doc(id).set({
    name: HASER_LABEL_NAME,
    color: HASER_LABEL_COLOR,
    sortOrder: maxOrder + 1,
    createdAt: FieldValue.serverTimestamp(),
    updatedAt: FieldValue.serverTimestamp(),
  });
  return id;
}

export async function backfillHaserLabelFromMarketingStatus(
  dbOverride?: Firestore
): Promise<{ processed: number; updated: number; haserLabelId?: string }> {
  const db = dbOverride ?? (await getAdminDb());
  const haserLabelId = await getOrCreateHaserLabelId(db);
  const snap = await db.collection("leads").get();
  let processed = 0;
  let updated = 0;
  let batch = db.batch();
  let writes = 0;
  const commitIfNeeded = async () => {
    if (writes >= 400) {
      await batch.commit();
      batch = db.batch();
      writes = 0;
    }
  };
  for (const doc of snap.docs) {
    processed += 1;
    const data = (doc.data() ?? {}) as Record<string, unknown>;
    const custom = (data.customFields as Record<string, unknown> | undefined) ?? {};
    const approved = custom.whatsappMarketingApproved !== false;
    const nextIds = nextLeadLabelIdsForHaser(data.labelIds, haserLabelId, approved);
    const curIds = Array.isArray(data.labelIds)
      ? Array.from(new Set(data.labelIds.map((x) => String(x).trim()).filter(Boolean)))
      : [];
    const changed =
      curIds.length !== nextIds.length || curIds.some((id) => !nextIds.includes(id));
    if (!changed) continue;
    updated += 1;
    batch.set(
      doc.ref,
      {
        labelIds: nextIds,
        tags: FieldValue.delete(),
        updatedAt: FieldValue.serverTimestamp(),
      },
      { merge: true }
    );
    writes += 1;
    await commitIfNeeded();
  }
  if (writes > 0) await batch.commit();
  return { processed, updated, haserLabelId };
}

export async function getLeadWhatsAppMarketingApprovalByPhone(
  phoneRaw: string,
  dbOverride?: Firestore
): Promise<{ normalizedPhone?: string; approved: boolean; leadIds: string[] }> {
  const normalizedPhone = normalizePhone(phoneRaw);
  if (!normalizedPhone) return { normalizedPhone: undefined, approved: true, leadIds: [] };
  const db = dbOverride ?? (await getAdminDb());
  const refs = await collectLeadRefsByPhone(db, normalizedPhone);
  if (!refs.size) return { normalizedPhone, approved: true, leadIds: [] };
  const snaps = await Promise.all(Array.from(refs.values()).map((ref) => ref.get()));
  const approved = !snaps.some((snap) => {
    const custom = (snap.data()?.customFields as Record<string, unknown> | undefined) ?? {};
    return custom.whatsappMarketingApproved === false;
  });
  return { normalizedPhone, approved, leadIds: Array.from(refs.keys()) };
}

export async function setLeadWhatsAppMarketingApprovalByLeadId(
  leadIdRaw: string,
  approved: boolean,
  reason?: string,
  dbOverride?: Firestore
): Promise<{ normalizedPhone?: string; updatedLeadIds: string[] }> {
  const leadId = normalizeUniqueKey(leadIdRaw);
  if (!leadId) return { normalizedPhone: undefined, updatedLeadIds: [] };
  const db = dbOverride ?? (await getAdminDb());
  const ref = db.collection("leads").doc(leadId);
  const snap = await ref.get();
  if (!snap.exists) return { normalizedPhone: undefined, updatedLeadIds: [] };
  const data = (snap.data() ?? {}) as Record<string, unknown>;
  const normalizedPhone = normalizePhone(String(data.phone ?? "")) ?? normalizePhone(leadId);
  if (normalizedPhone) {
    return setLeadWhatsAppMarketingApprovalByPhone(normalizedPhone, approved, reason, db);
  }
  await applyLeadWhatsAppMarketingApprovalUpdates(new Map([[leadId, ref]]), approved, reason);
  return { normalizedPhone: undefined, updatedLeadIds: [leadId] };
}

/** הליד האחרון שנוצר — לסקר התראות (השוואת מזהה בין קריאות). */
export async function getNewestLeadByCreatedAt(): Promise<{
  id: string;
  name: string;
  phone: string;
  createdAt: string;
} | null> {
  const db = await getAdminDb();
  try {
    const snap = await db.collection("leads").orderBy("createdAt", "desc").limit(1).get();
    if (snap.empty) return null;
    const doc = snap.docs[0]!;
    const lead = mapDocToLead(doc.id, doc.data() as Record<string, unknown>);
    return {
      id: lead.id,
      name: lead.name?.trim() ?? "",
      phone: lead.phone?.trim() ?? "",
      createdAt: lead.createdAt ? lead.createdAt.toISOString() : "",
    };
  } catch {
    return null;
  }
}

