import { NextRequest, NextResponse } from "next/server";
import { getRequestTenantDatabaseId } from "@/lib/firebase/admin";
import { getTenantByDatabaseId } from "@/lib/tenant/config";
import { isMovingOrdersTenant } from "@/lib/tenant/movingOrders";
import { isValidIngestApiKeyAsync } from "@/lib/ingest/apiKey";
import { processMoverWelcomeItems } from "@/lib/movingOrders/processMoverWelcomeItems";

export const dynamic = "force-dynamic";
export const revalidate = 0;

type ApiErr = { ok: false; error: string };

export async function POST(req: NextRequest) {
  if (!(await isValidIngestApiKeyAsync(req))) {
    return NextResponse.json({ ok: false, error: "Unauthorized" } satisfies ApiErr, { status: 401 });
  }

  const dbId = await getRequestTenantDatabaseId();
  const tenant = getTenantByDatabaseId(dbId);
  if (!tenant || !isMovingOrdersTenant(tenant.id)) {
    return NextResponse.json(
      {
        ok: false,
        error: "ניהול הזמנות לא מופעל לטננט הזה. שלח כותרת x-crm-tenant או בחר עסק מתאים.",
      } satisfies ApiErr,
      { status: 403 }
    );
  }

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ ok: false, error: "Invalid JSON" } satisfies ApiErr, { status: 400 });
  }

  const out = await processMoverWelcomeItems(body);
  if (!out.ok) {
    const tenantBlocked =
      out.results.length === 0 && out.error.includes("ניהול הזמנות");
    const status = tenantBlocked ? 403 : 400;
    return NextResponse.json({ ok: false, error: out.error, results: out.results }, { status });
  }

  return NextResponse.json({ ok: true, results: out.results });
}
