import type { LeadRecord } from "@/lib/leads/repo";
import type { OpportunityRecord } from "@/lib/opportunities/repo";
import {
  MOVER_FIELD_IDS,
  MOVER_OPPORTUNITY_FIELD_IDS,
  MOVER_WELCOME_OPPORTUNITY_FIELD_IDS,
} from "@/lib/movingOrders/fieldIds";

export function normHe(s: string): string {
  return s
    .trim()
    .replace(/\s+/g, " ")
    .replace(/[\u0591-\u05C7]/g, "")
    .toLowerCase();
}

/** מפתח לטבלת יישוב→אזור */
export function normSettlementLookupKey(s: string): string {
  return s
    .trim()
    .replace(/\s+/g, " ")
    .replace(/[\u0591-\u05C7]/g, "")
    .toLowerCase();
}

export function readBoolYes(cf: Record<string, unknown> | undefined, keys: string[]): boolean {
  if (!cf) return false;
  for (const key of keys) {
    const v = cf[key];
    if (triStateYesNo(v) === true) return true;
  }
  return false;
}

/** ערך truthy ראשון לפי סדר המפתחות — כולל boolean ומספר */
export function readFirstTruthyField(
  merged: Record<string, unknown> | undefined,
  keys: string[]
): unknown {
  if (!merged) return undefined;
  for (const key of keys) {
    const v = merged[key];
    if (v === undefined || v === null) continue;
    if (typeof v === "boolean") return v;
    if (typeof v === "number" && Number.isFinite(v)) return v;
    if (typeof v === "string") {
      const t = v.trim();
      if (!t) continue;
      return t;
    }
    if (Array.isArray(v) && v.length) return v;
  }
  return undefined;
}

/**
 * נירמול בוליאני: Firestore/טפסים שולחים לעיתים true/false, לפעמים "כן"/"לא".
 * null = חסר או לא מזוהה ככן/לא.
 */
export function triStateYesNo(v: unknown): boolean | null {
  if (v === undefined || v === null) return null;
  if (typeof v === "boolean") return v;
  if (typeof v === "number" && Number.isFinite(v)) {
    if (v === 1) return true;
    if (v === 0) return false;
  }
  const s = String(v).trim().toLowerCase();
  if (!s) return null;
  if (s === "true" || s === "1" || s === "כן" || s === "yes" || s === "y") return true;
  if (s === "false" || s === "0" || s === "לא" || s === "no" || s === "n") return false;
  return null;
}

export function readStrFirst(cf: Record<string, unknown> | undefined, keys: string[]): string {
  if (!cf) return "";
  for (const key of keys) {
    const v = cf[key];
    if (typeof v === "string" && v.trim()) return v.trim();
    if (Array.isArray(v) && v.length) return v.map((x) => String(x).trim()).filter(Boolean).join(", ");
  }
  return "";
}

function tryParseRegionsJson(raw: string): string {
  try {
    const j = JSON.parse(raw) as unknown;
    if (Array.isArray(j)) return j.map((x) => String(x).trim()).filter(Boolean).join(", ");
    if (j && typeof j === "object" && "regions" in j) {
      const r = (j as { regions?: unknown }).regions;
      if (Array.isArray(r)) return r.map((x) => String(x).trim()).filter(Boolean).join(", ");
    }
  } catch {
    /* ignore */
  }
  return "";
}

/** טקסט אזורי פעילות — איחוד הזדמנות + איש קשר */
export function readMoverRegionsText(
  merged: Record<string, unknown> | undefined
): string {
  if (!merged) return "";
  const direct = readStrFirst(merged, [
    MOVER_OPPORTUNITY_FIELD_IDS.activityRegions,
    MOVER_WELCOME_OPPORTUNITY_FIELD_IDS.activityRegions,
    MOVER_FIELD_IDS.regions,
  ]);
  if (direct) return direct;
  const jsonRaw = merged[MOVER_WELCOME_OPPORTUNITY_FIELD_IDS.activityRegionsJson];
  if (typeof jsonRaw === "string" && jsonRaw.trim()) {
    const parsed = tryParseRegionsJson(jsonRaw);
    if (parsed) return parsed;
  }
  return "";
}

export function moverIsNationwide(merged: Record<string, unknown> | undefined, regionsText: string): boolean {
  if (readBoolYes(merged, [MOVER_FIELD_IDS.nationwide])) return true;
  const nr = normHe(regionsText);
  return nr.includes(normHe("כל הארץ"));
}

/**
 * מועמד למאגר מובילים — לפי איש קשר בלבד (לא לפי pipelineId של הליד).
 * המאגר מגיע מהזדמנויות בפייפליין «לקוחות משלמים»; איש הקשר עצמו עשוי להיות משויך לפייפליין אחר.
 */
export function leadIsMoverPoolMember(lead: LeadRecord): boolean {
  const v = lead.customFields?.[MOVER_FIELD_IDS.isMover];
  return triStateYesNo(v) !== false;
}

/**
 * @deprecated השתמשו ב־leadIsMoverPoolMember יחד עם רשימת contactId מן ההזדמנויות
 */
