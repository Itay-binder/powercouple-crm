import type { LeadRecord } from "@/lib/leads/repo";
import type { OpportunityRecord } from "@/lib/opportunities/repo";
import { lookupRegionForSettlement } from "@/lib/movingOrders/cityRegionSettingsRepo";
import { extractCityHints } from "@/lib/movingOrders/israelCities";
import {
  driverWorksOnAllDayGroups,
  orderDateToJerusalemWeekdayMarkers,
} from "@/lib/movingOrders/matchDrivers";
import { resolveOrderMoveKind } from "@/lib/movingOrders/orderMoveKindResolve";
import { movingOrderDateYmdIsrael } from "@/lib/movingOrders/orderMoveDate";
import { MOVER_OPPORTUNITY_FIELD_IDS, PAYING_CUSTOMERS_PIPELINE_ID } from "@/lib/movingOrders/fieldIds";
import { MATCH_ISSUE_MOVER_NOT_ACTIVE_FOR_WORK } from "@/lib/movingOrders/matchInactiveWork";
import type {
  DriverMatchFlag,
  MovingOrderPayload,
  MovingOrderStatus,
} from "@/lib/movingOrders/types";
import {
  immediateSosIndicatesYes,
  leadIsMoverPoolMember,
  mergeLeadAndOpportunity,
  moverIsNationwide,
  normHe,
  readActivityDaysText,
  readApartmentMoverAnswer,
  readFirstTruthyField,
  readMoverRegionsText,
  readSmallMoverAnswerForSmallMoveOrder,
  triStateYesNo,
} from "@/lib/movingOrders/moverFieldReaders";
import {
  isYanivShmuelPayingMover,
  parseOrderApartmentRoomCount,
  YANIV_SHMUEL_ROOM_PARTIAL_MATCH_ISSUE_HE,
} from "@/lib/movingOrders/yanivShmuelRoomMatch";

function combineFlags(a: DriverMatchFlag, b: DriverMatchFlag): DriverMatchFlag {
  if (a === "red" || b === "red") return "red";
  if (a === "orange" || b === "orange") return "orange";
  return "ok";
}

function flagRank(f: DriverMatchFlag): number {
  if (f === "ok") return 0;
  if (f === "orange") return 1;
  return 2;
}

export function opportunitiesByContactId(opps: OpportunityRecord[]): Map<string, OpportunityRecord> {
  const m = new Map<string, OpportunityRecord>();
  for (const o of opps) {
    const cid = (o.contactId ?? "").trim();
    if (!cid) continue;
    const prev = m.get(cid);
    if (!prev) {
      m.set(cid, o);
      continue;
    }
    const ta = prev.updatedAt?.getTime() ?? 0;
    const tb = o.updatedAt?.getTime() ?? 0;
    if (tb >= ta) m.set(cid, o);
  }
  return m;
}

function normCity(s: string): string {
  return normHe(s);
}

function cityIsRamatGanOrGiva(c: string): boolean {
  const n = normCity(c);
  if (!n) return false;
  return n === normCity("רמת גן") || n === normCity("גבעתיים");
}

function cityIsTlv(c: string): boolean {
  const n = normCity(c);
  if (!n) return false;
  return (
    n === normCity("תל אביב-יפו") ||
    n === normCity("תל אביב") ||
    (n.includes("תל") && n.includes("אביב"))
  );
}

function buildRegionRuleGroups(
  pickupCity: string,
  dropCity: string,
  settlementRegionMap: Map<string, string>
): string[][] {
  const cities = [pickupCity, dropCity].filter((x) => x.trim());
  const hasRG = cities.some(cityIsRamatGanOrGiva);
  const hasTLV = cities.some(cityIsTlv);
  const groups: string[][] = [];
  if (hasRG) {
    groups.push([
      "רמת גן / גבעתיים",
      "רמת גן",
      "גבעתיים",
      "גוש דן",
      "כל הארץ",
    ]);
  }
  if (hasTLV) {
    groups.push([
      "תל אביב",
      "תל אביב-יפו",
      "תל אביב יפו",
      "גוש דן",
      "כל הארץ",
    ]);
  }
  if (groups.length === 0) {
    const regs = new Set<string>();
    for (const c of cities) {
      const r = lookupRegionForSettlement(settlementRegionMap, c);
      if (r?.trim()) regs.add(r.trim());
      else if (c.trim()) regs.add(c.trim());
    }
    const arr = Array.from(regs).filter((x) => x.trim());
    if (arr.length) groups.push(arr);
  }
  return groups;
}

