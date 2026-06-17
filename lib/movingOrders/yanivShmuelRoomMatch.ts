import type { OpportunityRecord } from "@/lib/opportunities/repo";
import { appendOpportunityNote, getOpportunityById } from "@/lib/opportunities/repo";
import type { MovingOrderPayload } from "@/lib/movingOrders/types";
import { normHe } from "@/lib/movingOrders/moverFieldReaders";

/** מופיע בעמודת «הערות התאמה» כשהזמנה היא הובלת דירה עם יותר מ־3 חדרים */
export const YANIV_SHMUEL_ROOM_PARTIAL_MATCH_ISSUE_HE = "הובלת דירה עד 3 חדרים";

const NOTE_ORDER_MARKER_PREFIX = "[התאמת-הזמנות-יניב-חדרים:";

function yanivContactIdsFromEnv(): string[] {
  const raw = process.env.CRM_YANIV_SHMUEL_CONTACT_IDS?.trim();
  if (!raw) return [];
  return Array.from(new Set(raw.split(/[\s,]+/).map((s) => s.trim()).filter(Boolean)));
}

/**
 * זיהוי הזדמנות יניב שמואל בפייפליין לקוחות משלמים:
 * מזהי contact (אופציונלי) מ־CRM_YANIV_SHMUEL_CONTACT_IDS, או שם + איש קשר שמכילים «יניב» ו«שמואל».
 */
export function isYanivShmuelPayingMover(opp: OpportunityRecord | undefined, contactId: string): boolean {
  if (!opp) return false;
  const envIds = yanivContactIdsFromEnv();
  if (envIds.length && envIds.includes(contactId.trim())) return true;
  const blob = [opp.name, opp.contactName].filter(Boolean).join(" ");
  const n = normHe(blob);
  return n.includes(normHe("יניב")) && n.includes(normHe("שמואל"));
}

/**
 * מספר חדרים מהזמנה — רק כשאפשר לפרש בבירור (למשל 4, 3+1, "4.5").
 */
export function parseOrderApartmentRoomCount(
  cv: Record<string, unknown> | undefined,
  _payload: MovingOrderPayload
): number | null {
  const raw =
    cv?.moving_order_rooms ??
    cv?.apartment_rooms ??
    (typeof cv?.rooms !== "undefined" ? cv.rooms : undefined);
  const s = raw === undefined || raw === null ? "" : String(raw).trim();
  if (!s) return null;
  const normalized = s.replace(/,/g, ".").replace(/\s+/g, "");
  const plus = normalized.match(/^(\d+)\+(\d+)$/);
  if (plus) {
    const a = Number(plus[1]);
    const b = Number(plus[2]);
    if (Number.isFinite(a) && Number.isFinite(b)) return a + b;
  }
  const m = normalized.match(/(\d+(?:\.\d+)?)/);
  if (!m) return null;
  const n = Number(m[1]);
  return Number.isFinite(n) ? n : null;
}

/**
 * פתק אוטומטי על הזדמנות המוביל — פעם אחת לכל צמד (הזמנה, הזדמנות).
 */
export async function appendYanivShmuelRoomMismatchOpportunityNoteIfNeeded(input: {
  opportunityId: string;
  orderFirestoreDocId: string;
  humanOrderId: string;
  rooms: number;
}): Promise<void> {
  const marker = `${NOTE_ORDER_MARKER_PREFIX}${input.orderFirestoreDocId}]`;
  const opp = await getOpportunityById(input.opportunityId);
  if (!opp) return;
  const notes = opp.notes ?? [];
  if (notes.some((n) => typeof n.text === "string" && n.text.includes(marker))) return;

  const text =
    `${marker} התאמה חלקית — ${YANIV_SHMUEL_ROOM_PARTIAL_MATCH_ISSUE_HE}. ` +
    `הזמנה ${input.humanOrderId}: ${input.rooms} חדרים (מעל 3).`;

  await appendOpportunityNote(input.opportunityId, {
    text,
    createdBy: "מערכת · התאמת הזמנות",
  });
}