export function leadIsPayingPipelineMoverCandidate(lead: LeadRecord, payingPipelineId: string): boolean {
  if ((lead.pipelineId ?? "").trim() !== payingPipelineId) return false;
  return leadIsMoverPoolMember(lead);
}

export function mergeLeadAndOpportunity(
  lead: LeadRecord,
  opp: OpportunityRecord | undefined
): Record<string, unknown> {
  const out: Record<string, unknown> = {
    ...(lead.customFields as Record<string, unknown> | undefined),
  };
  const ov = opp?.customValues as Record<string, unknown> | undefined;
  if (!ov) return out;
  for (const [k, v] of Object.entries(ov)) {
    if (v === undefined || v === null) continue;
    if (typeof v === "string" && !v.trim()) continue;
    if (Array.isArray(v) && v.length === 0) continue;
    out[k] = v;
  }
  return out;
}

export function readActivityDaysText(merged: Record<string, unknown> | undefined): string {
  return readStrFirst(merged, [
    MOVER_OPPORTUNITY_FIELD_IDS.activityDaysText,
    MOVER_WELCOME_OPPORTUNITY_FIELD_IDS.activityDaysText,
    MOVER_FIELD_IDS.days,
  ]);
}

export function readWorkAvailabilityDisplay(merged: Record<string, unknown> | undefined): string {
  const raw = readFirstTruthyField(merged, [MOVER_OPPORTUNITY_FIELD_IDS.workAvailabilityStatus]);
  const t = triStateYesNo(raw);
  if (t === true) return "כן";
  if (t === false) return "לא";
  if (typeof raw === "string" && raw.trim()) return raw.trim();
  return "—";
}

export function readImmediateSos(merged: Record<string, unknown> | undefined): string {
  const raw = readFirstTruthyField(merged, [
    MOVER_OPPORTUNITY_FIELD_IDS.immediateAvailability,
    MOVER_WELCOME_OPPORTUNITY_FIELD_IDS.immediateAvailability,
  ]);
  const t = triStateYesNo(raw);
  if (t === true) return "כן";
  if (t === false) return "לא";
  if (typeof raw === "string" && raw.trim()) return raw.trim();
  return readBoolYes(merged, [MOVER_FIELD_IDS.sameDay]) ? "כן" : "לא";
}

/** SOS / זמינות מיידית — כן גם כשמגיע כ-boolean */
export function immediateSosIndicatesYes(merged: Record<string, unknown> | undefined): boolean {
  const raw = readFirstTruthyField(merged, [
    MOVER_OPPORTUNITY_FIELD_IDS.immediateAvailability,
    MOVER_WELCOME_OPPORTUNITY_FIELD_IDS.immediateAvailability,
  ]);
  const t = triStateYesNo(raw);
  if (t !== null) return t;
  return readBoolYes(merged, [MOVER_FIELD_IDS.sameDay]);
}

export function readSmallMoverAnswer(merged: Record<string, unknown> | undefined): string {
  const raw = readFirstTruthyField(merged, [
    MOVER_OPPORTUNITY_FIELD_IDS.smallMover,
    MOVER_FIELD_IDS.small,
  ]);
  const t = triStateYesNo(raw);
  if (t === true) return "כן";
  if (t === false) return "לא";
  if (typeof raw === "string" && String(raw).trim()) return String(raw).trim();
  return readBoolYes(merged, [MOVER_FIELD_IDS.small]) ? "כן" : "לא";
}

/**
 * בהתאמת הזמנת הובלה קטנה: ערך מפורש ב־opportunity_small_mover קובע לפני נפילה לשדות איש הקשר,
 * כדי ש־TRUE בהזדמנות יספיק גם כששדות אחרים על הליד אינם מיושרים.
 */
export function readSmallMoverAnswerForSmallMoveOrder(merged: Record<string, unknown> | undefined): string {
  const rawOpp = merged?.[MOVER_OPPORTUNITY_FIELD_IDS.smallMover];
  const tOpp = triStateYesNo(rawOpp);
  if (tOpp === true) return "כן";
  if (tOpp === false) return "לא";
  return readSmallMoverAnswer(merged);
}

export function readApartmentMoverAnswer(merged: Record<string, unknown> | undefined): string {
  const rawOpp = readFirstTruthyField(merged, [MOVER_OPPORTUNITY_FIELD_IDS.apartmentMover]);
  let t = triStateYesNo(rawOpp);
  if (t === true) return "כן";
  if (t === false) return "לא";
  if (typeof rawOpp === "string" && rawOpp.trim()) return rawOpp.trim();

  const rawApt = readFirstTruthyField(merged, [MOVER_FIELD_IDS.apartment]);
  t = triStateYesNo(rawApt);
  if (t === true) return "כן";
  if (t === false) return "לא";

  const rawLarge = readFirstTruthyField(merged, [MOVER_FIELD_IDS.large]);
  t = triStateYesNo(rawLarge);
  if (t === true) return "כן";
  if (t === false) return "לא";

  const apt = readBoolYes(merged, [MOVER_FIELD_IDS.apartment]);
  const large = readBoolYes(merged, [MOVER_FIELD_IDS.large]);
  return apt || large ? "כן" : "לא";
}

