import { NextRequest, NextResponse } from "next/server";
import { isValidIngestApiKeyAsync } from "@/lib/ingest/apiKey";
import { getRequestTenantDatabaseId } from "@/lib/firebase/admin";
import { resetAllOpportunities } from "@/lib/opportunities/repo";
import { tenantDatabaseIdFromIngestRequest } from "@/lib/tenant/historicalIngest";
import { getTenantByDatabaseId } from "@/lib/tenant/config";

export const dynamic = "force-dynamic";
export const revalidate = 0;

type ApiErr = { ok: false; error: string };

export async function POST(req: NextRequest) {
  if (!(await isValidIngestApiKeyAsync(req))) {
    return NextResponse.json(
      { ok: false, error: "Unauthorized" } satisfies ApiErr,
      { status: 401 }
    );
  }

  const headerDatabaseId = tenantDatabaseIdFromIngestRequest(req)?.trim();
  if (!headerDatabaseId) {
    return NextResponse.json(
      {
        ok: false,
        error: "Missing x-crm-tenant-database-id header",
      } satisfies ApiErr,
      { status: 400 }
    );
  }
  if (!getTenantByDatabaseId(headerDatabaseId)) {
    return NextResponse.json(
      { ok: false, error: "Unknown tenant databaseId" } satisfies ApiErr,
      { status: 400 }
    );
  }

  const body = (await req.json().catch(() => ({}))) as {
    confirmDatabaseId?: string;
    execute?: boolean;
  };
  const confirmDatabaseId = body.confirmDatabaseId?.trim();
  if (!confirmDatabaseId || confirmDatabaseId !== headerDatabaseId) {
    return NextResponse.json(
      {
        ok: false,
        error: "confirmDatabaseId must exactly match x-crm-tenant-database-id",
      } satisfies ApiErr,
      { status: 400 }
    );
  }

  const resolvedDatabaseId = (await getRequestTenantDatabaseId()).trim();
  if (resolvedDatabaseId !== headerDatabaseId) {
    return NextResponse.json(
      {
        ok: false,
        error: "Tenant resolution mismatch; refusing to proceed",
      } satisfies ApiErr,
      { status: 400 }
    );
  }

  const result = await resetAllOpportunities({ execute: body.execute === true });
  return NextResponse.json({
    ok: true,
    tenantDatabaseId: headerDatabaseId,
    ...result,
  });
}
