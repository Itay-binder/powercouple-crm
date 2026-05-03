import type { MovingOrderPayload } from "@/lib/movingOrders/types";

const KEYS: (keyof MovingOrderPayload)[] = [
  "order_id",
  "moving_timing",
  "move_type",
  "pickup",
  "dropoff",
  "pickup_city",
  "dropoff_city",
  "day_order",
  "date",
  "is_urgent",
  "crane_info",
  "needs_crane",
  "name",
  "phone",
  "notes",
  "what_moving",
  "utm_source",
  "utm_medium",
  "utm_campaign",
  "utm_content",
  "event_id",
  "fbp",
  "fbc",
  "fbclid",
  "pickup_type",
  "pickup_floor",
  "pickup_access",
  "drop_type",
  "drop_floor",
  "drop_access",
  "items_text",
  "cartons",
  "drive_folder_url",
  "drive_folder_id",
  "drive_folder_name",
];

const KNOWN_PAYLOAD_KEYS = new Set<string>([...KEYS, "items_list", "drive_files_count"]);
const DYNAMIC_KEY_ALIASES: Record<string, string> = {
  apartment_rooms: "rooms",
};

function pickStr(body: Record<string, unknown>, ...keys: string[]): string | undefined {
  for (const k of keys) {
    const v = body[k];
    if (typeof v === "string" && v.trim()) return v.trim();
  }
  return undefined;
}

function pickNonEmpty(body: Record<string, unknown>, ...keys: string[]): unknown {
  for (const k of keys) {
    const v = body[k];
    if (!isEffectivelyEmpty(v)) return v;
  }
  return undefined;
}

function isEffectivelyEmpty(v: unknown): boolean {
  if (v === undefined || v === null) return true;
  if (typeof v === "string" && !v.trim()) return true;
  return false;
}

function normalizeDynamicFieldIdPart(raw: string): string {
  const key = raw.trim().toLowerCase().replace(/\s+/g, "_").replace(/[^a-z0-9_]/g, "");
  if (!key) return "";
  return DYNAMIC_KEY_ALIASES[key] ?? key;
}

function serializeForCustomValue(v: unknown): unknown {
  return typeof v === "object" ? JSON.stringify(v) : v;
}

/**
 * מילוי שדות הפיילואד הקצרים (name, pickup…) מ־moving_order_* כשזה מה שנשלח מ-Make בלבד.
 * בלי זה rawCustomValuesFromPayload לא יוצר moving_order_* ב-customValues.
 */
function hydratePayloadFromMovingOrderKeys(
  body: Record<string, unknown>,
  payload: MovingOrderPayload
): MovingOrderPayload {
  const p = { ...payload } as Record<string, unknown>;
  for (const k of KEYS) {
    const short = String(k);
    if (isEffectivelyEmpty(p[short])) {
      const pref = `moving_order_${short}`;
      const fromPref = body[pref];
      if (!isEffectivelyEmpty(fromPref)) {
        p[short] = fromPref;
      }
    }
  }
  if (isEffectivelyEmpty(p.items_list)) {
    const il = body.moving_order_items_list;
    if (typeof il === "string" && il.trim()) p.items_list = il.trim();
  }
  if (p.drive_files_count === undefined || !Number.isFinite(Number(p.drive_files_count))) {
    const d = body.moving_order_drive_files_count;
    if (d !== undefined && d !== null) {
      const n = typeof d === "number" ? d : Number.parseInt(String(d), 10);
      if (Number.isFinite(n)) p.drive_files_count = n;
    }
  }
  return p as MovingOrderPayload;
}

/** נרמול גוף webhook: items_list כמערך → מחרוזת JSON בשדה items_list בפיילואד */
export function normalizePayloadForStorage(body: Record<string, unknown>): MovingOrderPayload {
  const rawItems = body.items_list ?? body.moving_order_items_list;
  let items_list: string | undefined;
  if (Array.isArray(rawItems)) {
    items_list = JSON.stringify(rawItems);
  } else if (typeof rawItems === "string") {
    items_list = rawItems;
  }

  const driveCount = body.drive_files_count ?? body.moving_order_drive_files_count;
  const drive_files_count =
    typeof driveCount === "number"
      ? driveCount
      : typeof driveCount === "string"
        ? Number.parseInt(driveCount, 10)
        : undefined;

  const base = body as unknown as MovingOrderPayload;
  const pickup_city = pickStr(body, "pickup_city", "moving_order_pickup_city") ?? base.pickup_city;
  const dropoff_city = pickStr(body, "dropoff_city", "moving_order_dropoff_city") ?? base.dropoff_city;
  const day_order = pickStr(body, "day_order", "moving_order_day_order") ?? base.day_order;
  const merged: MovingOrderPayload = {
    ...base,
    ...(items_list !== undefined ? { items_list } : {}),
    ...(Number.isFinite(drive_files_count) ? { drive_files_count } : {}),
    ...(pickup_city ? { pickup_city } : {}),
    ...(dropoff_city ? { dropoff_city } : {}),
    ...(day_order ? { day_order } : {}),
  };
  const out = { ...merged } as Record<string, unknown>;
  // Backward compatibility: external forms that still send apartment_rooms.
  const roomsValue = pickNonEmpty(body, "moving_order_rooms", "rooms", "apartment_rooms");
  if (!isEffectivelyEmpty(roomsValue) && isEffectivelyEmpty(out.moving_order_rooms)) {
    out.moving_order_rooms = roomsValue;
  }
  return hydratePayloadFromMovingOrderKeys(body, out as MovingOrderPayload);
}

export function rawCustomValuesFromPayload(payload: MovingOrderPayload): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  for (const k of KEYS) {
    const v = payload[k];
    if (v === undefined || v === null) continue;
    out[`moving_order_${k}`] = serializeForCustomValue(v);
  }
  if (payload.items_list !== undefined && payload.items_list !== "") {
    out.moving_order_items_list =
      typeof payload.items_list === "string"
        ? payload.items_list
        : JSON.stringify(payload.items_list);
  }
  if (typeof payload.drive_files_count === "number" && Number.isFinite(payload.drive_files_count)) {
    out.moving_order_drive_files_count = payload.drive_files_count;
  }

  const payloadObj = payload as unknown as Record<string, unknown>;
  for (const [key, value] of Object.entries(payloadObj)) {
    if (isEffectivelyEmpty(value)) continue;
    if (key.startsWith("moving_order_")) {
      out[key] = serializeForCustomValue(value);
      continue;
    }
    if (KNOWN_PAYLOAD_KEYS.has(key)) continue;
    const normalized = normalizeDynamicFieldIdPart(key);
    if (!normalized) continue;
    const customKey = `moving_order_${normalized}`;
    if (Object.prototype.hasOwnProperty.call(out, customKey)) continue;
    out[customKey] = serializeForCustomValue(value);
  }

  return out;
}
