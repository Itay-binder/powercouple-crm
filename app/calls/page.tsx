import { Suspense } from "react";
import { getCrmSession } from "@/lib/auth/crmSession";
import { authDisabled } from "@/lib/auth/session";
import { redirect } from "next/navigation";
import CrmShell from "@/app/components/CrmShell";
import ChatsInboxClient from "@/app/whatsapp-automations/ChatsInboxClient";

export const dynamic = "force-dynamic";

export default async function CallsManagementPage() {
  if (authDisabled()) redirect("/login");
  const ctx = await getCrmSession();
  if (ctx.kind === "anon") redirect("/login?returnTo=/calls");
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
      <div style={{ width: "100%" }}>
        <h1 style={{ margin: "0 0 6px", fontSize: 26, fontWeight: 900, lineHeight: 1.2 }}>
          ניהול שיחות
        </h1>
        <p style={{ margin: "0 0 16px", color: "#4b5563", lineHeight: 1.55, fontSize: 14 }}>
          מרכז ניהול השיחות במערכת: חיפוש שיחה, צפייה בפרטי איש קשר, ושליחת תגובות מתוך המסך.
        </p>
        <Suspense
          fallback={
            <div style={{ padding: 24, textAlign: "center", color: "#667781" }}>
              טוען שיחות…
            </div>
          }
        >
          <ChatsInboxClient />
        </Suspense>
      </div>
    </CrmShell>
  );
}

