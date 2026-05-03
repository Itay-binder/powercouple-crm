import type { MetaAdsConfig } from "@/lib/metaAds/repo";
import { normalizeAdAccountId } from "@/lib/metaAds/repo";

export type MetaTokenStatus = {
  valid: boolean;
  scopes: string[];
  expiresAt?: string;
  error?: string;
};

type MetaGraphError = {
  message?: string;
  error_user_title?: string;
  error_user_msg?: string;
};

type MetaActionStat = { action_type?: string; value?: string };

// ── Campaigns ────────────────────────────────────────────────────────────────

type MetaCampaignInsight = {
  spend?: string;
  impressions?: string;
  reach?: string;
  inline_link_clicks?: string;
  inline_link_click_ctr?: string;
  cost_per_inline_link_click?: string;
  actions?: MetaActionStat[];
};

type MetaCampaignNode = {
  id?: string;
  name?: string;
  status?: string;
  effective_status?: string;
  objective?: string;
  daily_budget?: string;
  lifetime_budget?: string;
  start_time?: string;
  stop_time?: string;
  updated_time?: string;
  insights?: { data?: MetaCampaignInsight[] };
};

export type MetaAdsCampaignVm = {
  id: string;
  name: string;
  status: string;
  effectiveStatus: string;
  objective: string;
  spend: number;
  impressions: number;
  reach: number;
  clicks: number;
  cpc: number;
  ctr: number;
  dailyBudget: number;
  lifetimeBudget: number;
  results: number;
  startTime?: string;
  stopTime?: string;
  updatedTime?: string;
};

// ── Ad Sets ───────────────────────────────────────────────────────────────────

type MetaAdSetInsight = {
  spend?: string;
  impressions?: string;
  reach?: string;
  inline_link_clicks?: string;
  inline_link_click_ctr?: string;
  cost_per_inline_link_click?: string;
  cpm?: string;
  actions?: MetaActionStat[];
};

type MetaAdSetNode = {
  id?: string;
  name?: string;
  status?: string;
  effective_status?: string;
  campaign_id?: string;
  campaign?: { name?: string };
  daily_budget?: string;
  lifetime_budget?: string;
  optimization_goal?: string;
  insights?: { data?: MetaAdSetInsight[] };
};

export type MetaAdSetVm = {
  id: string;
  name: string;
  status: string;
  effectiveStatus: string;
  campaignId: string;
  campaignName: string;
  optimizationGoal: string;
  spend: number;
  impressions: number;
  reach: number;
  clicks: number;
  cpc: number;
  ctr: number;
  cpm: number;
  dailyBudget: number;
  lifetimeBudget: number;
  results: number;
};

// ── Ads ───────────────────────────────────────────────────────────────────────

type MetaAdInsight = {
  spend?: string;
  impressions?: string;
  reach?: string;
  inline_link_clicks?: string;
  inline_link_click_ctr?: string;
  cost_per_inline_link_click?: string;
  actions?: MetaActionStat[];
};

type MetaAdNode = {
  id?: string;
  name?: string;
  status?: string;
  effective_status?: string;
  adset_id?: string;
  adset?: { name?: string };
  campaign_id?: string;
  campaign?: { name?: string };
  insights?: { data?: MetaAdInsight[] };
};

export type MetaAdVm = {
  id: string;
  name: string;
  status: string;
  effectiveStatus: string;
  adSetId: string;
  adSetName: string;
  campaignId: string;
  campaignName: string;
  spend: number;
  impressions: number;
  reach: number;
  clicks: number;
  cpc: number;
  ctr: number;
  results: number;
};

// ── Helpers ───────────────────────────────────────────────────────────────────

function graphBaseUrl(): string {
  return process.env.META_GRAPH_API_BASE?.trim() || "https://graph.facebook.com/v22.0";
}

function toNum(raw?: string): number {
  const n = Number.parseFloat((raw ?? "").trim());
  return Number.isFinite(n) ? n : 0;
}

function toInt(raw?: string): number {
  const n = Number.parseInt((raw ?? "").trim(), 10);
  return Number.isFinite(n) ? n : 0;
}

function budgetToCurrency(raw?: string): number {
  const cents = toNum(raw);
  return cents > 0 ? cents / 100 : 0;
}

// Meta Ads Manager picks ONE action type as "result" based on the campaign's optimization goal.
// We replicate this by trying action types in priority order and returning the first non-zero match.
// onsite_conversion.lead_grouped is preferred over plain "lead" to avoid double-counting.
const RESULT_PRIORITY: string[] = [
  "onsite_conversion.lead_grouped",
  "lead",
  "offsite_conversion.fb_pixel_lead",
  "complete_registration",
  "offsite_conversion.fb_pixel_complete_registration",
  "offsite_conversion.fb_pixel_purchase",
  "purchase",
];

function extractResults(actions?: MetaActionStat[]): number {
  if (!actions?.length) return 0;
  for (const type of RESULT_PRIORITY) {
    const found = actions.find((a) => a.action_type === type);
    if (found && toInt(found.value) > 0) return toInt(found.value);
  }
  return 0;
}

