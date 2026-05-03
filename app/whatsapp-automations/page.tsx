import { getCrmSession } from "@/lib/auth/crmSession";
import { authDisabled } from "@/lib/auth/session";
import { redirect } from "next/navigation";
import CrmShell from "@/app/components/CrmShell";
import WhatsAppSectionShell from "@/app/whatsapp-automations/WhatsAppSectionShell";
import BroadcastsHomeClient from "@/app/whatsapp-automations/BroadcastsHomeClient";

export const dynamic = "force-dynamic";

export default async function WhatsAppAutomationsPage() {
  if (authDisabled()) redirect("/login");
  const ctx = await getCrmSession();
  if (ctx.kind === "anon") redirect("/login?returnTo=/whatsapp-automations");
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
      <WhatsAppSectionShell
        title="ברודקאסטים"
        subtitle="טיוטות דיוור, היסטוריית שליחות, ויצירת ברודקאסט חדש לפי תבנית וקהל."
      >
        <BroadcastsHomeClient />
      </WhatsAppSectionShell>
    </CrmShell>
  );
}
