import { type NextRequest, NextResponse } from "next/server";
import { getVerifiedAuthFromRequest } from "@/lib/auth/fromRequest";
import { authDisabled } from "@/lib/auth/session";
import { setTenantCookieOnResponse } from "@/lib/auth/sessionCookieOptions";
import { getSessionExpiresMs } from "@/lib/auth/sessionDuration";
import { canAccessTenant } from "@/lib/tenant/access";
import { resolveTenantById } from "@/lib/tenant/config";

export const dynamic = "force-dynamic";

export async function POST(req: NextRequest) {
  if (authDisabled()) {
    return NextResponse.json({ error: "Auth disabled" }, { status: 400 });
  }
  const authUser = await getVerifiedAuthFromRequest(req);
  if (!authUser) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  let body: { tenantId?: string };
  try {
    body = (await req.json()) as { tenantId?: string };
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const tenantId = body.tenantId?.trim();
  const tenant = resolveTenantById(tenantId);
  if (!tenant) {
    return NextResponse.json({ error: "Unknown tenant" }, { status: 400 });
  }

  if (!(await canAccessTenant(authUser.email, authUser.uid, tenant))) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const maxAgeSec = Math.floor(getSessionExpiresMs() / 1000);
  const res = NextResponse.json({ ok: true, tenantId: tenant.id });
  setTenantCookieOnResponse(res, tenant.id, maxAgeSec);
  return res;
}
