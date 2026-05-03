import { type NextRequest, NextResponse } from "next/server";
import { getVerifiedAuthFromRequest } from "@/lib/auth/fromRequest";
import { getCrmSession } from "@/lib/auth/crmSession";
import { isAdminEmail } from "@/lib/auth/profile";
import { authDisabled } from "@/lib/auth/session";

export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  if (authDisabled()) {
    return NextResponse.json({
      ok: true,
      authDisabled: true,
      user: null,
      profile: null,
      tenants: [],
      currentTenantId: null,
    });
  }

  const authUser = await getVerifiedAuthFromRequest(req);
  if (!authUser) return NextResponse.json({ ok: false }, { status: 401 });

  const ctx = await getCrmSession();
  if (ctx.kind === "anon") {
    return NextResponse.json({ ok: false }, { status: 401 });
  }

  const tenantsPayload = ctx.accessibleTenants.map((t) => ({
    id: t.id,
    label: t.label,
  }));

  if (ctx.kind === "forbidden") {
    return NextResponse.json({
      ok: false,
      error: "Not approved or no access to workspace",
      user: { uid: ctx.uid, email: ctx.email },
      profile: null,
      tenants: tenantsPayload,
      currentTenantId: null,
      tenantForbidden: true,
    }, { status: 403 });
  }

  return NextResponse.json({
    ok: true,
    authDisabled: false,
    user: { uid: ctx.uid, email: ctx.email },
    profile: ctx.profile,
    tenants: tenantsPayload,
    currentTenantId: ctx.tenant.id,
    isAdmin: ctx.profile.role === "admin" || isAdminEmail(ctx.email),
  });
}
