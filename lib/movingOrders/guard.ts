import type { Firestore } from "firebase-admin/firestore";
import { getRequestTenantDatabaseId, getAdminDb } from "@/lib/firebase/admin";
import { getTenantByDatabaseId } from "@/lib/tenant/config";
import type { TenantConfig } from "@/lib/tenant/config";
import { isMovingOrdersTenant } from "@/lib/tenant/movingOrders";

export async function assertMovingOrdersWorkspace(): Promise<
  { ok: true; tenant: TenantConfig; db: Firestore } | { ok: false; status: number; error: string }
> {
  let db: Firestore;
  try {
    db = await getAdminDb();
  } catch (e) {
    return {
      ok: false,
      status: 500,
      error: e instanceof Error ? e.message : "DB error",
    };
  }
  const dbId = await getRequestTenantDatabaseId();
  const tenant = getTenantByDatabaseId(dbId);
  if (!tenant) return { ok: false, status: 403, error: "Unknown workspace" };
  if (!isMovingOrdersTenant(tenant.id)) {
    return { ok: false, status: 403, error: "ניהול הזמנות אינו מופעל בעסק הנבחר" };
  }
  return { ok: true, tenant, db };
}
