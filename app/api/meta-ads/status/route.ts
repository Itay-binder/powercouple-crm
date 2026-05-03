import { NextRequest, NextResponse } from "next/server";
import { requireApprovedUser } from "@/lib/auth/guard";
import { getAdminDb } from "@/lib/firebase/admin";
import { getMetaAdsConfig } from "@/lib/metaAds/repo";
import { validateMetaToken } from "@/lib/metaAds/graph";

export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  const auth = await requireApprovedUser(req);
  if (!auth.ok) {
    return NextResponse.json({ ok: false, error: auth.error }, { status: auth.status });
  }
  try {
    const db = await getAdminDb();
    const config = await getMetaAdsConfig(db);
    if (!config?.accessToken) {
      return NextResponse.json({ ok: true, connected: false, scopes: [], expiresAt: "" });
    }
    const result = await validateMetaToken(config);
    return NextResponse.json({
      ok: true,
      connected: result.valid,
      scopes: result.scopes,
      expiresAt: result.expiresAt ?? config.tokenExpiresAt ?? "",
      error: result.error ?? null,
    });
  } catch (e) {
    return NextResponse.json(
      { ok: false, error: e instanceof Error ? e.message : "Status check failed" },
      { status: 500 }
    );
  }
}