export function readCrane(merged: Record<string, unknown> | undefined): string {
  const raw = readFirstTruthyField(merged, [
    MOVER_FIELD_IDS.crane,
    "opportunity_crane",
    "opportunity_mover_crane",
    "opportunity_mover_welcome_crane",
    "mover_crane",
  ]);
  const t = triStateYesNo(raw);
  if (t === true) return "כן";
  if (t === false) return "לא";
  const services = readStrFirst(merged, [MOVER_WELCOME_OPPORTUNITY_FIELD_IDS.moverServices]);
  if (services && /מנוף/i.test(services)) return "כן";
  return readBoolYes(merged, [MOVER_FIELD_IDS.crane]) ? "כן" : "לא";
}

export function readLeadsCount(merged: Record<string, unknown> | undefined): string {
  const v = merged?.[MOVER_OPPORTUNITY_FIELD_IDS.leadsCount];
  if (typeof v === "number" && Number.isFinite(v)) return String(v);
  if (typeof v === "string" && v.trim()) return v.trim();
  return "0";
}

function readOpportunityNumericAsString(merged: Record<string, unknown> | undefined, key: string): string {
  if (!merged) return "0";
  const v = merged[key];
  if (typeof v === "number" && Number.isFinite(v)) return String(Math.max(0, Math.floor(v)));
  if (typeof v === "string" && v.trim()) {
    const n = Number(v);
    if (Number.isFinite(n)) return String(Math.max(0, Math.floor(n)));
  }
  return "0";
}

function israelDayKeyNow(): string {
  return new Date().toLocaleDateString("en-CA", { timeZone: "Asia/Jerusalem" });
}

/** קאונטר יומי — רק אם מפתח היום תואם ליום ישראל הנוכחי */
function readDailyLeadsTodayDisplay(merged: Record<string, unknown> | undefined): string {
  if (!merged) return "0";
  const dayKey = String(merged[MOVER_OPPORTUNITY_FIELD_IDS.dailyLeadsCountDayKey] ?? "").trim();
  const today = israelDayKeyNow();
  if (dayKey !== today) return "0";
  return readOpportunityNumericAsString(merged, MOVER_OPPORTUNITY_FIELD_IDS.dailyLeadsCount);
}

/** תאריך ליד אחרון שההזדמנות קיבלה (שדה lastLeadAt על ההזדמנות) */
export function opportunityLastLeadReceivedIso(opp: OpportunityRecord | undefined): string | null {
  if (!opp?.lastLeadAt) return null;
  return opp.lastLeadAt.toISOString();
}

function latestOpportunityNoteText(opp: OpportunityRecord | undefined): string {
  if (!opp) return "";
  const custom = readStrFirst(opp.customValues as Record<string, unknown> | undefined, [
    "opportunity_notes",
    MOVER_WELCOME_OPPORTUNITY_FIELD_IDS.notes,
    "opportunity_mover_notes",
    "opportunity_mover_note",
    "opportunity_driver_notes",
  ]);
  return custom || "";
}

export function buildMoverEnrichment(
  lead: LeadRecord,
  opp: OpportunityRecord | undefined
): import("@/lib/movingOrders/types").MoverMatchEnrichment {
  const merged = mergeLeadAndOpportunity(lead, opp);
  const regions = readMoverRegionsText(merged);
  return {
    opportunityId: opp?.id,
    opportunityName: opp?.name?.trim() || undefined,
    opportunityNotes: latestOpportunityNoteText(opp) || undefined,
    regions,
    workAvailability: readWorkAvailabilityDisplay(merged),
    activityDays: readActivityDaysText(merged),
    apartmentMover: readApartmentMoverAnswer(merged),
    smallMover: readSmallMoverAnswer(merged),
    sos: readImmediateSos(merged) || "—",
    crane: readCrane(merged),
    leadCount: readLeadsCount(merged),
    packageCurrentSentLeads: readOpportunityNumericAsString(
      merged,
      MOVER_OPPORTUNITY_FIELD_IDS.currentPackageSentLeadsCount
    ),
    packageCurrentPurchasedLeads: readOpportunityNumericAsString(
      merged,
      MOVER_OPPORTUNITY_FIELD_IDS.currentPackageLeadsCount
    ),
    dailyLeadsToday: readDailyLeadsTodayDisplay(merged),
    lastLeadAt: opportunityLastLeadReceivedIso(opp),
    flexibleHours: readStrFirst(merged, [
      MOVER_WELCOME_OPPORTUNITY_FIELD_IDS.activityFlexible,
      MOVER_FIELD_IDS.flexibleHours,
    ]),
    hourStart: readStrFirst(merged, [
      MOVER_WELCOME_OPPORTUNITY_FIELD_IDS.activityStart,
      MOVER_FIELD_IDS.hourStart,
    ]),
    hourEnd: readStrFirst(merged, [
      MOVER_WELCOME_OPPORTUNITY_FIELD_IDS.activityEnd,
      MOVER_FIELD_IDS.hourEnd,
    ]),
  };
}
