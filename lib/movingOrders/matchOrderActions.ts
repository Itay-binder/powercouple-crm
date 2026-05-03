import { appendLeadNote } from "@/lib/leads/repo";
import type { LeadRecord } from "@/lib/leads/repo";
import { listOpportunities, updateOpportunity } from "@/lib/opportunities/repo";
import type { OpportunityRecord } from "@/lib/opportunities/repo";
import { MOVER_OPPORTUNITY_FIELD_IDS, PAYING_CUSTOMERS_PIPELINE_ID } from "@/lib/movingOrders/fieldIds";
import { opportunitiesByContactId } from "@/lib/movingOrders/matchMovers";
import { buildMoverEnrichment } from "@/lib/movingOrders/moverFieldReaders";
import type { MoverMatchEnrichment } from "@/lib/movingOrders/types";
import type { DriverMatchFlag } from "@/lib/movingOrders/types";

export type MatchWebhookMover = {
  contactId: string;
  matchFlag?: DriverMatchFlag;
  lead: {
    id: string;
    name: string;
    phone: string;
    email: string;
    stage: string;
    pipelineId: string;
    customFields?: Record<string, unknown>;
  };
  opportunity: null | {
    id: string;
    name: string;
    phone: string;
    email: string;
    stage: string;
    pipelineId: string;
    contactId: string;
    customValues?: Record<string, unknown>;
    lastLeadAt: string | null;
  };
  enrichment: MoverMatchEnrichment;
};

function serializeLead(lead: LeadRecord): MatchWebhookMover["lead"] {
  return {
    id: lead.id,
    name: lead.name ?? "",
    phone: lead.phone ?? "",
    email: lead.email ?? "",
    stage: lead.stage ?? "",
    pipelineId: lead.pipelineId ?? "",
    customFields:
      typeof lead.customFields === "object" && lead.customFields !== null
        ? (lead.customFields as Record<string, unknown>)
        : undefined,
  };
}

function serializeOpportunity(opp: OpportunityRecord): NonNullable<MatchWebhookMover["opportunity"]> {
  return {
    id: opp.id,
    name: opp.name ?? "",
    phone: (opp.phone ?? opp.contactPhone ?? "").trim(),
    email: (opp.email ?? opp.contactEmail ?? "").trim(),
    stage: opp.stage ?? "",
    pipelineId: opp.pipelineId ?? "",
    contactId: opp.contactId ?? "",
    customValues: opp.customValues,
    lastLeadAt: opp.lastLeadAt ? opp.lastLeadAt.toISOString() : null,
  };
}

/** שדות שטוחים לזיפייר/מייק — בנוסף למערך movers */
export function flatMatchSendOpportunityFields(movers: MatchWebhookMover[]): Record<string, string | number> {
  const count = movers.length;
  const flat: Record<string, string | number> = {
    opportunities_sent_count: count,
    "כמות הזדמנויות": count,
  };
  movers.forEach((m, idx) => {
    const i = idx + 1;
    const opp = m.opportunity;
    const name = (opp?.name?.trim() || m.lead.name?.trim() || "").trim();
    const phone = (opp?.phone?.trim() || m.lead.phone?.trim() || "").trim();
    const id = opp?.id?.trim() || "";
    flat[`opportunity_name_${i}`] = name;
    flat[`opportunity_phone_${i}`] = phone;
    flat[`opportunity_id_${i}`] = id;
    flat[`שם הזדמנות ${i}`] = name;
    flat[`מספר פלאפון הזדמנות ${i}`] = phone;
    flat[`מזהה הזדמנות ${i}`] = id;
  });
  return flat;
}

/**
 * טקסט אחד למזמין — שורה לכל מוביל: *שם:* טלפון (בלי תוויות «שם הזדמנות»), מופרד בשורה ריקה.
 */
export function customerFacingMoversMessageText(movers: MatchWebhookMover[]): string {
  const blocks = movers
    .map((m) => {
      const opp = m.opportunity;
      const name = (opp?.name?.trim() || m.lead.name?.trim() || "").trim();
      const phone = (opp?.phone?.trim() || m.lead.phone?.trim() || "").trim();
      if (!name && !phone) return "";
      if (!name) return phone;
      if (!phone) return `*${name}:*`;
      return `*${name}:* ${phone}`;
    })
    .filter(Boolean);
  return blocks.join("\n\n");
}

export async function buildMatchWebhookMovers(
  contactIds: string[],
  flags: Record<string, DriverMatchFlag> | undefined,
  leadById: Map<string, LeadRecord>,
  oppByContact: Map<string, OpportunityRecord>
): Promise<MatchWebhookMover[]> {
  const out: MatchWebhookMover[] = [];
  for (const cid of contactIds) {
    const lead = leadById.get(cid);
    if (!lead) continue;
    const opp = oppByContact.get(cid);
    out.push({
      contactId: cid,
      matchFlag: flags?.[cid],
      lead: serializeLead(lead),
      opportunity: opp ? serializeOpportunity(opp) : null,
      enrichment: buildMoverEnrichment(lead, opp),
    });
  }
  return out;
}

export async function applyMatchSendSideEffects(params: {
  contactIds: string[];
  orderCustomerName: string;
  orderId: string;
  /** שורות נוספות לפתקית (פרטי הובלה וכו׳) */
  transportNoteLines?: string[];
}): Promise<void> {
  const head = `הזמנה: ${params.orderCustomerName} · מזהה הזמנה: ${params.orderId}`;
  const extra = (params.transportNoteLines ?? []).map((x) => String(x).trim()).filter(Boolean);
  const note = extra.length ? [head, ...extra].join("\n") : head;
  const opps = await listOpportunities(PAYING_CUSTOMERS_PIPELINE_ID);
  const idx = opportunitiesByContactId(opps);

  for (const contactId of params.contactIds) {
    try {
      await appendLeadNote(contactId, { text: note, createdBy: "התאמת הזמנות" });
    } catch {
      /* איש קשר עלול להיות חסר — ממשיכים */
    }
    const opp = idx.get(contactId);
    if (!opp) continue;
    const cv = { ...(opp.customValues ?? {}) };
    const k = MOVER_OPPORTUNITY_FIELD_IDS.leadsCount;
    cv[k] = (Number(cv[k]) || 0) + 1;
    try {
      await updateOpportunity(opp.id, { customValues: cv, lastLeadAt: new Date() });
    } catch {
      /* ignore */
    }
  }
}

/** הפחתת מונה פניות (לידים) כשמסירים שליחת התאמה למוביל — לא משנה פתקיות קיימות */
export async function applyMatchRemoveSideEffects(contactIds: string[]): Promise<void> {
  const ids = [...new Set(contactIds.map((x) => String(x).trim()).filter(Boolean))];
  if (!ids.length) return;
  const opps = await listOpportunities(PAYING_CUSTOMERS_PIPELINE_ID);
  const idx = opportunitiesByContactId(opps);

  for (const contactId of ids) {
    const opp = idx.get(contactId);
    if (!opp) continue;
    const cv = { ...(opp.customValues ?? {}) };
    const k = MOVER_OPPORTUNITY_FIELD_IDS.leadsCount;
    const next = Math.max(0, (Number(cv[k]) || 0) - 1);
    cv[k] = next;
    try {
      await updateOpportunity(opp.id, { customValues: cv });
    } catch {
      /* ignore */
    }
  }
}
