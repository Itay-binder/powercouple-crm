import { getCrmSession } from "@/lib/auth/crmSession";
import { authDisabled } from "@/lib/auth/session";
import { redirect } from "next/navigation";
import CrmShell from "@/app/components/CrmShell";
import DealDetailClient from "@/app/deals/[id]/DealDetailClient";

export const dynamic = "force-dynamic";

export default async function DealDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  if (authDisabled()) redirect("/login");
  const ctx = await getCrmSession();
  if (ctx.kind === "anon") redirect(`/login?returnTo=/deals/${encodeURIComponent(id)}`);
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
      <DealDetailClient id={id} />
    </CrmShell>
  );
}
