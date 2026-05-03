import { Suspense } from "react";
import { getCrmSession } from "@/lib/auth/crmSession";
import { authDisabled } from "@/lib/auth/session";
import { redirect } from "next/navigation";
import CrmShell from "@/app/components/CrmShell";
import WhatsAppSectionShell from "@/app/whatsapp-automations/WhatsAppSectionShell";
import BroadcastNewClient from "@/app/whatsapp-automations/broadcasts/BroadcastNewClient";

export const dynamic = "force-dynamic";

export default async function BroadcastNewPage() {
  if (authDisabled()) redirect("/login");
  const ctx = await getCrmSession();
  if (ctx.kind === "anon") redirect("/login?returnTo=/whatsapp-automations/broadcasts/new");
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
      <WhatsAppSectionShell title="ברודקאסט חדש" subtitle="תוכן (תבנית) וקהל יעד לפי תנאים — כמו ב-ManyChat.">
        <Suspense fallback={<div style={{ color: "#6b7280" }}>טוען…</div>}>
          <BroadcastNewClient />
        </Suspense>
      </WhatsAppSectionShell>
    </CrmShell>
  );
}
