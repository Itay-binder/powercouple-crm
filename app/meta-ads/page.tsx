import { getCrmSession } from "@/lib/auth/crmSession";
import { authDisabled } from "@/lib/auth/session";
import { redirect } from "next/navigation";
import CrmShell from "@/app/components/CrmShell";
import MetaAdsClient from "@/app/meta-ads/MetaAdsClient";

export const dynamic = "force-dynamic";

export default async function MetaAdsPage() {
  if (authDisabled()) redirect("/login");
  const ctx = await getCrmSession();
  if (ctx.kind === "anon") redirect("/login?returnTo=/meta-ads");
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
      <div style={{ maxWidth: 1180, width: "100%" }}>
        <h1 style={{ margin: "0 0 6px", fontSize: 26, fontWeight: 900, lineHeight: 1.2 }}>
          חיבור למטא
        </h1>
        <p style={{ margin: "0 0 20px", color: "#4b5563", lineHeight: 1.55, fontSize: 14 }}>
          חיבור מלא ל־Meta Ads Manager והצגת נתוני קמפיינים פעילים ישירות ב־CRM.
        </p>
        <MetaAdsClient />
      </div>
    </CrmShell>
  );
}