/**
 * כשמספר כללי עיר חלים (למשל רמת גן + תל אביב), AND בין קבוצות מתפסק מובילים עם «תל אביב» בלבד.
 * במקרה המטרופוליני מאחדים לאיחוד טוקנים — מספיק התאמה לאחד מהם (כמו קבוצה אחת).
 */
function coalesceMetroRegionGroups(groups: string[][]): string[][] {
  if (groups.length <= 1) return groups;
  const seen = new Set<string>();
  const union: string[] = [];
  for (const g of groups) {
    for (const t of g) {
      const nk = normHe(t);
      if (nk.length < 2) continue;
      if (seen.has(nk)) continue;
      seen.add(nk);
      union.push(t);
    }
  }
  return union.length ? [union] : groups;
}

function normHeNoSpaces(s: string): string {
  return normHe(s).replace(/\s+/g, "");
}

function moverMatchesRegionTokens(
  moverNorm: string,
  tokens: string[],
  nationwide: boolean
): boolean {
  if (nationwide) return true;
  if (tokens.length === 0) return false;
  const moverCollapsed = normHeNoSpaces(moverNorm);
  for (const t of tokens) {
    const nt = normHe(t);
    if (nt.length >= 2 && moverNorm.includes(nt)) return true;
    const ntCol = normHeNoSpaces(t);
    if (ntCol.length >= 2 && moverCollapsed.includes(ntCol)) return true;
  }
  return false;
}

function moverPassesAllRegionGroups(
  moverNorm: string,
  groups: string[][],
  nationwide: boolean
): boolean {
  for (const g of groups) {
    if (!moverMatchesRegionTokens(moverNorm, g, nationwide)) return false;
  }
  return true;
}

