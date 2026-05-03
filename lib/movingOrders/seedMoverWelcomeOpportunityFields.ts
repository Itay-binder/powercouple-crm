import { upsertCustomField } from "@/lib/customFields/repo";
import { PAYING_CUSTOMERS_PIPELINE_ID } from "@/lib/movingOrders/fieldIds";

const PIPE = [PAYING_CUSTOMERS_PIPELINE_ID];

/**
 * שדות מותאמים להזדמנות בפייפליין לקוחות משלמים — תואמים לוובהוק שאלון הצטרפות מוביל.
 */
export async function seedMoverWelcomeOpportunityFields(): Promise<{ fieldIds: string[] }> {
  const defs: Array<{
    fieldId: string;
    label: string;
    type: "boolean" | "text" | "phone" | "email" | "number";
  }> = [
    {
      fieldId: "mover_welcome_activity_days_text",
      label: "הצטרפות מוביל — ימי פעילות טקסט (activity_days_text)",
      type: "text",
    },
    {
      fieldId: "mover_welcome_activity_days_json",
      label: "הצטרפות מוביל — ימי פעילות מערך (activity_days_array)",
      type: "text",
    },
    { fieldId: "mover_welcome_activity_start", label: "הצטרפות מוביל — שעת התחלה (activity_start)", type: "text" },
    { fieldId: "mover_welcome_activity_end", label: "הצטרפות מוביל — שעת סיום (activity_end)", type: "text" },
    {
      fieldId: "mover_welcome_activity_regions",
      label: "הצטרפות מוביל — אזורי פעילות (activity_regions)",
      type: "text",
    },
    {
      fieldId: "mover_welcome_activity_regions_json",
      label: "הצטרפות מוביל — אזורי פעילות מערך (activity_regions_array)",
      type: "text",
    },
    {
      fieldId: "mover_welcome_activity_flexible",
      label: "הצטרפות מוביל — שעות גמישות (activity_flexible)",
      type: "boolean",
    },
    { fieldId: "mover_welcome_activity_hours", label: "הצטרפות מוביל — שעות פעילות (activity_hours)", type: "text" },
    {
      fieldId: "mover_welcome_immediate_availability",
      label: "הצטרפות מוביל — זמינות מיידית (immediate_availability)",
      type: "text",
    },
    {
      fieldId: "opportunity_leads_count",
      label: "מספר פניות (לידים) — התאמת הזמנות",
      type: "number",
    },
    {
      fieldId: "package_current_leads_count",
      label: "כמות לידים בחבילה נוכחית",
      type: "number",
    },
    {
      fieldId: "work_availability_status",
      label: "זמינות לקבל לידים (work_availability_status / available_for_leads)",
      type: "text",
    },
    { fieldId: "mover_welcome_full_name", label: "הצטרפות מוביל — שם מלא (name)", type: "text" },
    { fieldId: "mover_welcome_phone", label: "הצטרפות מוביל — טלפון (phone)", type: "phone" },
    { fieldId: "mover_welcome_email", label: "הצטרפות מוביל — אימייל (email)", type: "email" },
    { fieldId: "mover_welcome_mover_services", label: "הצטרפות מוביל — שירותים (mover_services)", type: "text" },
    { fieldId: "mover_welcome_notes", label: "הצטרפות מוביל — הערות (notes)", type: "text" },
  ];

  const fieldIds: string[] = [];
  for (const def of defs) {
    const r = await upsertCustomField({
      fieldId: def.fieldId,
      entityType: "opportunity",
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
