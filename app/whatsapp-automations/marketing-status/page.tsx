import { getCrmSession } from "@/lib/auth/crmSession";
import { authDisabled } from "@/lib/auth/session";
import { redirect } from "next/navigation";
import CrmShell from "@/app/components/CrmShell";
import WhatsAppSectionShell from "@/app/whatsapp-automations/WhatsAppSectionShell";
import MarketingStatusClient from "@/app/whatsapp-automations/MarketingStatusClient";

export const dynamic = "force-dynamic";

export default async function WhatsAppMarketingStatusPage() {
  if (authDisabled()) redirect("/login");
  const ctx = await getCrmSession();
  if (ctx.kind === "anon") redirect("/login?returnTo=/whatsapp-automations/marketing-status");
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
        title="סטטוס דיוור"
        subtitle='ניהול אישורי דיוור WhatsApp לכל איש קשר. תגובת "הסר" מסמנת אוטומטית כלא פעיל.'
      >
        <MarketingStatusClient />
      </WhatsAppSectionShell>
    </CrmShell>
  );
}
