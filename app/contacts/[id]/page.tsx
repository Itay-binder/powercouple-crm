import { getCrmSession } from "@/lib/auth/crmSession";
import { authDisabled } from "@/lib/auth/session";
import { redirect } from "next/navigation";
import CrmShell from "@/app/components/CrmShell";
import ContactWorkspaceClient from "@/app/contacts/[id]/ContactWorkspaceClient";

export const dynamic = "force-dynamic";

export default async function ContactWorkspacePage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  if (authDisabled()) redirect("/login");
  const { id } = await params;
  const ctx = await getCrmSession();
  if (ctx.kind === "anon") redirect(`/login?returnTo=${encodeURIComponent(`/contacts/${id}`)}`);
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

  const viewerEmail = ctx.profile.email.trim();

  return (
    <CrmShell
      email={ctx.profile.email}
      tenants={ctx.accessibleTenants.map((t) => ({ id: t.id, label: t.label }))}
      currentTenantId={ctx.tenant.id}
    >
      <ContactWorkspaceClient contactId={id} viewerEmail={viewerEmail} />
    </CrmShell>
  );
}
