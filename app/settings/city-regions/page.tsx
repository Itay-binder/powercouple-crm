import { getCrmSession } from "@/lib/auth/crmSession";
import { authDisabled } from "@/lib/auth/session";
import CrmShell from "@/app/components/CrmShell";
import CityRegionsClient from "@/app/settings/city-regions/CityRegionsClient";
import { isMovingOrdersTenant } from "@/lib/tenant/movingOrders";
import { redirect } from "next/navigation";

export const dynamic = "force-dynamic";

export default async function CityRegionsSettingsPage() {
  if (authDisabled()) redirect("/login");
  const ctx = await getCrmSession();
  if (ctx.kind === "anon") redirect("/login?returnTo=/settings/city-regions");
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
  if (!isMovingOrdersTenant(ctx.tenant.id)) {
    redirect("/settings/fields");
  }

  return (
    <CrmShell
      email={ctx.profile.email}
      tenants={ctx.accessibleTenants.map((t) => ({ id: t.id, label: t.label }))}
      currentTenantId={ctx.tenant.id}
    >
      <CityRegionsClient />
    </CrmShell>
  );
}
