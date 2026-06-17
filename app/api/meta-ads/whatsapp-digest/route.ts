import { NextRequest, NextResponse } from "next/server";
import { requireApprovedUserOrIngestApiKey } from "@/lib/auth/guard";
import { formatIsraelYmdUtc } from "@/lib/datetime/taskTimestamps";
import { getAdminDb } from "@/lib/firebase/admin";
import { listActiveMetaAdsCampaigns } from "@/lib/metaAds/graph";
import { getMetaAdsConfig } from "@/lib/metaAds/repo";
import { buildMetaWhatsAppDigestText } from "@/lib/metaAds/whatsappDigest";
import { assertMovingOrdersWorkspace } from "@/lib/movingOrders/guard";
import { listMovingOrders } from "@/lib/movingOrders/repo";

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
  const auth = await requireApprovedUserOrIngestApiKey(req);
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

    const datePresetRaw = req.nextUrl.searchParams.get("datePreset")?.trim() ?? "today";
    const datePreset = ALLOWED_DATE_PRESETS.has(datePresetRaw) ? datePresetRaw : "today";

    const [campaigns, mo] = await Promise.all([
      listActiveMetaAdsCampaigns(config, datePreset),
      assertMovingOrdersWorkspace(),
    ]);

    const todayYmd = formatIsraelYmdUtc(new Date());
    let todayOrderRows: { status: string }[] | null = null;
    if (mo.ok) {
      const orders = await listMovingOrders({
        db: mo.db,
        dateFrom: todayYmd,
        dateTo: todayYmd,
        maxFetch: 10000,
        resultLimit: null,
      });
      todayOrderRows = orders.map((o) => ({ status: o.status }));
    }

    const text = buildMetaWhatsAppDigestText({ campaigns, todayOrderRows });

    return NextResponse.json({
      ok: true,
      text,
      adAccountId: config.adAccountId,
      datePreset,
      israelDateYmd: todayYmd,
      fetchedAt: new Date().toISOString(),
    });
  } catch (e) {
    return NextResponse.json(
      { ok: false, error: e instanceof Error ? e.message : "Unknown error" },
      { status: 400 }
    );
  }
}
