import { NextRequest, NextResponse } from "next/server";
import { requireApprovedUser } from "@/lib/auth/guard";
import { isAdminEmail } from "@/lib/auth/profile";
import { getAdminDb } from "@/lib/firebase/admin";
import { getMetaAdsConfig } from "@/lib/metaAds/repo";
import { uploadImageToMeta, addAdToAdSet } from "@/lib/metaAds/campaignCreate";
import type { CallToActionType } from "@/lib/metaAds/campaignCreate";

export const dynamic = "force-dynamic";

function canManage(user: { profile: { role: string }; email?: string }): boolean {
  return user.profile.role === "admin" || isAdminEmail(user.email);
}

type RequestBody = {
  adSetId?: string;
  pageId?: string;
  canvaImageUrl?: string;
  imageHash?: string;
  videoId?: string;
  adName?: string;
  primaryText?: string;
  headline?: string;
  description?: string;
  callToAction?: string;
  websiteUrl?: string;
  utmSource?: string;
  utmMedium?: string;
  utmCampaign?: string;
  utmContent?: string;
  utmTerm?: string;
  advantageCreative?: boolean;
  launchStatus?: string;
};

export async function POST(req: NextRequest) {
  const auth = await requireApprovedUser(req);
  if (!auth.ok) return NextResponse.json({ ok: false, error: auth.error }, { status: auth.status });
  if (!canManage(auth.user))
    return NextResponse.json({ ok: false, error: "Forbidden" }, { status: 403 });

  let body: RequestBody;
  try {
    body = (await req.json()) as RequestBody;
  } catch {
    return NextResponse.json({ ok: false, error: "Invalid JSON" }, { status: 400 });
  }

  const adSetId = body.adSetId?.trim() ?? "";
  const pageId = body.pageId?.trim() ?? "";
  const adName = body.adName?.trim() ?? "";
  const primaryText = body.primaryText?.trim() ?? "";
  const headline = body.headline?.trim() ?? "";
  const websiteUrl = body.websiteUrl?.trim() ?? "";

  if (!adSetId) return NextResponse.json({ ok: false, error: "Ad Set ID נדרש" }, { status: 400 });
  if (!pageId) return NextResponse.json({ ok: false, error: "Facebook Page ID נדרש" }, { status: 400 });
  if (!adName) return NextResponse.json({ ok: false, error: "שם מודעה נדרש" }, { status: 400 });
  if (!primaryText) return NextResponse.json({ ok: false, error: "טקסט ראשי נדרש" }, { status: 400 });
  if (!headline) return NextResponse.json({ ok: false, error: "כותרת נדרשת" }, { status: 400 });
  if (!websiteUrl) return NextResponse.json({ ok: false, error: "קישור יעד נדרש" }, { status: 400 });

  const canvaImageUrl = body.canvaImageUrl?.trim() ?? "";
  const prebuiltImageHash = body.imageHash?.trim() ?? "";
  const prebuiltVideoId = body.videoId?.trim() ?? "";

  if (!canvaImageUrl && !prebuiltImageHash && !prebuiltVideoId) {
    return NextResponse.json({ ok: false, error: "תמונה או סרטון נדרשים" }, { status: 400 });
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

    let imageHash: string | undefined = prebuiltImageHash || undefined;
    const videoId: string | undefined = prebuiltVideoId || undefined;
    if (canvaImageUrl && !imageHash && !videoId) {
      imageHash = await uploadImageToMeta(config, canvaImageUrl);
    }

    const result = await addAdToAdSet(config, {
      adSetId,
      pageId,
      imageHash,
      videoId,
      adName,
      primaryText,
      headline,
      description: body.description?.trim() || undefined,
      callToAction: (body.callToAction as CallToActionType) ?? "LEARN_MORE",
      websiteUrl,
      utmSource: body.utmSource?.trim() || undefined,
      utmMedium: body.utmMedium?.trim() || undefined,
      utmCampaign: body.utmCampaign?.trim() || undefined,
      utmContent: body.utmContent?.trim() || undefined,
      utmTerm: body.utmTerm?.trim() || undefined,
      advantageCreative: body.advantageCreative !== false,
      launchStatus: body.launchStatus === "ACTIVE" ? "ACTIVE" : "PAUSED",
    });

    return NextResponse.json({ ok: true, ...result });
  } catch (e) {
    return NextResponse.json(
      { ok: false, error: e instanceof Error ? e.message : "יצירת מודעה נכשלה" },
      { status: 400 }
    );
  }
}
