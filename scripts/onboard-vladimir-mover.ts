/**
 * מריץ קליטת מוביל (מוקד מכירות → זכיה + לקוחות משלמים) עבור ולדימיר רזינץ.
 *
 * דורש: FIREBASE_SERVICE_ACCOUNT_JSON, CRM_TENANTS (או ברירת מחדל יחידה),
 * ו־CRM_DEFAULT_TENANT_ID אם יש כמה טננטים.
 *
 * שימוש:
 *   npx tsx scripts/onboard-vladimir-mover.ts
 */

import { withTenantDatabaseId } from "@/lib/server/tenantDbContext";
import { getDefaultTenantId, resolveTenantById } from "@/lib/tenant/config";
import { processMoverWelcomeItems } from "@/lib/movingOrders/processMoverWelcomeItems";

function defaultTenantDatabaseId(): string {
  const t = resolveTenantById(getDefaultTenantId());
  if (!t?.databaseId?.trim()) {
    throw new Error("לא נמצא טננט ברירת מחדל (CRM_TENANTS / CRM_DEFAULT_TENANT_ID)");
  }
  return t.databaseId.trim();
}

async function main() {
  const databaseId = defaultTenantDatabaseId();
  const item = {
    name: "ולדימיר רזינץ",
    phone: "0526825511",
    email: "Forward.hovalot@gmail.com",
    activity_regions:
      "גוש דן, תל אביב, רמת גן / גבעתיים, שפלה",
    activity_regions_array: ["גוש דן", "תל אביב", "רמת גן / גבעתיים", "שפלה"],
    activity_hours: "08:00-23:59",
    activity_flexible: true,
    immediate_availability: "לא",
    mover_services: "הובלות דירה, הובלות שמצריכות מנוף",
    notes: "אין הערות",
  };

  const out = await withTenantDatabaseId(databaseId, () =>
    processMoverWelcomeItems([item])
  );

  if (!out.ok) {
    console.error("נכשל:", out.error, JSON.stringify(out.results, null, 2));
    process.exit(1);
  }
  console.log("הצלחה:", JSON.stringify(out.results, null, 2));
}

void main();
