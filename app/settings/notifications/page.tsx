import { getCrmSession } from "@/lib/auth/crmSession";
import { authDisabled } from "@/lib/auth/session";
import { redirect } from "next/navigation";
import CrmShell from "@/app/components/CrmShell";
import NotificationsClient from "@/app/settings/notifications/NotificationsClient";
import { isMovingOrdersTenant } from "@/lib/tenant/movingOrders";

export const dynamic = "force-dynamic";

export default async function SettingsNotificationsPage() {
  if (authDisabled()) redirect("/login");
  const ctx = await getCrmSession();
  if (ctx.kind === "anon") redirect("/login?returnTo=/settings/notifications");
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
      <NotificationsClient
        showMovingOrders={isMovingOrdersTenant(ctx.tenant.id)}
        tenantId={ctx.tenant.id}
      />
    </CrmShell>
  );
}
