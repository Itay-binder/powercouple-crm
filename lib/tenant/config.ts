export type TenantConfig = {
  id: string;
  databaseId: string;
  label: string;
  seedDefaultPipeline?: boolean;
  members?: string[];
};

export const TENANT_COOKIE = "crm_tenant";
export const TENANT_DB_HEADER = "x-crm-tenant-database-id";

export function normalizeMemberEmail(email: string): string {
  return email.trim().toLowerCase();
}

export function isTenantMember(email: string | undefined, tenant: TenantConfig): boolean {
  if (!email?.includes("@")) return false;
  const em = normalizeMemberEmail(email);
  return !!tenant.members?.some((m) => normalizeMemberEmail(m) === em);
}

export function getTenantConfigs(): TenantConfig[] {
  const raw = process.env.CRM_TENANTS?.trim();
  if (!raw) {
    const fallbackDb = process.env.FIRESTORE_DATABASE_ID?.trim();
    return [
      {
        id: "default",
        databaseId: fallbackDb && fallbackDb.length > 0 ? fallbackDb : "(default)",
        label: "CRM",
        seedDefaultPipeline: true,
      },
    ];
  }
  try {
    const parsed = JSON.parse(raw) as TenantConfig[];
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

export function getDefaultTenantId(): string {
  const explicit = process.env.CRM_DEFAULT_TENANT_ID?.trim();
  if (explicit) return explicit;
  return getTenantConfigs()[0]?.id ?? "default";
}

export function resolveTenantById(slug: string | undefined | null): TenantConfig | null {
  if (!slug?.trim()) return null;
  const s = slug.trim();
  return getTenantConfigs().find((t) => t.id === s) ?? null;
}

export function getTenantByDatabaseId(databaseId: string): TenantConfig | undefined {
  const norm = databaseId.trim().toLowerCase();
  return getTenantConfigs().find((t) => t.databaseId.trim().toLowerCase() === norm);
}

type MiddlewareRequest = {
  nextUrl: { pathname: string };
  headers: Headers;
  cookies: { get: (name: string) => { value?: string } | undefined };
};

export function resolveMiddlewareDatabaseId(req: MiddlewareRequest): string {
  const pathname = req.nextUrl.pathname;
  const configs = getTenantConfigs();
  const allowHeader =
    pathname.startsWith("/api/ingest") || pathname.startsWith("/api/leads");

  if (allowHeader) {
    const headerDb = req.headers.get(TENANT_DB_HEADER)?.trim();
    if (headerDb && configs.some((c) => c.databaseId.trim() === headerDb)) {
      return headerDb;
    }
    const headerSlug = req.headers.get("x-crm-tenant")?.trim();
    if (headerSlug) {
      const t = resolveTenantById(headerSlug);
      if (t) return t.databaseId.trim();
    }
  }

  const cookieSlug = req.cookies.get(TENANT_COOKIE)?.value;
  const tenant =
    resolveTenantById(cookieSlug) ?? resolveTenantById(getDefaultTenantId());
  if (tenant) return tenant.databaseId.trim();

  const envDb = process.env.FIRESTORE_DATABASE_ID?.trim();
  if (envDb) return envDb;
  return "(default)";
}
