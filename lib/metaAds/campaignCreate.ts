import type { MetaAdsConfig } from "@/lib/metaAds/repo";
import { normalizeAdAccountId } from "@/lib/metaAds/repo";

function graphBaseUrl(): string {
  return (process.env.META_GRAPH_API_BASE?.trim() || "https://graph.facebook.com/v22.0").replace(/\/$/, "");
}

function budgetToCents(amount: number): number {
  return Math.round(amount * 100);
}

async function metaPost<T>(
  config: MetaAdsConfig,
  path: string,
  body: Record<string, unknown>
): Promise<T> {
  const base = graphBaseUrl();
  const formBody = new URLSearchParams();
  formBody.set("access_token", config.accessToken);
  for (const [key, val] of Object.entries(body)) {
    if (val !== undefined && val !== null) {
      formBody.set(key, typeof val === "object" ? JSON.stringify(val) : String(val));
    }
  }
  const res = await fetch(`${base}${path}`, { method: "POST", body: formBody, cache: "no-store" });
  const json = (await res.json().catch(() => ({}))) as T & {
    error?: { message?: string; error_user_msg?: string; error_user_title?: string };
  };
  if (!res.ok) {
    const errObj = (json as Record<string, unknown>).error as Record<string, string> | undefined;
    const msg =
      errObj?.error_user_msg?.trim() ||
      errObj?.error_user_title?.trim() ||
      errObj?.message?.trim() ||
      `Meta API error (${res.status})`;
    throw new Error(msg);
  }
  return json;
}

export async function uploadImageToMeta(config: MetaAdsConfig, imageUrl: string): Promise<string> {
  const adAccountId = normalizeAdAccountId(config.adAccountId);
  const res = await metaPost<{ images?: Record<string, { hash?: string }> }>(
    config,
    `/act_${adAccountId}/adimages`,
    { url: imageUrl }
  );
  const firstImage = Object.values(res.images ?? {})[0];
  if (!firstImage?.hash) throw new Error("לא ניתן לקבל hash לתמונה שהועלתה מ-Meta");
  return firstImage.hash;
}

export type CampaignObjective =
  | "OUTCOME_AWARENESS"
  | "OUTCOME_TRAFFIC"
  | "OUTCOME_ENGAGEMENT"
  | "OUTCOME_LEADS"
  | "OUTCOME_SALES"
  | "OUTCOME_APP_PROMOTION";

export type OptimizationGoal =
  | "REACH"
  | "IMPRESSIONS"
  | "LINK_CLICKS"
  | "LANDING_PAGE_VIEWS"
  | "LEAD_GENERATION"
  | "QUALITY_LEAD"
  | "OFFSITE_CONVERSIONS"
  | "APP_INSTALLS"
  | "POST_ENGAGEMENT";

export type BudgetType = "daily" | "lifetime";

export type CallToActionType =
  | "LEARN_MORE"
  | "SHOP_NOW"
  | "SIGN_UP"
  | "CONTACT_US"
  | "BOOK_TRAVEL"
  | "DOWNLOAD"
  | "GET_QUOTE"
  | "SUBSCRIBE"
  | "WATCH_MORE"
  | "GET_OFFER";

export type CreateCampaignInput = {
  // Campaign level
  campaignName: string;
  objective: CampaignObjective;
  launchStatus: "ACTIVE" | "PAUSED";

  // Budget
  budgetType: BudgetType;
  budget: number; // ILS

  // Ad Set level
  adSetName: string;
  startTime?: string; // ISO
  endTime?: string; // ISO — required for lifetime budget
  optimizationGoal: OptimizationGoal;
  bidAmount?: number; // bid cap in ILS, 0 = no cap

  // Targeting
  countries: string[]; // e.g. ["IL"]
  ageMin: number;
  ageMax: number;
  genders: number[]; // [] = all, [1] = male, [2] = female

  // Advantage+ AI
  advantageAudience: boolean;
  advantageCreative: boolean;

  // Ad Creative — must supply imageHash OR videoId
  adName: string;
  pageId: string;
  imageHash?: string;
  videoId?: string;
  primaryText: string;
  headline: string;
  description?: string;
  callToAction: CallToActionType;
  websiteUrl: string;

  // UTM
  utmSource?: string;
  utmMedium?: string;
  utmCampaign?: string;
  utmContent?: string;
  utmTerm?: string;
};

export type CreateCampaignResult = {
  campaignId: string;
  adSetId: string;
  adCreativeId: string;
  adId: string;
};

