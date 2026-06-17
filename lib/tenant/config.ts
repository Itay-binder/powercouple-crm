export type TenantConfig = {
  id: string;
  databaseId: string;
  label: string;
  seedDefaultPipeline?: boolean;
  members?: string[];
};

export const TENANT_COOKIE = "crm_tenant";
export const TENANT_DB_HEADER = "x-crm-tenant-database-id";

/** Single hardcoded PowerCouple tenant — multi-tenancy is collapsed. */
const POWERCOUPLE_TENANT: TenantConfig = {
  id: "powercouple",
  databaseId: "(default)",
  label: "Power Couple",
  seedDefaultPipeline: true,
};

export function normalizeMemberEmail(email: string): string {
  return email.trim().toLowerCase();
}

export function isTenantMember(email: string | undefined, tenant: TenantConfig): boolean {
  if (!email?.includes("@")) return false;
  const em = normalizeMemberEmail(email);
  return !!tenant.members?.some((m) => normalizeMemberEmail(m) === em);
}

export function getTenantConfigs(): TenantConfig[] {
  return [POWERCOUPLE_TENANT];
}

export function getDefaultTenantId(): string {
  return POWERCOUPLE_TENANT.id;
}

export function resolveTenantById(_slug: string | undefined | null): TenantConfig | null {
  return POWERCOUPLE_TENANT;
}

export function getTenantById(_id: string | undefined | null): TenantConfig {
  return POWERCOUPLE_TENANT;
}

export function getTenantByDatabaseId(_databaseId: string): TenantConfig {
  return POWERCOUPLE_TENANT;
}

type MiddlewareRequest = {
  nextUrl: { pathname: string };
  headers: Headers;
  cookies: { get: (name: string) => { value?: string } | undefined };
};

export function resolveMiddlewareDatabaseId(_req: MiddlewareRequest): string {
  return "(default)";
}
