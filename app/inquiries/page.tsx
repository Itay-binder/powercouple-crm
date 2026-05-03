import { getCrmSession } from "@/lib/auth/crmSession";
import { authDisabled } from "@/lib/auth/session";
import { redirect } from "next/navigation";
import Link from "next/link";
import CrmShell from "@/app/components/CrmShell";

export const dynamic = "force-dynamic";

export default async function InquiriesPlaceholderPage() {
  if (authDisabled()) redirect("/login");
  const ctx = await getCrmSession();
  if (ctx.kind === "anon") redirect("/login?returnTo=/inquiries");
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
      <div style={{ maxWidth: 640 }}>
        <h1 style={{ marginTop: 0 }}>פניות מלקוחות</h1>
        <p style={{ color: "#6b7280", lineHeight: 1.6 }}>
          לפי האפיון: פניה תסתנכרן כהערה באיש הקשר, עם אפשרות להפוך למשימה ולענות דרך Green API (מיידי / מתוזמן). המימוש יתחבר כאן ובמסך איש הקשר.
        </p>
        <p style={{ fontWeight: 700 }}>
          בינתיים ניתן לנהל פניות תחת שלב <strong>פניות</strong> בפייפליין{" "}
          <Link href="/pipeline?pipelineId=default-sales&stage=%D7%A4%D7%A0%D7%99%D7%95%D7%AA" style={{ color: "#2563eb" }}>
            פתח פייפליין
          </Link>
          .
        </p>
      </div>
    </CrmShell>
  );
}