function buildFinalUrl(input: CreateCampaignInput): string {
  try {
    const url = new URL(input.websiteUrl);
    if (input.utmSource) url.searchParams.set("utm_source", input.utmSource);
    if (input.utmMedium) url.searchParams.set("utm_medium", input.utmMedium);
    if (input.utmCampaign) url.searchParams.set("utm_campaign", input.utmCampaign);
    if (input.utmContent) url.searchParams.set("utm_content", input.utmContent);
    if (input.utmTerm) url.searchParams.set("utm_term", input.utmTerm);
    return url.toString();
  } catch {
    return input.websiteUrl;
  }
}

function billingEventForGoal(goal: OptimizationGoal): string {
  // Meta requires billing_event to match the optimization goal category.
  // LINK_CLICKS is the only goal billed per click; all others are billed per impression.
  switch (goal) {
    case "LINK_CLICKS": return "LINK_CLICKS";
    default: return "IMPRESSIONS";
  }
}

// ── Add ad to existing ad set ─────────────────────────────────────────────────

export type AddAdInput = {
  adSetId: string;
  pageId: string;
  imageHash?: string;
  videoId?: string;
  adName: string;
  primaryText: string;
  headline: string;
  description?: string;
  callToAction: CallToActionType;
  websiteUrl: string;
  utmSource?: string;
  utmMedium?: string;
  utmCampaign?: string;
  utmContent?: string;
  utmTerm?: string;
  advantageCreative: boolean;
  launchStatus: "ACTIVE" | "PAUSED";
};

export async function addAdToAdSet(
  config: MetaAdsConfig,
  input: AddAdInput
): Promise<{ adCreativeId: string; adId: string }> {
  const adAccountId = normalizeAdAccountId(config.adAccountId);
  if (!adAccountId) throw new Error("חסר Ad Account ID בהגדרות");
  if (!config.accessToken) throw new Error("חסר Access Token בהגדרות");
  if (!input.adSetId.trim()) throw new Error("חסר Ad Set ID");
  if (!input.imageHash && !input.videoId) throw new Error("חובה לספק תמונה או סרטון");

  const finalUrl = buildFinalUrl({
    ...input,
    // buildFinalUrl only uses utm* + websiteUrl
    campaignName: "", objective: "OUTCOME_LEADS", launchStatus: "PAUSED",
    budgetType: "daily", budget: 0, adSetName: "", optimizationGoal: "LEAD_GENERATION",
    countries: [], ageMin: 18, ageMax: 65, genders: [], advantageAudience: false,
    adName: input.adName,
  } as CreateCampaignInput);

  let storySpec: Record<string, unknown>;
  if (input.videoId) {
    const videoData: Record<string, unknown> = {
      video_id: input.videoId,
      message: input.primaryText,
      title: input.headline,
      call_to_action: { type: input.callToAction, value: { link: finalUrl } },
    };
    if (input.description?.trim()) videoData.description = input.description.trim();
    storySpec = { page_id: input.pageId, video_data: videoData };
  } else {
    const linkData: Record<string, unknown> = {
      image_hash: input.imageHash,
      link: finalUrl,
      message: input.primaryText,
      name: input.headline,
      call_to_action: { type: input.callToAction, value: { link: finalUrl } },
    };
    if (input.description?.trim()) linkData.description = input.description.trim();
    storySpec = { page_id: input.pageId, link_data: linkData };
  }

  const creativeBody: Record<string, unknown> = {
    name: `${input.adName} - Creative`,
    object_story_spec: storySpec,
  };
  if (input.advantageCreative) {
    creativeBody.degrees_of_freedom_spec = {
      creative_features_spec: { standard_enhancements: { enroll_status: "OPT_IN" } },
    };
  }

  const creativeRes = await metaPost<{ id?: string }>(
    config,
    `/act_${adAccountId}/adcreatives`,
    creativeBody
  );
  const adCreativeId = creativeRes.id;
  if (!adCreativeId) throw new Error("יצירת קריאייטיב נכשלה");

  const adRes = await metaPost<{ id?: string }>(config, `/act_${adAccountId}/ads`, {
    name: input.adName,
    adset_id: input.adSetId,
    creative: { creative_id: adCreativeId },
    status: input.launchStatus,
  });
  const adId = adRes.id;
  if (!adId) throw new Error("יצירת מודעה נכשלה");

  return { adCreativeId, adId };
}

