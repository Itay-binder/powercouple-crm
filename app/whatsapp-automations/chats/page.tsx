import { Suspense } from "react";
import { getCrmSession } from "@/lib/auth/crmSession";
import { authDisabled } from "@/lib/auth/session";
import { redirect } from "next/navigation";
import CrmShell from "@/app/components/CrmShell";
import WhatsAppSectionShell from "@/app/whatsapp-automations/WhatsAppSectionShell";
import ChatsInboxClient from "@/app/whatsapp-automations/ChatsInboxClient";

export const dynamic = "force-dynamic";

export default async function WhatsAppChatsPage() {
  if (authDisabled()) redirect("/login");
  const ctx = await getCrmSession();
  if (ctx.kind === "anon") redirect("/login?returnTo=/whatsapp-automations/chats");
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
        wide
        title="צ׳אטים"
        subtitle="תצוגת התכתבויות מהמספר המחובר. תגובת 'הסר' מסמנת את איש הקשר כלא פעיל לדיוורים."
      >
        <Suspense fallback={<div style={{ padding: 24, textAlign: "center", color: "#667781" }}>טוען צ׳אטים…</div>}>
          <ChatsInboxClient />
        </Suspense>
      </WhatsAppSectionShell>
    </CrmShell>
  );
}
