import type { Firestore } from "firebase-admin/firestore";
import { getGreenApiConfig } from "@/lib/whatsapp/repo";
import { sendTextMessageViaGreenApi } from "@/lib/whatsapp/greenapi";
import { getMetaAdsConfig } from "@/lib/metaAds/repo";
import { listActiveMetaAdsCampaignsWithCurrency, type MetaAdsCampaignVm } from "@/lib/metaAds/graph";
import { listRecentMovingOrders } from "@/lib/movingOrders/repo";
import type { MovingOrderRecord } from "@/lib/movingOrders/types";
import { createdAtYmdInIsrael, israelCalendarYmd } from "@/lib/cron/israelYmd";
import { countLeadsCreatedInIsraelDay } from "@/lib/leads/repo";

export type MetaAdsOrdersDigestResult = {
  ok: boolean;
  error?: string;
  skipped?: string;
  /** יעד ווצאפ (ספרות בלבד) */
  targetPhone?: string;
  messagesSent?: number;
  /** סיכום מטא — "today" לפי מטא */
  metaDatePreset?: string;
  /** סיכום הזמנות — לפי תאריך יצירה בלוח שנה ישראל */
  ordersDayYmd?: string;
  campaignsCount?: number;
  totalSpend?: number;
  totalResults?: number;
  validOrdersCount?: number;
  leadsTodayCount?: number;
};

const DEFAULT_PHONE = "972526660006";
const WA_CHUNK = 3500;

function digitsOnly(raw: string): string {
  return raw.replace(/[^\d]/g, "");
}

function isCountableOrder(o: MovingOrderRecord): boolean {
  return o.status !== "cancelled" && o.status !== "rejected";
}

/** מסיר תווים ששוברים הדגשה ב-WhatsApp (*). */
function safeBoldSegment(s: string): string {
  return s.replace(/\*/g, " ").trim() || "ללא שם";
}

function formatMoney(v: number, currency: string): string {
  const ccy = currency.trim() || "ILS";
  try {
    return new Intl.NumberFormat("he-IL", { style: "currency", currency: ccy }).format(v || 0);
  } catch {
    return `${(v || 0).toFixed(2)} ${ccy}`;
  }
}

function buildDigestText(
  campaigns: MetaAdsCampaignVm[],
  currency: string,
  ordersCount: number,
  leadsCount: number
): string {
  const lines: string[] = [];
  const active = campaigns.filter((c) => (c.effectiveStatus || "").toUpperCase() === "ACTIVE");

  // Some campaigns use lifetime_budget instead of daily_budget — fall back to lifetime.
  const effectiveBudget = (c: MetaAdsCampaignVm) =>
    c.dailyBudget > 0 ? c.dailyBudget : c.lifetimeBudget;
  const totalBudget = active.reduce((s, c) => s + effectiveBudget(c), 0);

  lines.push("**תוצאות קמפיינים:**");
  lines.push("");
  lines.push("**סה״כ תקציב:**");
  lines.push(formatMoney(totalBudget, currency));
  lines.push("");
  lines.push("**קמפיינים פעילים ותקציב:**");
  if (active.length) {
    for (const c of active) {
      const budget = effectiveBudget(c);
      const budgetLabel = c.dailyBudget > 0 ? "" : " (lifetime)";
      lines.push(`${safeBoldSegment(c.name)}: ${formatMoney(budget, currency)}${budgetLabel}`);
    }
  }
  lines.push("");
  lines.push("**תוצאות לפי מטא:**");
  if (campaigns.length) {
    for (const c of campaigns) {
      const name = safeBoldSegment(c.name);
      const r = c.results > 0 ? c.results : 0;
      const cpr = r > 0 ? formatMoney(c.spend / r, currency) : "—";
      lines.push(`**${name}:** ${r}, ${cpr}`);
    }
  }
  lines.push("");
  lines.push("**הזמנות היום:**");
  lines.push(String(ordersCount));
  lines.push("");
  lines.push("**לידים היום:**");
  lines.push(String(leadsCount));

  return lines.join("\n");
}

