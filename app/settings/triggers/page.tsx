import { redirect } from "next/navigation";
import CrmShell from "@/app/components/CrmShell";
import SettingsSectionNav from "@/app/components/SettingsSectionNav";
import { getCrmSession } from "@/lib/auth/crmSession";
import { authDisabled } from "@/lib/auth/session";
import TriggersClient from "@/app/settings/triggers/TriggersClient";
import { isMovingOrdersTenant } from "@/lib/tenant/movingOrders";

export const dynamic = "force-dynamic";

export default async function TriggersSettingsPage() {
  if (authDisabled()) redirect("/login");
  const ctx = await getCrmSession();
  if (ctx.kind === "anon") redirect("/login?returnTo=/settings/triggers");
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

  return (
    <CrmShell
      email={ctx.profile.email}
      tenants={ctx.accessibleTenants.map((t) => ({ id: t.id, label: t.label }))}
      currentTenantId={ctx.tenant.id}
    >
      <SettingsSectionNav active="triggers" showMovingOrders={isMovingOrdersTenant(ctx.tenant.id)} />
      <TriggersClient />
    </CrmShell>
  );
}
