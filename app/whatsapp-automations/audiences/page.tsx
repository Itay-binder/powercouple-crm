import { getCrmSession } from "@/lib/auth/crmSession";
import { authDisabled } from "@/lib/auth/session";
import { redirect } from "next/navigation";
import CrmShell from "@/app/components/CrmShell";
import WhatsAppSectionShell from "@/app/whatsapp-automations/WhatsAppSectionShell";
import AudiencesClient from "@/app/whatsapp-automations/AudiencesClient";

export const dynamic = "force-dynamic";

export default async function WhatsAppAudiencesPage() {
  if (authDisabled()) redirect("/login");
  const ctx = await getCrmSession();
  if (ctx.kind === "anon") redirect("/login?returnTo=/whatsapp-automations/audiences");
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
        title="קהלים"
        subtitle="יצירת קהלים שמורים לפי תנאים או מתוך דיוורים קודמים, לשימוש חוזר בברודקאסט."
      >
        <AudiencesClient />
      </WhatsAppSectionShell>
    </CrmShell>
  );
}
