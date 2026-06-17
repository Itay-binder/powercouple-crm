import { upsertCustomField } from "@/lib/customFields/repo";
import { PAYING_CUSTOMERS_PIPELINE_ID } from "@/lib/movingOrders/fieldIds";

const PIPE = [PAYING_CUSTOMERS_PIPELINE_ID];

/**
 * שדות מותאמים להזדמנות בפייפליין לקוחות משלמים — התאמת הזמנות ולידים בלבד.
 * שדות שאלון וולקאם מוביל (`opportunity_mover_welcome_*`) לא נזרעים כאן.
 */
export async function seedMoverWelcomeOpportunityFields(): Promise<{ fieldIds: string[] }> {
  const defs: Array<{
    fieldId: string;
    label: string;
    type: "boolean" | "text" | "phone" | "email" | "number";
  }> = [
    {
      fieldId: "opportunity_leads_count",
      label: "מספר פניות (לידים) — התאמת הזמנות",
      type: "number",
    },
    {
      fieldId: "opportunity_daily_leads_count",
      label: "כמות לידים יומית — התאמת הזמנות",
      type: "number",
    },
    {
      fieldId: "package_current_leads_count",
      label: "כמות לידים שרכש (חבילה נוכחית)",
      type: "number",
    },
    {
      fieldId: "package_current_leads_count_sent",
      label: "כמות לידים חבילה נוכחית (נשלחו)",
      type: "number",
    },
    {
      fieldId: "work_availability_status",
      label: "זמינות לקבל לידים (work_availability_status / available_for_leads)",
      type: "text",
    },
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
