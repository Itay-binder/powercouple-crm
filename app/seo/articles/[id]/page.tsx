import { getCrmSession } from "@/lib/auth/crmSession";
import { authDisabled } from "@/lib/auth/session";
import { redirect } from "next/navigation";
import CrmShell from "@/app/components/CrmShell";
import SeoArticleViewClient from "@/app/seo/SeoArticleViewClient";

export const dynamic = "force-dynamic";

export default async function SeoArticlePage({ params }: { params: Promise<{ id: string }> }) {
  if (authDisabled()) redirect("/login");
  const ctx = await getCrmSession();
  const { id } = await params;
  if (ctx.kind === "anon") redirect(`/login?returnTo=${encodeURIComponent(`/seo/articles/${id}`)}`);
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
      <SeoArticleViewClient id={id} />
    </CrmShell>
  );
}
