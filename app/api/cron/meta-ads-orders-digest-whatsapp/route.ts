import { NextRequest, NextResponse } from "next/server";
import { getAdminDb, getFirestoreForDatabaseId } from "@/lib/firebase/admin";
import { TENANT_DB_HEADER, getTenantConfigs } from "@/lib/tenant/config";
import { runMetaAdsOrdersDigestWhatsApp } from "@/lib/cron/metaAdsOrdersDigestWhatsApp";

export const dynamic = "force-dynamic";
export const revalidate = 0;

function authorized(req: NextRequest): { ok: true } | { ok: false; status: number; error: string } {
  const secret = process.env.CRON_SECRET?.trim();
  const auth = req.headers.get("authorization") ?? "";
  if (secret) {
    if (auth !== `Bearer ${secret}`) {
      return { ok: false, status: 401, error: "Unauthorized" };
    }
  } else if (process.env.NODE_ENV === "production") {
    return { ok: false, status: 500, error: "CRON_SECRET is not configured" };
  }
  return { ok: true };
}

async function resolveDb(req: NextRequest) {
  const headerDb = req.headers.get(TENANT_DB_HEADER)?.trim();
  const configs = getTenantConfigs();
  if (headerDb && configs.some((c) => c.databaseId.trim() === headerDb)) {
    return getFirestoreForDatabaseId(headerDb);
  }
  return getAdminDb();
}

const DISABLED = true;

export async function GET(req: NextRequest) {
  if (DISABLED) return NextResponse.json({ ok: false, error: "disabled" }, { status: 503 });
  const gate = authorized(req);
  if (!gate.ok) {
    return NextResponse.json({ ok: false, error: gate.error }, { status: gate.status });
  }
  const dryRun = req.nextUrl.searchParams.get("dryRun") === "1" || req.nextUrl.searchParams.get("dryRun") === "true";
  try {
    const db = await resolveDb(req);
    const result = await runMetaAdsOrdersDigestWhatsApp({ db, dryRun });
    return NextResponse.json(result, { status: result.ok ? 200 : 400 });
  } catch (e) {
    return NextResponse.json(
      { ok: false, error: e instanceof Error ? e.message : "Unknown error" },
      { status: 500 }
    );
  }
}

export async function POST(req: NextRequest) {
  if (DISABLED) return NextResponse.json({ ok: false, error: "disabled" }, { status: 503 });
  const gate = authorized(req);
  if (!gate.ok) {
    return NextResponse.json({ ok: false, error: gate.error }, { status: gate.status });
  }
  let dryRun = false;
  try {
    const ct = req.headers.get("content-type") ?? "";
    if (ct.includes("application/json")) {
      const j = (await req.json().catch(() => ({}))) as { dryRun?: boolean };
      dryRun = Boolean(j.dryRun);
    }
  } catch {
    dryRun = false;
  }
  try {
    const db = await resolveDb(req);
    const result = await runMetaAdsOrdersDigestWhatsApp({ db, dryRun });
    return NextResponse.json(result, { status: result.ok ? 200 : 400 });
  } catch (e) {
    return NextResponse.json(
      { ok: false, error: e instanceof Error ? e.message : "Unknown error" },
      { status: 500 }
    );
  }
}
