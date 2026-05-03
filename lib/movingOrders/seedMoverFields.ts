import { upsertCustomField } from "@/lib/customFields/repo";
import { PAYING_CUSTOMERS_PIPELINE_ID } from "@/lib/movingOrders/fieldIds";

const PIPE = [PAYING_CUSTOMERS_PIPELINE_ID];

/**
 * יוצר/מעדכן שדות מותאמים למובילים תחת פייפליין לקוחות משלמים.
 */
export async function seedMoverCustomFields(): Promise<{ fieldIds: string[] }> {
  const defs: Array<{
    fieldId: string;
    label: string;
    type: "boolean" | "text";
  }> = [
    { fieldId: "mover_is_mover", label: "מוביל — משתתף בהתאמת הזמנות ללקוחות משלמים", type: "boolean" },
    { fieldId: "mover_regions", label: "מוביל — אזורי פעילות (מופרדים בפסיקים, כמו בשאלון)", type: "text" },
    { fieldId: "mover_nationwide", label: "מוביל — עובד בכל הארץ (מחושב מאזורים)", type: "boolean" },
    { fieldId: "mover_days", label: "מוביל — ימי פעילות (כמו activity_days בשאלון)", type: "text" },
    { fieldId: "mover_hour_start", label: "מוביל — שעת פעילות התחלה (activity_start)", type: "text" },
    { fieldId: "mover_hour_end", label: "מוביל — שעת פעילות סיום (activity_end)", type: "text" },
    { fieldId: "mover_flexible_hours", label: "מוביל — שעות גמישות (activity_flexible)", type: "boolean" },
    { fieldId: "mover_same_day", label: "מוביל — זמינות מיידית (מתוך immediate_availability)", type: "boolean" },
    { fieldId: "mover_crane", label: "מוביל — עובד עם מנוף (מ־mover_services)", type: "boolean" },
    { fieldId: "mover_large", label: "מוביל — הובלה גדולה (מ־mover_services)", type: "boolean" },
    { fieldId: "mover_small", label: "מוביל — הובלה קטנה (מ־mover_services)", type: "boolean" },
    { fieldId: "mover_apartment", label: "מוביל — הובלת דירה (מ־mover_services)", type: "boolean" },
  ];

  const fieldIds: string[] = [];
  for (const def of defs) {
    const r = await upsertCustomField({
      fieldId: def.fieldId,
      entityType: "contact",
      label: def.label,
      type: def.type,
      pipelineIds: PIPE,
      isRequired: false,
      isActive: true,
    });
    fieldIds.push(r.fieldId);
  }
  return { fieldIds };
}