function hebrewDayLabelToMarkers(label: string): string[] {
  const t = label.trim().replace(/['׳"]/g, "");
  const first = t.charAt(0);
  const map: Record<string, string[]> = {
    א: ["א", "א׳", "ראשון", "יום א", "יום ראשון"],
    ב: ["ב", "ב׳", "שני", "יום ב", "יום שני"],
    ג: ["ג", "ג׳", "שלישי", "יום ג", "יום שלישי"],
    ד: ["ד", "ד׳", "רביעי", "יום ד", "יום רביעי"],
    ה: ["ה", "ה׳", "חמישי", "יום ה", "יום חמישי"],
    ו: ["ו", "ו׳", "שישי", "יום ו", "יום שישי"],
    ש: ["שבת", "ש׳", "שבת.", "יום שבת"],
  };
  return map[first] ?? [];
}

export function dayMarkersFromOrder(
  cv: Record<string, unknown> | undefined,
  payload: MovingOrderPayload
): string[] {
  const label = String(cv?.moving_order_day_order ?? payload.day_order ?? "").trim();
  if (label) {
    const m = hebrewDayLabelToMarkers(label);
    if (m.length) return m;
  }
  const date = String(cv?.moving_order_date ?? payload.date ?? "").trim();
  return orderDateToJerusalemWeekdayMarkers(date);
}

/**
 * קבוצות ימים להתאמה: תאריך ההובלה + לכל הזמנה ממתינה שעדיין לא נשלחה התאמה — גם יום הלוח הירושלמי הנוכחי,
 * כדי שמעבר יום (למשל ה׳→ו׳) יעדכן סטטוס התאמה גם בלי שינוי תאריך בהזמנה.
 */
export function dayMarkerGroupsForMatch(
  cv: Record<string, unknown> | undefined,
  payload: MovingOrderPayload,
  ctx: { orderStatus: MovingOrderStatus; sentMatchCount: number }
): string[][] {
  const groups: string[][] = [];
  const label = String(cv?.moving_order_day_order ?? payload.day_order ?? "").trim();
  if (label) {
    const m = hebrewDayLabelToMarkers(label);
    if (m.length) groups.push(m);
  } else {
    const date = String(cv?.moving_order_date ?? payload.date ?? "").trim();
    const moveMarkers = orderDateToJerusalemWeekdayMarkers(date);
    if (moveMarkers.length) groups.push(moveMarkers);
  }

  const pendingUnsent = ctx.orderStatus === "pending" && ctx.sentMatchCount === 0;
  if (pendingUnsent) {
    const ymdToday = new Date().toLocaleDateString("en-CA", { timeZone: "Asia/Jerusalem" });
    const todayMarkers = orderDateToJerusalemWeekdayMarkers(ymdToday);
    if (todayMarkers.length) {
      const dateRaw = String(cv?.moving_order_date ?? payload.date ?? "").trim();
      const ymdMove = dateRaw ? movingOrderDateYmdIsrael(dateRaw) : "";
      if (!ymdMove || ymdMove !== ymdToday) {
        groups.push(todayMarkers);
      }
    }
  }

  return groups;
}

export function resolveOrderCities(
  payload: MovingOrderPayload,
  cv: Record<string, unknown> | undefined
): { pickupCity: string; dropCity: string } {
  let pickupCity = String(cv?.moving_order_pickup_city ?? payload.pickup_city ?? "").trim();
  let dropCity = String(cv?.moving_order_dropoff_city ?? payload.dropoff_city ?? "").trim();
  const pickupLine = (payload.pickup ?? "").trim();
  const dropLine = (payload.dropoff ?? "").trim();

  if (!pickupCity && pickupLine) {
    const fromPickup = extractCityHints(pickupLine, "");
    if (fromPickup[0]) pickupCity = fromPickup[0];
  }
  if (!dropCity && dropLine) {
    const fromDrop = extractCityHints(dropLine, "");
    if (fromDrop[0]) dropCity = fromDrop[0];
  }

  const hints = extractCityHints(pickupLine, dropLine);
  if (!pickupCity && hints[0]) pickupCity = hints[0];
  if (!dropCity) dropCity = hints[1] ?? hints[0] ?? "";

  return { pickupCity, dropCity };
}

function orderIsUrgentByField(payload: MovingOrderPayload, cv: Record<string, unknown> | undefined): boolean {
  const raw = cv?.moving_order_is_urgent ?? payload.is_urgent;
  if (triStateYesNo(raw) === true) return true;
  const u = String(raw ?? "")
    .trim()
    .toLowerCase();
  return u === "כן" || u === "yes" || u === "true" || u === "1";
}

/** דחיפות גם כשתאריךი הובלה הוא היום או מחר (לוח שנה — Asia/Jerusalem) */
function orderIsTodayOrTomorrowIsrael(
  payload: MovingOrderPayload,
  cv: Record<string, unknown> | undefined
): boolean {
  const raw = String(cv?.moving_order_date ?? payload.date ?? "").trim();
  const ds = movingOrderDateYmdIsrael(raw);
  if (!ds) return false;
  const today = new Date().toLocaleDateString("en-CA", { timeZone: "Asia/Jerusalem" });
  const tomorrow = new Date(Date.now() + 864e5).toLocaleDateString("en-CA", {
    timeZone: "Asia/Jerusalem",
  });
  return ds === today || ds === tomorrow;
}

/**
 * מתי לבדוק התאמת SOS מול המוביל.
 * בהובלה קטנה לא מסמנים כתום רק בגלל שתאריך ההובלה הוא היום/מחר — רק כשיש דחיפות מפורשת בשדה (הזמנות בדיקה וכו׳).
 */
function orderRequiresSosCapabilityForMatch(
  payload: MovingOrderPayload,
  cv: Record<string, unknown> | undefined,
  moveKind: "small" | "large" | "unknown"
): boolean {
  if (orderIsUrgentByField(payload, cv)) return true;
  if (moveKind === "small") return false;
  return orderIsTodayOrTomorrowIsrael(payload, cv);
}

export function syntheticLeadFromOpportunity(opp: OpportunityRecord): LeadRecord {
  const cid = (opp.contactId ?? "").trim();
  return {
    id: cid,
    name: opp.contactName ?? opp.name,
    phone: opp.contactPhone ?? opp.phone,
    email: opp.contactEmail ?? opp.email,
    stage: "",
    pipelineId: "",
    customFields: {},
    createdAt: null,
    updatedAt: null,
  };
}

/** זמינות נחשבת תקינה רק כשהשדה מפורש כ"כן" */
function workAvailabilityOk(merged: Record<string, unknown> | undefined): boolean {
  const raw = readFirstTruthyField(merged, [MOVER_OPPORTUNITY_FIELD_IDS.workAvailabilityStatus]);
  return triStateYesNo(raw) === true;
}

export type YanivShmuelRoomAlert = {
  opportunityId: string;
  contactId: string;
  rooms: number;
};

export type MatchMoversDetailedResult = {
  matchedDriverIds: string[];
  optionalDriverIds: string[];
  driverMatchFlags: Record<string, DriverMatchFlag>;
  driverMatchIssues: Record<string, string[]>;
  /** התראות לפתק אוטומטי על הזדמנות יניב שמואל (מעל 3 חדרים בהובלת דירה) */
  yanivShmuelRoomAlerts?: YanivShmuelRoomAlert[];
};

/**
 * כל אנשי הקשר עם הזדמנות בפייפליין customers — ללא סינון הסרה;
 * כשל בקריטריון מסומן באדום/כתום + רשימת סיבות בעברית.
 */
export function matchMoversForOrderDetailed(
  _payingPipelineId: string,
  leads: LeadRecord[],
  opportunities: OpportunityRecord[],
  payload: MovingOrderPayload,
  orderCustomValues: Record<string, unknown> | undefined,
  settlementRegionMap: Map<string, string>,
  manualContactIds: Set<string>,
  matchCtx: { orderStatus: MovingOrderStatus; sentMatchCount: number } = {
    orderStatus: "pending",
    sentMatchCount: 0,
  }
): MatchMoversDetailedResult {
  const pipe = PAYING_CUSTOMERS_PIPELINE_ID.trim();
  const cv = orderCustomValues;
  const oppsInPipe = opportunities.filter((o) => (o.pipelineId ?? "").trim() === pipe);
  const oppByContact = opportunitiesByContactId(oppsInPipe);

  const contactIdsFromPayingOpps = new Set<string>();
  for (const o of oppsInPipe) {
    const cid = (o.contactId ?? "").trim();
    if (cid) contactIdsFromPayingOpps.add(cid);
  }

  const leadById = new Map(leads.map((l) => [l.id, l]));
  const toProcess: LeadRecord[] = [];
  const seen = new Set<string>();
  for (const cid of contactIdsFromPayingOpps) {
    const opp = oppByContact.get(cid);
    if (!opp) continue;
    const lead = leadById.get(cid);
    const eff = lead ?? syntheticLeadFromOpportunity(opp);
    if (seen.has(eff.id)) continue;
    toProcess.push(eff);
    seen.add(eff.id);
  }
  for (const mid of manualContactIds) {
    if (seen.has(mid)) continue;
    const lead = leadById.get(mid);
    if (!lead) continue;
    toProcess.push(lead);
    seen.add(mid);
  }

  const { pickupCity, dropCity } = resolveOrderCities(payload, cv);
  const regionGroups = coalesceMetroRegionGroups(
    buildRegionRuleGroups(pickupCity, dropCity, settlementRegionMap)
  );
  const moveKind = resolveOrderMoveKind(payload, cv);
  const sosCapabilityRequired = orderRequiresSosCapabilityForMatch(payload, cv, moveKind);
  const dayGroups = dayMarkerGroupsForMatch(cv, payload, {
    orderStatus: matchCtx.orderStatus,
    sentMatchCount: matchCtx.sentMatchCount,
  });
  const apartmentRooms = parseOrderApartmentRoomCount(cv, payload);

  const rows: Array<{ id: string; flag: DriverMatchFlag; name: string }> = [];
  const driverMatchIssues: Record<string, string[]> = {};
  const yanivShmuelRoomAlerts: YanivShmuelRoomAlert[] = [];

  for (const lead of toProcess) {
    const opp = oppByContact.get(lead.id);
    const merged = mergeLeadAndOpportunity(lead, opp);
    const regionsText = readMoverRegionsText(merged);
    const nationwide = moverIsNationwide(merged, regionsText);
    const moverNorm = normHe(regionsText);
    const hasRegionRequirement = regionGroups.some((g) => g.length > 0);
    const regionsDataMissing =
      !nationwide && !regionsText.trim() && hasRegionRequirement;

    const manual = manualContactIds.has(lead.id);
    const regionStrictOk = moverPassesAllRegionGroups(moverNorm, regionGroups, nationwide);

    const issuesHe: string[] = [];
    let flag: DriverMatchFlag = "ok";

    if (!leadIsMoverPoolMember(lead)) {
      flag = combineFlags(flag, "red");
      issuesHe.push("לא מסומן כמוביל");
    }

    if (!manual) {
      if (regionsDataMissing) {
        flag = combineFlags(flag, "orange");
        issuesHe.push("אזור פעילות חסר");
      } else if (!regionStrictOk) {
        flag = combineFlags(flag, "red");
        issuesHe.push("אזור פעילות");
      }
    }

    if (!workAvailabilityOk(merged)) {
      flag = combineFlags(flag, "red");
      issuesHe.push(MATCH_ISSUE_MOVER_NOT_ACTIVE_FOR_WORK);
    }

    if (moveKind === "small" && normHe(readSmallMoverAnswerForSmallMoveOrder(merged)) === normHe("לא")) {
      flag = combineFlags(flag, "orange");
      issuesHe.push("סוג הובלה (קטנה)");
    }
    if (moveKind === "large" && normHe(readApartmentMoverAnswer(merged)) === normHe("לא")) {
      flag = combineFlags(flag, "orange");
      issuesHe.push("סוג הובלה (דירה)");
    }

    if (sosCapabilityRequired && !immediateSosIndicatesYes(merged)) {
      flag = combineFlags(flag, "orange");
      issuesHe.push("דחיפות · SOS");
    }

    if (dayGroups.length > 0) {
      const daysStr = readActivityDaysText(merged);
      if (!driverWorksOnAllDayGroups(daysStr, dayGroups)) {
        flag = combineFlags(flag, "orange");
        issuesHe.push("ימי פעילות (תאריך הובלה / היום)");
      }
    }

    rows.push({
      id: lead.id,
      flag,
      name: (lead.name ?? "").trim(),
    });
    if (issuesHe.length) driverMatchIssues[lead.id] = issuesHe;
  }

  rows.sort((a, b) => {
    const d = flagRank(a.flag) - flagRank(b.flag);
    if (d !== 0) return d;
    return (a.name || a.id).localeCompare(b.name || b.id, "he");
  });

  const matchedDriverIds = rows.map((r) => r.id);
  const driverMatchFlags: Record<string, DriverMatchFlag> = {};
  for (const r of rows) driverMatchFlags[r.id] = r.flag;

  return {
    matchedDriverIds,
    optionalDriverIds: [],
    driverMatchFlags,
    driverMatchIssues,
    yanivShmuelRoomAlerts: yanivShmuelRoomAlerts.length ? yanivShmuelRoomAlerts : undefined,
  };
}

/** טוקני אזורים לתצוגה בהזמנה (כמו חישוב ההתאמה — איחוד מטרופוליני ומפת יישובים) */
export function orderTransportRegionDisplayTokens(
  pickupCity: string,
  dropCity: string,
  settlementRegionMap: Map<string, string>
): string[] {
  const groups = coalesceMetroRegionGroups(
    buildRegionRuleGroups(pickupCity, dropCity, settlementRegionMap)
  );
  const seen = new Set<string>();
  const out: string[] = [];
  for (const g of groups) {
    for (const token of g) {
      const k = normHe(token);
      if (k.length < 2 || seen.has(k)) continue;
      seen.add(k);
      out.push(token.trim());
    }
  }
  return out;
}
