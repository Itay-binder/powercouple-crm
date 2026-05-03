import { deriveOrderCapabilities } from "@/lib/movingOrders/orderCapabilityDerive";
import type { MovingOrderPayload } from "@/lib/movingOrders/types";

/** פיילואד לאחר השלמת שדות שמקורם ב־customValues (Make לעיתים שולח רק moving_order_*) */
export function orderPayloadForMoveKind(
  payload: MovingOrderPayload,
  cv: Record<string, unknown> | undefined
): MovingOrderPayload {
  if (!cv) return payload;
  const out: MovingOrderPayload = { ...payload };
  const mtCv = cv.moving_order_move_type;
  if (typeof mtCv === "string" && mtCv.trim() && !(out.move_type ?? "").trim()) {
    out.move_type = mtCv.trim();
  }
  const ilCv = cv.moving_order_items_list;
  if (typeof ilCv === "string" && ilCv.trim() && !(out.items_list ?? "").trim()) {
    out.items_list = ilCv.trim();
  }
  const uCv = cv.moving_order_is_urgent;
  if (uCv !== undefined && uCv !== null && String(uCv).trim() && !(out.is_urgent ?? "").trim()) {
    out.is_urgent = String(uCv);
  }
  return out;
}

/** סיווג סוג הובלה — זהה ללוגיקת ההתאמה (לתצוגה ולמנוע divergence) */
export function resolveOrderMoveKind(
  payload: MovingOrderPayload,
  cv: Record<string, unknown> | undefined
): "small" | "large" | "unknown" {
  const eff = orderPayloadForMoveKind(payload, cv);
  const mt = String(cv?.moving_order_move_type ?? eff.move_type ?? "").trim();
  if (/הובל[הת]\s*קטנ|הובלה\s*קטנה|בקטנה|קטנה(?!\s*דיר)/i.test(mt)) return "small";
  if (/הובל[הת]\s*דיר|הובלת\s*דירה|הובלה\s*דירתית|גדולה/i.test(mt)) return "large";
  const caps = deriveOrderCapabilities(eff);
  if (caps.needsSmall && !caps.needsApartment) return "small";
  if (caps.needsApartment || caps.needsLarge) return "large";
  return "unknown";
}
