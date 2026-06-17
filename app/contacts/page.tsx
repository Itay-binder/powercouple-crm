import { getCrmSession } from "@/lib/auth/crmSession";
import { authDisabled } from "@/lib/auth/session";
import { redirect } from "next/navigation";
import CrmShell from "@/app/components/CrmShell";
import ContactsClient from "@/app/contacts/ContactsClient";

export const dynamic = "force-dynamic";

export default async function ContactsPage() {
  if (authDisabled()) redirect("/login");
  const ctx = await getCrmSession();
  if (ctx.kind === "anon") redirect("/login?returnTo=/contacts");
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
      <ContactsClient />
    </CrmShell>
  );
}