export async function createMetaCampaign(
  config: MetaAdsConfig,
  input: CreateCampaignInput
): Promise<CreateCampaignResult> {
  const adAccountId = normalizeAdAccountId(config.adAccountId);
  if (!adAccountId) throw new Error("חסר Ad Account ID בהגדרות");
  if (!config.accessToken) throw new Error("חסר Access Token בהגדרות");
  if (!input.imageHash && !input.videoId) throw new Error("חובה לספק תמונה או סרטון");

  // Step 1: Campaign
  // Explicitly disable Campaign Budget Optimization (CBO) so budget stays at ad-set level.
  // Without this, Meta v22+ may default to CBO and reject ad-set-level budgets.
  const campRes = await metaPost<{ id?: string }>(config, `/act_${adAccountId}/campaigns`, {
    name: input.campaignName,
    objective: input.objective,
    status: input.launchStatus,
    special_ad_categories: [],
    campaign_budget_optimization: false,
  });
  const campaignId = campRes.id;
  if (!campaignId) throw new Error("יצירת קמפיין נכשלה — לא התקבל ID");

  // Step 2: Targeting
  const targeting: Record<string, unknown> = {
    geo_locations: { countries: input.countries.length ? input.countries : ["IL"] },
    age_min: input.ageMin,
    age_max: input.ageMax,
  };
  if (input.genders.length) targeting.genders = input.genders;
  if (input.advantageAudience) targeting.targeting_automation = { advantage_audience: 1 };

  // Step 3: Ad Set
  const adSetBody: Record<string, unknown> = {
    name: input.adSetName,
    campaign_id: campaignId,
    optimization_goal: input.optimizationGoal,
    billing_event: billingEventForGoal(input.optimizationGoal),
    status: input.launchStatus,
    targeting,
  };

  // promoted_object is required for lead-gen and offsite-conversion optimization goals
  if (input.optimizationGoal === "LEAD_GENERATION" || input.optimizationGoal === "QUALITY_LEAD") {
    adSetBody.promoted_object = { page_id: input.pageId };
  }
  if (input.budgetType === "daily") {
    adSetBody.daily_budget = budgetToCents(input.budget);
  } else {
    adSetBody.lifetime_budget = budgetToCents(input.budget);
    if (input.endTime) {
      adSetBody.end_time = Math.floor(new Date(input.endTime).getTime() / 1000);
    }
  }
  if (input.startTime) {
    adSetBody.start_time = Math.floor(new Date(input.startTime).getTime() / 1000);
  }
  if (input.bidAmount && input.bidAmount > 0) {
    adSetBody.bid_amount = budgetToCents(input.bidAmount);
  }

  const adSetRes = await metaPost<{ id?: string }>(config, `/act_${adAccountId}/adsets`, adSetBody);
  const adSetId = adSetRes.id;
  if (!adSetId) {
    // Cleanup campaign on failure
    await metaPost(config, `/${campaignId}`, { status: "DELETED" }).catch(() => null);
    throw new Error("יצירת סדרת מודעות נכשלה");
  }

  // Step 4: Ad Creative
  const finalUrl = buildFinalUrl(input);

  let storySpec: Record<string, unknown>;
  if (input.videoId) {
    const videoData: Record<string, unknown> = {
      video_id: input.videoId,
      message: input.primaryText,
      title: input.headline,
      call_to_action: { type: input.callToAction, value: { link: finalUrl } },
    };
    if (input.description?.trim()) videoData.description = input.description.trim();
    storySpec = { page_id: input.pageId, video_data: videoData };
  } else {
    const linkData: Record<string, unknown> = {
      image_hash: input.imageHash,
      link: finalUrl,
      message: input.primaryText,
      name: input.headline,
      call_to_action: { type: input.callToAction, value: { link: finalUrl } },
    };
    if (input.description?.trim()) linkData.description = input.description.trim();
    storySpec = { page_id: input.pageId, link_data: linkData };
  }

  const creativeBody: Record<string, unknown> = {
    name: `${input.adName} - Creative`,
    object_story_spec: storySpec,
  };
  if (input.advantageCreative) {
    creativeBody.degrees_of_freedom_spec = {
      creative_features_spec: { standard_enhancements: { enroll_status: "OPT_IN" } },
    };
  }

  const creativeRes = await metaPost<{ id?: string }>(
    config,
    `/act_${adAccountId}/adcreatives`,
    creativeBody
  );
  const adCreativeId = creativeRes.id;
  if (!adCreativeId) throw new Error("יצירת קריאייטיב נכשלה");

  // Step 5: Ad
  const adRes = await metaPost<{ id?: string }>(config, `/act_${adAccountId}/ads`, {
    name: input.adName,
    adset_id: adSetId,
    creative: { creative_id: adCreativeId },
    status: input.launchStatus,
  });
  const adId = adRes.id;
  if (!adId) throw new Error("יצירת מודעה נכשלה");

  return { campaignId, adSetId, adCreativeId, adId };
}