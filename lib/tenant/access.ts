import { getTenantConfigs, type TenantConfig } from "@/lib/tenant/config";

/**
 * Single-tenant: any authenticated user can access the one PowerCouple tenant.
 * Approval / invite gating is enforced separately in lib/auth/profile.ts.
 */
export async function canAccessTenant(
  _email: string | undefined,
  _uid: string,
  _tenant: TenantConfig
): Promise<boolean> {
  return true;
}

export async function listAccessibleTenants(
  _email: string | undefined,
  _uid: string
): Promise<TenantConfig[]> {
  return getTenantConfigs();
}
