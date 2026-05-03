import type { MovingOrderPayload } from "@/lib/movingOrders/types";

export type OrderCapabilityFlags = {
  needsApartment: boolean;
  needsSmall: boolean;
  needsLarge: boolean;
  needsCrane: boolean;
  needsSameDay: boolean;
};

export function deriveOrderCapabilities(order: MovingOrderPayload): OrderCapabilityFlags {
  const mt = order.move_type ?? "";
  const il = order.items_list ?? "";
  const combined = `${mt} ${il}`;
  const iu = order.is_urgent ?? "";
  const nc = String(order.needs_crane ?? "").trim();
  const ci = order.crane_info ?? "";

  const needsApartment = /דירה/.test(mt);
  const smallMoveHint =
    /הובל[הת]\s*קטנ|הובלה\s*קטנה|בקטנה|קטנה(?!\s*דיר)/i.test(combined) ||
    /קטנ|קטנה|מיני|פריטים|קרטונים/i.test(combined);
  const needsSmall = smallMoveHint;
  const needsLarge = smallMoveHint
    ? /דירה|משרד|פנט|גדול/i.test(mt) || needsApartment
    : /דירה|משרד|פנט|גדול/i.test(combined) || needsApartment;
  const needsCrane =
    /^(כן|yes|true|1)$/i.test(nc) || /צריך|נדרש|כן/.test(ci) || /כן/.test(nc);
  const needsSameDay = /דחוף|מיידי|sos|היום|מהיום|היום ל/i.test(`${iu} ${mt}`);

  return {
    needsApartment,
    needsSmall,
    needsLarge,
    needsCrane,
    needsSameDay,
  };
}