async function callMetaGraph<T>(
  config: MetaAdsConfig,
  path: string,
  query: URLSearchParams
): Promise<T> {
  const base = graphBaseUrl().replace(/\/$/, "");
  const normalizedPath = path.startsWith("/") ? path : `/${path}`;
  query.set("access_token", config.accessToken);
  const res = await fetch(`${base}${normalizedPath}?${query.toString()}`, {
    method: "GET",
    cache: "no-store",
  });
  const json = (await res.json().catch(() => ({}))) as T & { error?: MetaGraphError };
  if (!res.ok) {
    const msg =
      json.error?.error_user_msg?.trim() ||
      json.error?.error_user_title?.trim() ||
      json.error?.message?.trim() ||
      `Meta Graph request failed (${res.status})`;
    throw new Error(msg);
  }
  return json;
}

// ── Status toggle ─────────────────────────────────────────────────────────────

export async function setMetaObjectStatus(
  config: MetaAdsConfig,
  objectId: string,
  status: "ACTIVE" | "PAUSED"
): Promise<void> {
  const base = graphBaseUrl().replace(/\/$/, "");
  const body = new URLSearchParams({ status, access_token: config.accessToken });
  const res = await fetch(`${base}/${objectId}`, {
    method: "POST",
    body,
    cache: "no-store",
  });
  const json = (await res.json().catch(() => ({}))) as { success?: boolean; error?: MetaGraphError };
  if (!res.ok || json.success === false) {
    const msg =
      json.error?.error_user_msg?.trim() ||
      json.error?.error_user_title?.trim() ||
      json.error?.message?.trim() ||
      `Meta API error (${res.status})`;
    throw new Error(msg);
  }
}

// ── Token validation ──────────────────────────────────────────────────────────

export async function validateMetaToken(config: MetaAdsConfig): Promise<MetaTokenStatus> {
  const appId = process.env.META_APP_ID?.trim();
  const appSecret = process.env.META_APP_SECRET?.trim();
  if (!appId || !appSecret) {
    return { valid: false, scopes: [], error: "META_APP_ID / META_APP_SECRET לא מוגדרים." };
  }
  if (!config.accessToken.trim()) {
    return { valid: false, scopes: [], error: "אין Access Token." };
  }
  try {
    const base = graphBaseUrl().replace(/\/$/, "");
    const res = await fetch(
      `${base}/debug_token?` +
        new URLSearchParams({
          input_token: config.accessToken,
          access_token: `${appId}|${appSecret}`,
        }).toString(),
      { cache: "no-store" }
    );
    const json = (await res.json().catch(() => ({}))) as {
      data?: {
        is_valid?: boolean;
        scopes?: string[];
        expires_at?: number;
        error?: { message?: string };
      };
    };
    const data = json.data;
    if (!data?.is_valid) {
      return { valid: false, scopes: [], error: data?.error?.message ?? "Token אינו תקף." };
    }
    const expiresAt = data.expires_at ? new Date(data.expires_at * 1000).toISOString() : undefined;
    return { valid: true, scopes: Array.isArray(data.scopes) ? data.scopes : [], expiresAt };
  } catch (e) {
    return { valid: false, scopes: [], error: e instanceof Error ? e.message : "Validation failed" };
  }
}

// ── Campaigns ─────────────────────────────────────────────────────────────────

export async function listActiveMetaAdsCampaigns(
  config: MetaAdsConfig,
  datePreset = "last_7d"
): Promise<MetaAdsCampaignVm[]> {
  const adAccountId = normalizeAdAccountId(config.adAccountId);
  if (!adAccountId.trim()) throw new Error("חסר Ad Account ID.");
  if (!config.accessToken.trim()) throw new Error("חסר Access Token.");

  const fields =
    "id,name,status,effective_status,objective,daily_budget,lifetime_budget,start_time,stop_time,updated_time," +
    "insights.date_preset(" +
    datePreset +
    "){spend,impressions,reach,inline_link_clicks,inline_link_click_ctr,cost_per_inline_link_click,actions}";
  const query = new URLSearchParams({
    fields,
    limit: "200",
    effective_status: JSON.stringify(["ACTIVE", "PAUSED", "PENDING_REVIEW", "IN_PROCESS"]),
  });

  const json = await callMetaGraph<{ data?: MetaCampaignNode[] }>(
    config,
    `/act_${adAccountId}/campaigns`,
    query
  );
  const rows = Array.isArray(json.data) ? json.data : [];
  return rows
    .filter((r) => r.id)
    .map((r) => {
      const insight = r.insights?.data?.[0];
      return {
        id: (r.id ?? "").trim(),
        name: (r.name ?? "").trim() || "ללא שם",
        status: (r.status ?? "").trim() || "UNKNOWN",
        effectiveStatus: (r.effective_status ?? "").trim() || "UNKNOWN",
        objective: (r.objective ?? "").trim() || "",
        spend: toNum(insight?.spend),
        impressions: toInt(insight?.impressions),
        reach: toInt(insight?.reach),
        clicks: toInt(insight?.inline_link_clicks),
        cpc: toNum(insight?.cost_per_inline_link_click),
        ctr: toNum(insight?.inline_link_click_ctr),
        dailyBudget: budgetToCurrency(r.daily_budget),
        lifetimeBudget: budgetToCurrency(r.lifetime_budget),
        results: extractResults(insight?.actions),
        startTime: r.start_time?.trim() || undefined,
        stopTime: r.stop_time?.trim() || undefined,
        updatedTime: r.updated_time?.trim() || undefined,
      };
    })
    .sort((a, b) => b.spend - a.spend || b.impressions - a.impressions);
}

