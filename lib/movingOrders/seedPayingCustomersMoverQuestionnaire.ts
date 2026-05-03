import { ensureCustomersPipeline } from "@/lib/opportunities/repo";
import { seedMoverCustomFields } from "@/lib/movingOrders/seedMoverFields";
import { seedMoverWelcomeOpportunityFields } from "@/lib/movingOrders/seedMoverWelcomeOpportunityFields";

/**
 * יוצר את פייפליין לקוחות משלמים אם חסר, ואז מזריע את כל שדות המוביל והשאלון
 * (איש קשר + הזדמנות) המוגבלים לפייפליין `customers`.
 */
export async function seedPayingCustomersMoverQuestionnaireFields(): Promise<{
  contactFieldIds: string[];
  opportunityFieldIds: string[];
  fieldIds: string[];
}> {
  await ensureCustomersPipeline();
  const contact = await seedMoverCustomFields();
  const opportunity = await seedMoverWelcomeOpportunityFields();
  return {
    contactFieldIds: contact.fieldIds,
    opportunityFieldIds: opportunity.fieldIds,
    fieldIds: [...contact.fieldIds, ...opportunity.fieldIds],
  };
}
