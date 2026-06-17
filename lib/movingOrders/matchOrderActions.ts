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

function readNumericCustomField(cv: Record<string, unknown> | undefined, key: string): number {
  if (!cv) return 0;
  const v = cv[key];
  if (typeof v === "number" && Number.isFinite(v)) return v;
  if (typeof v === "string" && v.trim()) {
    const n = Number(v);
    if (Number.isFinite(n)) return n;
  }
  return 0;
}

function israelDayKeyNow(): string {
  return new Date().toLocaleDateString("en-CA", { timeZone: "Asia/Jerusalem" });
}

function nextDailyLeadsCount(
  cv: Record<string, unknown>,
  delta: 1 | -1
): { nextCount: number; todayKey: string } {
  const countKey = MOVER_OPPORTUNITY_FIELD_IDS.dailyLeadsCount;
  const dayKeyField = MOVER_OPPORTUNITY_FIELD_IDS.dailyLeadsCountDayKey;
  const todayKey = israelDayKeyNow();
  const storedDay = String(cv[dayKeyField] ?? "").trim();
  const base = storedDay === todayKey ? readNumericCustomField(cv, countKey) : 0;
  const next = Math.max(0, base + delta);
  return { nextCount: next, todayKey };
}

/** שדות שטוחים לזיפייר/מייק — בנוסף למערך movers */
export function flatMatchSendOpportunityFields(movers: MatchWebhookMover[]): Record<string, string | number> {
  const count = movers.length;
  const flat: Record<string, string | number> = {
    opportunities_sent_count: count,
    "כמות הזדמנויות": count,
  };
  const F = MOVER_OPPORTUNITY_FIELD_IDS;
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
    if (opp?.customValues && typeof opp.customValues === "object") {
      const cv = opp.customValues as Record<string, unknown>;
      const totalLeads = readNumericCustomField(cv, F.leadsCount);
      const packagePurchased = readNumericCustomField(cv, F.currentPackageLeadsCount);
      const packageSent = readNumericCustomField(cv, F.currentPackageSentLeadsCount);
      flat[`opportunity_total_leads_count_${i}`] = totalLeads;
      flat[`opportunity_package_current_leads_purchased_${i}`] = packagePurchased;
      flat[`opportunity_package_current_leads_sent_${i}`] = packageSent;
      flat[`כמות פניות כללית למוביל ${i}`] = totalLeads;
      flat[`כמות לידים בחבילה הנוכחית (שנרכשה) ${i}`] = packagePurchased;
      flat[`כמות לידים בחבילה הנוכחית (נשלחו) ${i}`] = packageSent;
    }
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
  const opps = await listOpportunities(PAYING_CUSTOMERS_PIPELINE_ID);
  const idx = opportunitiesByContactId(opps);

  for (const contactId of params.contactIds) {
    const counterLines: string[] = [];
    const opp = idx.get(contactId);
    if (opp) {
      const cv = { ...(opp.customValues ?? {}) };
      const totalKey = MOVER_OPPORTUNITY_FIELD_IDS.leadsCount;
      const sentKey = MOVER_OPPORTUNITY_FIELD_IDS.currentPackageSentLeadsCount;
      const sizeKey = MOVER_OPPORTUNITY_FIELD_IDS.currentPackageLeadsCount;

      const nextTotal = (Number(cv[totalKey]) || 0) + 1;
      cv[totalKey] = nextTotal;
      counterLines.push(
        `כמות לידים כוללת למוביל (כולל הזמנה זו): ${nextTotal}`
      );
      const dailyCountKey = MOVER_OPPORTUNITY_FIELD_IDS.dailyLeadsCount;
      const dailyDayKey = MOVER_OPPORTUNITY_FIELD_IDS.dailyLeadsCountDayKey;
      const daily = nextDailyLeadsCount(cv, 1);
      cv[dailyCountKey] = daily.nextCount;
      cv[dailyDayKey] = daily.todayKey;
      counterLines.push(`כמות לידים יומית (היום): ${daily.nextCount}`);

      const packageSize = Number(cv[sizeKey]) || 0;
      let nextSent = (Number(cv[sentKey]) || 0) + 1;
      let packageReached = false;
      if (packageSize > 0 && nextSent >= packageSize) {
        packageReached = true;
        counterLines.push(
          `כמות לידים בחבילה הנוכחית: ${nextSent}/${packageSize}`
        );
        nextSent = 0;
        counterLines.push(
          `החבילה הנוכחית הסתיימה — הקאונטר אופס לאפס לחבילה הבאה`
        );
      } else if (packageSize > 0) {
        counterLines.push(
          `כמות לידים בחבילה הנוכחית: ${nextSent}/${packageSize}`
        );
      } else {
        counterLines.push(
          `כמות לידים בחבילה הנוכחית: ${nextSent}`
        );
      }
      cv[sentKey] = nextSent;

      try {
        await updateOpportunity(opp.id, { customValues: cv, lastLeadAt: new Date() });
      } catch {
        /* ignore */
      }
      void packageReached;
    }
    const noteLines = [head, ...extra, ...counterLines].filter(Boolean);
    const note = noteLines.join("\n");
    try {
      await appendLeadNote(contactId, { text: note, createdBy: "התאמת הזמנות" });
    } catch {
      /* איש קשר עלול להיות חסר — ממשיכים */
    }
  }
}

