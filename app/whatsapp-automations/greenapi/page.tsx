import { getCrmSession } from "@/lib/auth/crmSession";
import { authDisabled } from "@/lib/auth/session";
import { redirect } from "next/navigation";
import CrmShell from "@/app/components/CrmShell";
import WhatsAppSectionShell from "@/app/whatsapp-automations/WhatsAppSectionShell";
import GreenApiClient from "@/app/whatsapp-automations/GreenApiClient";

export const dynamic = "force-dynamic";

export default async function WhatsAppGreenApiPage() {
  if (authDisabled()) redirect("/login");
  const ctx = await getCrmSession();
  if (ctx.kind === "anon") redirect("/login?returnTo=/whatsapp-automations/greenapi");
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
        title="GREENAPI"
        subtitle="ניהול חיבור GREENAPI, צפייה בהודעות נכנסות/יוצאות, ושליחת הודעות WhatsApp ישירות מה-CRM."
      >
        <GreenApiClient />
      </WhatsAppSectionShell>
    </CrmShell>
  );
}
