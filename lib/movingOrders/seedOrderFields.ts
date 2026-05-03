import type { CustomFieldType } from "@/lib/customFields/repo";
import { upsertCustomField } from "@/lib/customFields/repo";
import { MOVING_ORDERS_INTAKE_PIPELINE_ID } from "@/lib/movingOrders/pipelineConstants";

type SeedSpec = { key: string; label: string; type: CustomFieldType };

const PIPE = [MOVING_ORDERS_INTAKE_PIPELINE_ID];

const SPECS: SeedSpec[] = [
  { key: "order_id", label: "מזהה הזמנה", type: "text" },
  { key: "moving_timing", label: "למתי ההובלה", type: "text" },
  { key: "move_type", label: "סוג הובלה", type: "text" },
  { key: "pickup", label: "כתובת איסוף", type: "text" },
  { key: "dropoff", label: "כתובת פריקה", type: "text" },
  { key: "pickup_city", label: "עיר איסוף", type: "text" },
  { key: "dropoff_city", label: "עיר פריקה", type: "text" },
  { key: "day_order", label: "יום הובלה (א׳–ש׳)", type: "text" },
  { key: "date", label: "תאריך הובלה", type: "date" },
  { key: "is_urgent", label: "דחיפות", type: "text" },
  { key: "crane_info", label: "פרטי מנוף", type: "text" },
  { key: "needs_crane", label: "צורך במנוף", type: "text" },
  { key: "name", label: "שם מזמין", type: "text" },
  { key: "phone", label: "טלפון מזמין", type: "phone" },
  { key: "notes", label: "הערות", type: "text" },
  { key: "what_moving", label: "מה מובילים", type: "text" },
  { key: "utm_source", label: "utm_source", type: "text" },
  { key: "utm_medium", label: "utm_medium", type: "text" },
  { key: "utm_campaign", label: "utm_campaign", type: "text" },
  { key: "utm_content", label: "utm_content", type: "text" },
  { key: "event_id", label: "מזהה אירוע", type: "text" },
  { key: "fbp", label: "fbp", type: "text" },
  { key: "fbc", label: "fbc", type: "text" },
  { key: "fbclid", label: "fbclid", type: "text" },
  { key: "pickup_type", label: "סוג מבנה — איסוף", type: "text" },
  { key: "pickup_floor", label: "קומה — איסוף", type: "text" },
  { key: "pickup_access", label: "נגישות — איסוף", type: "text" },
  { key: "drop_type", label: "סוג מבנה — פריקה", type: "text" },
  { key: "drop_floor", label: "קומה — פריקה", type: "text" },
  { key: "drop_access", label: "נגישות — פריקה", type: "text" },
  { key: "items_list", label: "רשימת פריטים (JSON)", type: "text" },
  { key: "items_text", label: "פריטים (טקסט)", type: "text" },
  { key: "cartons", label: "קרטונים", type: "text" },
  { key: "drive_folder_url", label: "קישור לתיקיית Drive", type: "text" },
  { key: "drive_folder_id", label: "מזהה תיקיית Drive", type: "text" },
  { key: "drive_folder_name", label: "שם תיקיית Drive", type: "text" },
  { key: "drive_files_count", label: "מספר קבצים ב-Drive", type: "number" },
];

export async function seedMovingOrderCustomFields(): Promise<string[]> {
  const ids: string[] = [];
  for (const s of SPECS) {
    const row = await upsertCustomField({
      entityType: "moving_order",
      fieldId: s.key,
      label: s.label,
      type: s.type,
      pipelineIds: PIPE,
      isRequired: false,
      isActive: true,
    });
    ids.push(row.fieldId);
  }
  return ids;
}
