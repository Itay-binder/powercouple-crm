import { getCrmSession } from "@/lib/auth/crmSession";
import { authDisabled } from "@/lib/auth/session";
import { headers } from "next/headers";
import { redirect } from "next/navigation";
import CrmShell from "@/app/components/CrmShell";
import ApiKeysClient from "@/app/settings/api/ApiKeysClient";
import { isMovingOrdersTenant } from "@/lib/tenant/movingOrders";

export const dynamic = "force-dynamic";

async function resolveBaseUrl(): Promise<string> {
  const h = await headers();
  const host = (h.get("x-forwarded-host") ?? h.get("host") ?? "")
    .split(",")[0]
    ?.trim();
  const proto = (h.get("x-forwarded-proto") ?? "https").split(",")[0]?.trim() || "https";
  if (host) return `${proto}://${host}`;
  const vercel = process.env.VERCEL_URL?.trim();
  if (vercel) return `https://${vercel}`;
  return "";
}

export default async function SettingsApiPage() {
  if (authDisabled()) redirect("/login");
  const ctx = await getCrmSession();
  if (ctx.kind === "anon") redirect("/login?returnTo=/settings/api");
  if (ctx.kind === "forbidden") {
    return (
      <CrmShell
        email={ctx.email ?? null}
        tenants={ctx.accessibleTenants.map((t) => ({ id: t.id, label: t.label }))}
        currentTenantId={null}
        tenantForbidden
      >
        <div />
      </CrmShell>
    );
  }

  const baseUrl = await resolveBaseUrl();

  return (
    <CrmShell
      email={ctx.profile.email}
      tenants={ctx.accessibleTenants.map((t) => ({ id: t.id, label: t.label }))}
      currentTenantId={ctx.tenant.id}
    >
      <ApiKeysClient
        baseUrl={baseUrl}
        tenantLabel={ctx.tenant.label}
        tenantDatabaseId={ctx.tenant.databaseId}
        multiTenant={ctx.accessibleTenants.length > 1}
        showMovingOrders={isMovingOrdersTenant(ctx.tenant.id)}
      />
    </CrmShell>
  );
}
