import { NextRequest, NextResponse } from "next/server";
import { requireApprovedUser } from "@/lib/auth/guard";
import { getAdminDb } from "@/lib/firebase/admin";
import { listActiveMetaAdsCampaigns } from "@/lib/metaAds/graph";
import { getMetaAdsConfig } from "@/lib/metaAds/repo";

export const dynamic = "force-dynamic";

const ALLOWED_DATE_PRESETS = new Set([
  "today",
  "yesterday",
  "last_3d",
  "last_7d",
  "last_14d",
  "last_28d",
  "last_30d",
  "this_month",
  "last_month",
  "this_quarter",
  "maximum",
]);

export async function GET(req: NextRequest) {
  const auth = await requireApprovedUser(req);
  if (!auth.ok) {
    return NextResponse.json({ ok: false, error: auth.error }, { status: auth.status });
  }
  try {
    const db = await getAdminDb();
    const config = await getMetaAdsConfig(db);
    if (!config?.adAccountId || !config.accessToken) {
      return NextResponse.json(
        { ok: false, error: "חסרה הגדרת Meta Ads (Ad Account / Access Token)." },
        { status: 400 }
      );
    }
    const datePresetRaw = req.nextUrl.searchParams.get("datePreset")?.trim() ?? "last_7d";
    const datePreset = ALLOWED_DATE_PRESETS.has(datePresetRaw) ? datePresetRaw : "last_7d";
    const campaigns = await listActiveMetaAdsCampaigns(config, datePreset);
    return NextResponse.json({
      ok: true,
      adAccountId: config.adAccountId,
      datePreset,
      fetchedAt: new Date().toISOString(),
      campaigns,
    });
  } catch (e) {
    return NextResponse.json(
      { ok: false, error: e instanceof Error ? e.message : "Unknown error" },
      { status: 400 }
    );
  }
}