function chunkForWhatsApp(full: string): string[] {
  const t = full.trim();
  if (!t) return [];
  if (t.length <= WA_CHUNK) return [t];
  const total = Math.ceil(t.length / WA_CHUNK);
  const parts: string[] = [];
  for (let i = 0; i < total; i += 1) {
    const piece = t.slice(i * WA_CHUNK, (i + 1) * WA_CHUNK);
    parts.push(total > 1 ? `[${i + 1}/${total}]\n${piece}` : piece);
  }
  return parts;
}

export async function runMetaAdsOrdersDigestWhatsApp(input: {
  db: Firestore;
  /** מספר יעד בינלאומי, ספרות בלבד */
  targetPhone?: string;
  /** מקסימום מסמכי הזמנה לסריקה (ברירת מחדל 2500) */
  movingOrdersMaxFetch?: number;
  dryRun?: boolean;
}): Promise<MetaAdsOrdersDigestResult> {
  const targetPhone = digitsOnly(input.targetPhone?.trim() || process.env.DIGEST_WHATSAPP_PHONE || DEFAULT_PHONE);
  if (!targetPhone) {
    return { ok: false, error: "חסר מספר יעד (DIGEST_WHATSAPP_PHONE)." };
  }

  const maxFetch = Math.min(
    8000,
    Math.max(200, Number.parseInt(String(input.movingOrdersMaxFetch ?? process.env.DIGEST_MOVING_ORDERS_MAX_FETCH ?? "2500"), 10) || 2500)
  );

  const ordersDayYmd = israelCalendarYmd();

  const [green, metaCfg, orders, leadsToday] = await Promise.all([
    getGreenApiConfig(input.db),
    getMetaAdsConfig(input.db),
    listRecentMovingOrders({ db: input.db, maxFetch }),
    countLeadsCreatedInIsraelDay(ordersDayYmd, { maxFetch, db: input.db }),
  ]);

  if (!green?.instanceId?.trim() || !green?.apiTokenInstance?.trim()) {
    return { ok: false, error: "GreenAPI לא מוגדר (integrationSettings/greenApiConfig).", targetPhone };
  }

  let campaigns: MetaAdsCampaignVm[] = [];
  let currency = "ILS";

  if (metaCfg?.adAccountId?.trim() && metaCfg?.accessToken?.trim()) {
    try {
      const { rows, currency: c } = await listActiveMetaAdsCampaignsWithCurrency(metaCfg, "today");
      campaigns = rows;
      currency = c;
    } catch (e) {
      return {
        ok: false,
        error: e instanceof Error ? e.message : "Meta Ads fetch failed",
        targetPhone,
        ordersDayYmd,
      };
    }
  }

  const validOrders = orders.filter(
    (o) => createdAtYmdInIsrael(o.createdAt) === ordersDayYmd && isCountableOrder(o)
  );

  const body = buildDigestText(campaigns, currency, validOrders.length, leadsToday);

  if (input.dryRun) {
    return {
      ok: true,
      skipped: "dryRun",
      targetPhone,
      metaDatePreset: "today",
      ordersDayYmd,
      campaignsCount: campaigns.length,
      totalSpend: campaigns.reduce((s, c) => s + c.spend, 0),
      totalResults: campaigns.reduce((s, c) => s + c.results, 0),
      validOrdersCount: validOrders.length,
      leadsTodayCount: leadsToday,
    };
  }

  const chunks = chunkForWhatsApp(body);
  let sent = 0;
  for (const chunk of chunks) {
    await sendTextMessageViaGreenApi(green, { phone: targetPhone, text: chunk });
    sent += 1;
  }

  return {
    ok: true,
    targetPhone,
    messagesSent: sent,
    metaDatePreset: "today",
    ordersDayYmd,
    campaignsCount: campaigns.length,
    totalSpend: campaigns.reduce((s, c) => s + c.spend, 0),
    totalResults: campaigns.reduce((s, c) => s + c.results, 0),
    validOrdersCount: validOrders.length,
    leadsTodayCount: leadsToday,
  };
}
