import { NextRequest, NextResponse } from "next/server";
import { requireApprovedUser } from "@/lib/auth/guard";
import { isAdminEmail } from "@/lib/auth/profile";
import { getAdminDb } from "@/lib/firebase/admin";
import { getMetaAdsConfig } from "@/lib/metaAds/repo";
import { uploadImageToMeta, createMetaCampaign } from "@/lib/metaAds/campaignCreate";
import type {
  CampaignObjective,
  OptimizationGoal,
  BudgetType,
  CallToActionType,
  CreateCampaignInput,
} from "@/lib/metaAds/campaignCreate";

export const dynamic = "force-dynamic";

function canManage(user: { profile: { role: string }; email?: string }): boolean {
  return user.profile.role === "admin" || isAdminEmail(user.email);
}

type RequestBody = {
  canvaImageUrl?: string; // Canva exported URL → will be uploaded to Meta
  imageHash?: string;     // already-uploaded image hash
  videoId?: string;       // already-uploaded video ID
  campaignName?: string;
  objective?: string;
  launchStatus?: string;
  budgetType?: string;
  budget?: number;
  adSetName?: string;
  startTime?: string;
  endTime?: string;
  optimizationGoal?: string;
  bidAmount?: number;
  countries?: string[];
  ageMin?: number;
  ageMax?: number;
  genders?: number[];
  advantageAudience?: boolean;
  advantageCreative?: boolean;
  adName?: string;
  pageId?: string;
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

  const canvaImageUrl = body.canvaImageUrl?.trim() ?? "";
  const prebuiltImageHash = body.imageHash?.trim() ?? "";
  const prebuiltVideoId = body.videoId?.trim() ?? "";
  const campaignName = body.campaignName?.trim() ?? "";
  const pageId = body.pageId?.trim() ?? "";
  const websiteUrl = body.websiteUrl?.trim() ?? "";
  const primaryText = body.primaryText?.trim() ?? "";
  const headline = body.headline?.trim() ?? "";

  if (!canvaImageUrl && !prebuiltImageHash && !prebuiltVideoId)
    return NextResponse.json({ ok: false, error: "תמונה או סרטון נדרשים" }, { status: 400 });
  if (!campaignName) return NextResponse.json({ ok: false, error: "שם קמפיין נדרש" }, { status: 400 });
  if (!pageId) return NextResponse.json({ ok: false, error: "Facebook Page ID נדרש" }, { status: 400 });
  if (!websiteUrl) return NextResponse.json({ ok: false, error: "קישור יעד נדרש" }, { status: 400 });
  if (!primaryText) return NextResponse.json({ ok: false, error: "טקסט ראשי נדרש" }, { status: 400 });
  if (!headline) return NextResponse.json({ ok: false, error: "כותרת נדרשת" }, { status: 400 });

  try {
    const db = await getAdminDb();
    const config = await getMetaAdsConfig(db);
    if (!config?.adAccountId || !config.accessToken) {
      return NextResponse.json(
        { ok: false, error: "חסרה הגדרת Meta Ads (Ad Account / Access Token)." },
        { status: 400 }
      );
    }

    // Resolve image hash / video id
    let imageHash: string | undefined = prebuiltImageHash || undefined;
    let videoId: string | undefined = prebuiltVideoId || undefined;
    if (canvaImageUrl && !imageHash && !videoId) {
      imageHash = await uploadImageToMeta(config, canvaImageUrl);
    }

    const input: CreateCampaignInput = {
      campaignName,
      objective: (body.objective as CampaignObjective) ?? "OUTCOME_LEADS",
      launchStatus: body.launchStatus === "ACTIVE" ? "ACTIVE" : "PAUSED",
      budgetType: (body.budgetType as BudgetType) ?? "daily",
      budget: typeof body.budget === "number" && body.budget > 0 ? body.budget : 50,
      adSetName: body.adSetName?.trim() || `${campaignName} - Ad Set`,
      startTime: body.startTime?.trim() || undefined,
      endTime: body.endTime?.trim() || undefined,
      optimizationGoal: (body.optimizationGoal as OptimizationGoal) ?? "LEAD_GENERATION",
      bidAmount: typeof body.bidAmount === "number" && body.bidAmount > 0 ? body.bidAmount : undefined,
      countries: Array.isArray(body.countries) && body.countries.length ? body.countries : ["IL"],
      ageMin: typeof body.ageMin === "number" ? body.ageMin : 18,
      ageMax: typeof body.ageMax === "number" ? body.ageMax : 65,
      genders: Array.isArray(body.genders) ? body.genders : [],
      advantageAudience: body.advantageAudience !== false,
      advantageCreative: body.advantageCreative !== false,
      adName: body.adName?.trim() || campaignName,
      pageId,
      imageHash,
      videoId,
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
    };

    const result = await createMetaCampaign(config, input);
    return NextResponse.json({ ok: true, ...result });
  } catch (e) {
    return NextResponse.json(
      { ok: false, error: e instanceof Error ? e.message : "יצירת קמפיין נכשלה" },
      { status: 400 }
    );
  }
}