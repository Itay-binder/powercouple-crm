import { getFirestoreForDatabaseId } from "@/lib/firebase/admin";
import {
  getTenantConfigs,
  isTenantMember,
  type TenantConfig,
} from "@/lib/tenant/config";
import { inviteExists, getUserProfile, isAdminEmail } from "@/lib/auth/profile";

export async function canAccessTenant(
  email: string | undefined,
  uid: string,
  tenant: TenantConfig
): Promise<boolean> {
  if (isAdminEmail(email)) return true;
  if (isTenantMember(email, tenant)) return true;
  const db = getFirestoreForDatabaseId(tenant.databaseId);
  if (await inviteExists(email, db)) return true;
  const profile = await getUserProfile(uid, email, db);
  return profile != null;
}

export async function listAccessibleTenants(
  email: string | undefined,
  uid: string
): Promise<TenantConfig[]> {
  const out: TenantConfig[] = [];
  for (const t of getTenantConfigs()) {
    if (await canAccessTenant(email, uid, t)) {
      out.push(t);
    }
  }
  return out;
}