// ── Ad Sets ───────────────────────────────────────────────────────────────────

export async function listAdSets(
  config: MetaAdsConfig,
  datePreset = "last_7d"
): Promise<MetaAdSetVm[]> {
  const adAccountId = normalizeAdAccountId(config.adAccountId);
  if (!adAccountId.trim()) throw new Error("חסר Ad Account ID.");

  const fields =
    "id,name,status,effective_status,campaign_id,campaign{name},daily_budget,lifetime_budget,optimization_goal," +
    "insights.date_preset(" +
    datePreset +
    "){spend,impressions,reach,inline_link_clicks,inline_link_click_ctr,cost_per_inline_link_click,cpm,actions}";
  const query = new URLSearchParams({
    fields,
    limit: "200",
    effective_status: JSON.stringify(["ACTIVE", "PAUSED", "PENDING_REVIEW", "IN_PROCESS"]),
  });

  const json = await callMetaGraph<{ data?: MetaAdSetNode[] }>(
    config,
    `/act_${adAccountId}/adsets`,
    query
  );
  const rows = Array.isArray(json.data) ? json.data : [];
  return rows
    .filter((r) => r.id)
    .map((r) => {
      const insight = r.insights?.data?.[0];
      return {
        id: (r.id ?? "").trim(),
        name: (r.name ?? "").trim() || "ללא שם",
        status: (r.status ?? "").trim() || "UNKNOWN",
        effectiveStatus: (r.effective_status ?? "").trim() || "UNKNOWN",
        campaignId: (r.campaign_id ?? "").trim(),
        campaignName: (r.campaign?.name ?? "").trim(),
        optimizationGoal: (r.optimization_goal ?? "").trim(),
        spend: toNum(insight?.spend),
        impressions: toInt(insight?.impressions),
        reach: toInt(insight?.reach),
        clicks: toInt(insight?.inline_link_clicks),
        cpc: toNum(insight?.cost_per_inline_link_click),
        ctr: toNum(insight?.inline_link_click_ctr),
        cpm: toNum(insight?.cpm),
        dailyBudget: budgetToCurrency(r.daily_budget),
        lifetimeBudget: budgetToCurrency(r.lifetime_budget),
        results: extractResults(insight?.actions),
      };
    })
    .sort((a, b) => b.spend - a.spend);
}

// ── Ads ───────────────────────────────────────────────────────────────────────

export async function listAds(
  config: MetaAdsConfig,
  datePreset = "last_7d"
): Promise<MetaAdVm[]> {
  const adAccountId = normalizeAdAccountId(config.adAccountId);
  if (!adAccountId.trim()) throw new Error("חסר Ad Account ID.");

  const fields =
    "id,name,status,effective_status,adset_id,adset{name},campaign_id,campaign{name}," +
    "insights.date_preset(" +
    datePreset +
    "){spend,impressions,reach,inline_link_clicks,inline_link_click_ctr,cost_per_inline_link_click,actions}";
  const query = new URLSearchParams({
    fields,
    limit: "200",
    effective_status: JSON.stringify(["ACTIVE", "PAUSED", "PENDING_REVIEW", "IN_PROCESS"]),
  });

  const json = await callMetaGraph<{ data?: MetaAdNode[] }>(
    config,
    `/act_${adAccountId}/ads`,
    query
  );
  const rows = Array.isArray(json.data) ? json.data : [];
  return rows
    .filter((r) => r.id)
    .map((r) => {
      const insight = r.insights?.data?.[0];
      return {
        id: (r.id ?? "").trim(),
        name: (r.name ?? "").trim() || "ללא שם",
        status: (r.status ?? "").trim() || "UNKNOWN",
        effectiveStatus: (r.effective_status ?? "").trim() || "UNKNOWN",
        adSetId: (r.adset_id ?? "").trim(),
        adSetName: (r.adset?.name ?? "").trim(),
        campaignId: (r.campaign_id ?? "").trim(),
        campaignName: (r.campaign?.name ?? "").trim(),
        spend: toNum(insight?.spend),
        impressions: toInt(insight?.impressions),
        reach: toInt(insight?.reach),
        clicks: toInt(insight?.inline_link_clicks),
        cpc: toNum(insight?.cost_per_inline_link_click),
        ctr: toNum(insight?.inline_link_click_ctr),
        results: extractResults(insight?.actions),
      };
    })
    .sort((a, b) => b.spend - a.spend);
}
