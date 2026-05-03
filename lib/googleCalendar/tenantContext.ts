import { getRequestTenantDatabaseId } from "@/lib/firebase/admin";
import { getTenantByDatabaseId } from "@/lib/tenant/config";

export async function getCurrentTenantIdOrThrow(): Promise<string> {
  const dbId = await getRequestTenantDatabaseId();
  const t = getTenantByDatabaseId(dbId);
  if (!t) throw new Error("Unknown workspace");
  return t.id;
}
