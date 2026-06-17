import { getCrmSession } from "@/lib/auth/crmSession";
import { authDisabled } from "@/lib/auth/session";
import { redirect } from "next/navigation";
import CrmShell from "@/app/components/CrmShell";
import MoverProfilesClient from "./MoverProfilesClient";
import { getMoverProfilesDb } from "@/movers-profile/firestore";
import { listMoverProfiles } from "@/movers-profile/repo";

export const dynamic = "force-dynamic";

export default async function MoverProfilesPage() {
  if (authDisabled()) redirect("/login");
  const ctx = await getCrmSession();
  if (ctx.kind === "anon") redirect("/login?returnTo=/mover-profiles");
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

  const db = getMoverProfilesDb();
  const profiles = await listMoverProfiles(db);

  // Serialize dates for client component
  const serialized = profiles.map((p) => ({
    ...p,
    createdAt: p.createdAt.toISOString(),
    updatedAt: p.updatedAt.toISOString(),
  }));

  return (
    <CrmShell
      email={ctx.profile.email}
      tenants={ctx.accessibleTenants.map((t) => ({ id: t.id, label: t.label }))}
      currentTenantId={ctx.tenant.id}
    >
      {/* eslint-disable-next-line @typescript-eslint/no-explicit-any */}
      <MoverProfilesClient initialProfiles={serialized as any} />
    </CrmShell>
  );
}