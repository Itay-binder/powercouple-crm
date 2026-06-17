import { NextRequest, NextResponse } from "next/server";
import { requireApprovedUser } from "@/lib/auth/guard";
import { isAdminEmail } from "@/lib/auth/profile";
import { getAdminDb } from "@/lib/firebase/admin";
import {
  listAdSetBidMetasInCampaign,
  metaAdSetEligibleForBidCap,
  updateAdSetBidCapForShekels,
} from "@/lib/metaAds/graph";
import { getMetaAdsConfig } from "@/lib/metaAds/repo";
import { verifyStatusTogglePassword } from "@/lib/metaAds/statusTogglePassword";

export const dynamic = "force-dynamic";

type Body = {
  bidCapShekels?: number;
  password?: string;
};

function canManage(user: { profile: { role: string }; email?: string }): boolean {
  return user.profile.role === "admin" || isAdminEmail(user.email);
}

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const auth = await requireApprovedUser(req);
  if (!auth.ok) {
    return NextResponse.json({ ok: false, error: auth.error }, { status: auth.status });
  }
  if (!canManage(auth.user)) {
    return NextResponse.json({ ok: false, error: "Forbidden" }, { status: 403 });
  }

  const { id: campaignIdRaw } = await params;
  const campaignId = campaignIdRaw?.trim() ?? "";
  if (!campaignId) {
    return NextResponse.json({ ok: false, error: "חסר מזהה קמפיין." }, { status: 400 });
  }

  let body: Body;
  try {
    body = (await req.json()) as Body;
  } catch {
    return NextResponse.json({ ok: false, error: "Invalid JSON" }, { status: 400 });
  }

  const password = body.password?.trim() ?? "";
  if (!password) {
    return NextResponse.json({ ok: false, error: "חובה להזין סיסמת אימות לפעולה." }, { status: 400 });
  }

  const bidCapShekels = Number(body.bidCapShekels);
  if (!Number.isFinite(bidCapShekels) || bidCapShekels <= 0) {
    return NextResponse.json({ ok: false, error: "יש להזין ביד-קאפ חיובי (בשקלים)." }, { status: 400 });
  }
  if (bidCapShekels > 1_000_000) {
    return NextResponse.json({ ok: false, error: "הסכום גבוה מדי." }, { status: 400 });
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
    if (!verifyStatusTogglePassword(config, password)) {
      return NextResponse.json({ ok: false, error: "סיסמת האימות שגויה." }, { status: 403 });
    }

    const metas = await listAdSetBidMetasInCampaign(config, campaignId);
    const targets = metas.filter((m) => metaAdSetEligibleForBidCap(m));
    if (targets.length === 0) {
      return NextResponse.json(
        {
          ok: false,
          error:
            "אין סדרת מודעות עם ביד-קאפ / עלות יעד במסגרת קמפיין זה (למשל אסטרטגיה ללא תקרה או ללא ערך מוגדר).",
        },
        { status: 400 }
      );
    }

    for (const adSet of targets) {
      await updateAdSetBidCapForShekels(config, adSet, bidCapShekels);
    }

    return NextResponse.json({ ok: true, campaignId, updated: targets.length });
  } catch (e) {
    return NextResponse.json(
      { ok: false, error: e instanceof Error ? e.message : "Bid cap update failed" },
      { status: 400 }
    );
  }
}
