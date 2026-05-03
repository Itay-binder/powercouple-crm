import type { Firestore } from "firebase-admin/firestore";
import { getLeadById } from "@/lib/leads/repo";
import { listOpportunities } from "@/lib/opportunities/repo";
import { PAYING_CUSTOMERS_PIPELINE_ID } from "@/lib/movingOrders/fieldIds";
import {
  buildMatchWebhookMovers,
  customerFacingMoversMessageText,
  flatMatchSendOpportunityFields,
  type MatchWebhookMover,
} from "@/lib/movingOrders/matchOrderActions";
import { opportunitiesByContactId } from "@/lib/movingOrders/matchMovers";
import type { MovingOrderRecord } from "@/lib/movingOrders/types";
import { displayPhoneIsraeliLocal } from "@/lib/phoneIsraeliDisplay";
import { postWebhookForEvent } from "@/lib/webhooks/dispatchServerWebhooks";

export type MatchSendWebhookPayload = {
  movingOrderId: string;
  orderId: string;
  order: {
    payload: MovingOrderRecord["payload"];
    customValues: Record<string, unknown>;
  };
  /** תיקיית Drive של ההזמנה — גם ברמה העליונה (בנוסף ל־order.payload) לנוחות Make/Zapier */
  drive_folder_url: string;
  drive_folder_id: string;
  drive_folder_name: string;
  drive_files_count: number | null;
  movers: MatchWebhookMover[];
  customer_message_text: string;
  "הודעת טקסט למזמין": string;
  "שליחת הודעה למזמין": "כן" | "לא";
} & Record<string, unknown>;

function pickTrimmedStr(...candidates: unknown[]): string {
  for (const v of candidates) {
    if (typeof v === "string" && v.trim()) return v.trim();
  }
  return "";
}

/** שדות Drive מהפיילואד או מ־customValues (moving_order_*), לשילוב בוובהוק אחרי התאמה */
function orderDriveFolderForWebhook(order: MovingOrderRecord): {
  drive_folder_url: string;
  drive_folder_id: string;
  drive_folder_name: string;
  drive_files_count: number | null;
} {
  const p = order.payload ?? {};
  const cv = order.customValues ?? {};
  const url = pickTrimmedStr(
    p.drive_folder_url,
    cv.moving_order_drive_folder_url,
    cv.drive_folder_url
  );
  const id = pickTrimmedStr(p.drive_folder_id, cv.moving_order_drive_folder_id, cv.drive_folder_id);
  const name = pickTrimmedStr(
    p.drive_folder_name,
    cv.moving_order_drive_folder_name,
    cv.drive_folder_name
  );
  let drive_files_count: number | null = null;
  if (typeof p.drive_files_count === "number" && Number.isFinite(p.drive_files_count)) {
    drive_files_count = p.drive_files_count;
  } else {
    const raw = cv.moving_order_drive_files_count ?? cv.drive_files_count;
    if (typeof raw === "number" && Number.isFinite(raw)) drive_files_count = raw;
    else if (typeof raw === "string" && raw.trim()) {
      const n = Number.parseInt(raw.trim(), 10);
      if (Number.isFinite(n)) drive_files_count = n;
    }
  }
  return { drive_folder_url: url, drive_folder_id: id, drive_folder_name: name, drive_files_count };
}

function moversWithIsraeliPhoneDisplay(movers: MatchWebhookMover[]): MatchWebhookMover[] {
  return movers.map((m) => ({
    ...m,
    lead: {
      ...m.lead,
      phone: m.lead.phone ? displayPhoneIsraeliLocal(m.lead.phone) : m.lead.phone,
    },
    opportunity: m.opportunity
      ? {
          ...m.opportunity,
          phone: m.opportunity.phone ? displayPhoneIsraeliLocal(m.opportunity.phone) : m.opportunity.phone,
        }
      : null,
  }));
}

/**
 * אותו אירוע וובהוק כמו שליחת הזמנה מלאה — עם רשימת מובילים נתונה וערך לשדה שליחת הודעה למזמין.
 */
export async function postMatchSendWebhookForDrivers(
  db: Firestore,
  order: MovingOrderRecord,
  driverIds: string[],
  notifyCustomer: boolean
): Promise<boolean> {
  const payload = await buildMatchSendWebhookPayloadForDrivers(order, driverIds, notifyCustomer);
  if (!payload) return false;
  return postWebhookForEvent(db, "moving_order_match_send", payload);
}

export async function buildMatchSendWebhookPayloadForDrivers(
  order: MovingOrderRecord,
  driverIds: string[],
  notifyCustomer: boolean
): Promise<MatchSendWebhookPayload | null> {
  if (driverIds.length === 0) return null;

  const leadById = new Map<string, NonNullable<Awaited<ReturnType<typeof getLeadById>>>>();
  await Promise.all(
    driverIds.map(async (did) => {
      const lead = await getLeadById(did);
      if (lead) leadById.set(did, lead);
    })
  );

  const opps = await listOpportunities(PAYING_CUSTOMERS_PIPELINE_ID);
  const oppByContact = opportunitiesByContactId(
    opps.filter((o) => (o.pipelineId ?? "").trim() === PAYING_CUSTOMERS_PIPELINE_ID)
  );

  const moversRaw = await buildMatchWebhookMovers(driverIds, order.driverMatchFlags, leadById, oppByContact);
  if (moversRaw.length === 0) return null;

  const movers = moversWithIsraeliPhoneDisplay(moversRaw);
  const textForCustomer = customerFacingMoversMessageText(movers);
  const notifyCustomerWebhook = notifyCustomer ? "כן" : "לא";
  const drive = orderDriveFolderForWebhook(order);

  return {
    movingOrderId: order.id,
    orderId: order.orderId,
    order: {
      payload: order.payload,
      customValues: order.customValues ?? {},
    },
    ...drive,
    "קישור תיקיית דרייב": drive.drive_folder_url,
    "מזהה תיקיית דרייב": drive.drive_folder_id,
    "שם תיקיית דרייב": drive.drive_folder_name,
    ...(drive.drive_files_count !== null ? { "מספר קבצים בתיקיית דרייב": drive.drive_files_count } : {}),
    movers,
    customer_message_text: textForCustomer,
    "הודעת טקסט למזמין": textForCustomer,
    "שליחת הודעה למזמין": notifyCustomerWebhook,
    ...flatMatchSendOpportunityFields(movers),
  };
}
