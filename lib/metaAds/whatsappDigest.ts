import type { MetaAdsCampaignVm } from "@/lib/metaAds/graph";

function moneyShekels(v: number): string {
  return new Intl.NumberFormat("he-IL", { style: "currency", currency: "ILS" }).format(v || 0);
}

/** מסיר תווים ששוברים הדגשה ב-WhatsApp (*). */
function safeBoldSegment(s: string): string {
  return s.replace(/\*/g, " ").trim() || "ללא שם";
}

function sumDailyBudgetActiveShekels(active: MetaAdsCampaignVm[]): number {
  let sum = 0;
  for (const c of active) {
    if (c.dailyBudget > 0) sum += c.dailyBudget;
  }
  return sum;
}

export type BuildMetaWhatsAppDigestInput = {
  /** נתוני קמפיינים (אחרי insights לפי datePreset) */
  campaigns: MetaAdsCampaignVm[];
  /** הזמנות שנוצרו היום (ישראל) — רק אם מודול הזמנות מופעל; אחרת null */
  todayOrderRows?: { status: string }[] | null;
};

/**
 * טקסט לווטסאפ: *מודגש* (תו בודד) — פורמט המקובל ב-WhatsApp.
 * מציג קמפיינים עם effectiveStatus ACTIVE בלבד, ותוצאות המרה (results) — לא קליקים.
 */
export function buildMetaWhatsAppDigestText(input: BuildMetaWhatsAppDigestInput): string {
  const active = input.campaigns.filter((c) => (c.effectiveStatus || "").toUpperCase() === "ACTIVE");
  const totalDaily = sumDailyBudgetActiveShekels(active);

  const lines: string[] = [];
  lines.push("*סטטוס קמפיינים:*");
  lines.push("");

  if (active.length === 0) {
    lines.push("אין קמפיינים פעילים.");
  } else {
    for (const c of active) {
      const name = safeBoldSegment(c.name);
      const n = c.results > 0 ? c.results : 0;
      lines.push(
        `*${name}* — תוצאות המרה: *${n.toLocaleString("he-IL")}*`
      );
    }
  }

  lines.push("");
  lines.push("*התקציב היומי:*");
  lines.push(moneyShekels(totalDaily));

  lines.push("");
  lines.push("*כמות הזמנות יומיות מאושרות:*");
  if (input.todayOrderRows == null) {
    lines.push("—");
  } else {
    const approved = input.todayOrderRows.filter(
      (o) => o.status === "dispatched" || o.status === "completed"
    ).length;
    lines.push(approved.toLocaleString("he-IL"));
  }

  return lines.join("\n");
}