/** הפחתת מונה פניות (לידים) כשמסירים שליחת התאמה למוביל + רישום הערת זיכוי */
export async function applyMatchRemoveSideEffects(contactIds: string[]): Promise<void> {
  const ids = [...new Set(contactIds.map((x) => String(x).trim()).filter(Boolean))];
  if (!ids.length) return;
  const opps = await listOpportunities(PAYING_CUSTOMERS_PIPELINE_ID);
  const idx = opportunitiesByContactId(opps);

  for (const contactId of ids) {
    const opp = idx.get(contactId);
    if (!opp) continue;
    const cv = { ...(opp.customValues ?? {}) };
    const totalKey = MOVER_OPPORTUNITY_FIELD_IDS.leadsCount;
    const sentKey = MOVER_OPPORTUNITY_FIELD_IDS.currentPackageSentLeadsCount;
    const sizeKey = MOVER_OPPORTUNITY_FIELD_IDS.currentPackageLeadsCount;

    const nextTotal = Math.max(0, (Number(cv[totalKey]) || 0) - 1);
    cv[totalKey] = nextTotal;
    const dailyCountKey = MOVER_OPPORTUNITY_FIELD_IDS.dailyLeadsCount;
    const dailyDayKey = MOVER_OPPORTUNITY_FIELD_IDS.dailyLeadsCountDayKey;
    const daily = nextDailyLeadsCount(cv, -1);
    cv[dailyCountKey] = daily.nextCount;
    cv[dailyDayKey] = daily.todayKey;
    const nextSent = Math.max(0, (Number(cv[sentKey]) || 0) - 1);
    cv[sentKey] = nextSent;
    const packageSize = Number(cv[sizeKey]) || 0;

    try {
      await updateOpportunity(opp.id, { customValues: cv });
    } catch {
      /* ignore */
    }
    const sentLine =
      packageSize > 0
        ? `כמות לידים בחבילה הנוכחית (לאחר הזיכוי): ${nextSent}/${packageSize}`
        : `כמות לידים בחבילה הנוכחית (לאחר הזיכוי): ${nextSent}`;
    const note = [
      "זיכוי ליד: הוסרה התאמת הזמנה שנשלחה למוביל.",
      `כמות לידים כוללת למוביל (לאחר הזיכוי): ${nextTotal}`,
      `כמות לידים יומית (לאחר הזיכוי): ${daily.nextCount}`,
      sentLine,
    ].join("\n");
    try {
      await appendLeadNote(contactId, { text: note, createdBy: "זיכוי הזמנה" });
    } catch {
      /* ignore */
    }
  }
}
