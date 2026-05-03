import { NextRequest, NextResponse } from "next/server";
import { requireApprovedUser } from "@/lib/auth/guard";
import { createdAtInYmdRange } from "@/lib/datetime/ymdBoundary";
import { listPropertyDeals } from "@/lib/deals/repo";
import type { PropertyDealRecord } from "@/lib/deals/repo";
import {
  ensureDefaultPipeline,
  getPayingCustomersPipelineId,
  getPayingCustomersPipelineMeta,
  listOpportunities,
} from "@/lib/opportunities/repo";
import type { OpportunityRecord } from "@/lib/opportunities/repo";

export const dynamic = "force-dynamic";
export const revalidate = 0;

type ApiOk = {
  ok: true;
  /** הזדמנויות בחלון (כל הפייפליינים) */
  opportunityCount: number;
  /** utm_source → ספירת הזדמנויות בחלון */
  leadsByUtmSource: Record<string, number>;
  payingCustomersPipelineId: string;
  payingCustomersPipelineName: string;
  /** הזדמנויות בפייפליין לקוחות משלמים שנוצרו בחלון */
  payingCustomersInRangeCount: number;
  /** utm_source → ספירה בפייפליין לקוחות משלמים בחלון */
  payingCustomersByUtmSource: Record<string, number>;
  /** לקוחות משלמים עם סטטוס פתוח (לא מסונן לפי תאריכים) */
  payingCustomersOpenCount: number;
  /** עסקות נדל״ן — נוצרו בטווח התאריכים, לפי סטטוס נוכחי */
  propertyDealsOpenCount: number;
  propertyDealsPurchaseCount: number;
  propertyDealsSoldCount: number;
  /** Power Couple — פייפליין מכירות */
  salesPipelineId: string;
  salesPipelineName: string;
  salesStageCounts: Record<string, number>;
};
type ApiErr = { ok: false; error: string };

function normalizeUtmKey(raw: string | undefined): string {
  const s = (raw ?? "").trim();
  return s || "—";
}

function opportunitiesInDateRange(
  opps: OpportunityRecord[],
  dateFrom?: string | null,
  dateTo?: string | null
): OpportunityRecord[] {
  const from = dateFrom?.trim();
  const to = dateTo?.trim();
  if (!from && !to) return opps;
  return opps.filter((o) => createdAtInYmdRange(o.createdAt, from, to));
}

function countByUtm(opps: OpportunityRecord[]): Record<string, number> {
  const out: Record<string, number> = {};
  for (const o of opps) {
    const k = normalizeUtmKey(o.utmSource);
    out[k] = (out[k] ?? 0) + 1;
  }
  return out;
}

function isPayingCustomerOpen(o: OpportunityRecord): boolean {
  return !o.status || o.status === "פתוח";
}

/** סיווג סטטוס עסקת נדל״ן לפי ערכי המערכת */
function propertyDealBucket(status: string | undefined): "open" | "purchase" | "sold" | "ignore" {
  const t = (status ?? "").trim();
  if (t === "נמכר") return "sold";
  if (t === "סיום רכישה") return "purchase";
  if (t === "בהתאמה" || t === "נחתם" || !t) return "open";
  return "ignore";
}

function countPropertyDealsInRange(
  deals: PropertyDealRecord[],
  dateFrom?: string | null,
  dateTo?: string | null
): { open: number; purchase: number; sold: number } {
  let open = 0;
  let purchase = 0;
  let sold = 0;
  for (const d of deals) {
    if (!createdAtInYmdRange(d.createdAt, dateFrom, dateTo)) continue;
    const b = propertyDealBucket(d.status);
    if (b === "open") open++;
    else if (b === "purchase") purchase++;
    else if (b === "sold") sold++;
  }
  return { open, purchase, sold };
}

export async function GET(req: NextRequest) {
  const auth = await requireApprovedUser(req);
  if (!auth.ok) return NextResponse.json({ ok: false, error: auth.error } satisfies ApiErr, { status: auth.status });

  const dateFrom = req.nextUrl.searchParams.get("date_from");
  const dateTo = req.nextUrl.searchParams.get("date_to");

  try {
    const [payingPipelineId, payingMeta, allOpportunities, salesPipeline, allDeals] = await Promise.all([
      getPayingCustomersPipelineId(),
      getPayingCustomersPipelineMeta(),
      listOpportunities(),
      ensureDefaultPipeline(),
      listPropertyDeals(),
    ]);

    const salesOpps = allOpportunities.filter((o) => o.pipelineId === salesPipeline.id);
    const salesStageCounts: Record<string, number> = {};
    for (const s of salesPipeline.stages) salesStageCounts[s] = 0;
    for (const o of salesOpps) {
      const k = o.stage || "—";
      salesStageCounts[k] = (salesStageCounts[k] ?? 0) + 1;
    }

    const inRangeAll = opportunitiesInDateRange(allOpportunities, dateFrom, dateTo);
    const payingAll = allOpportunities.filter((o) => o.pipelineId === payingPipelineId);
    const payingInRange = opportunitiesInDateRange(payingAll, dateFrom, dateTo);
    const payingOpen = payingAll.filter(isPayingCustomerOpen);

    const leadsByUtmSource = countByUtm(inRangeAll);
    const payingCustomersByUtmSource = countByUtm(payingInRange);

    const dealBuckets = countPropertyDealsInRange(allDeals, dateFrom, dateTo);

    const payload: ApiOk = {
      ok: true,
      opportunityCount: inRangeAll.length,
      leadsByUtmSource,
      payingCustomersPipelineId: payingPipelineId,
      payingCustomersPipelineName: payingMeta.name,
      payingCustomersInRangeCount: payingInRange.length,
      payingCustomersByUtmSource,
      payingCustomersOpenCount: payingOpen.length,
      propertyDealsOpenCount: dealBuckets.open,
      propertyDealsPurchaseCount: dealBuckets.purchase,
      propertyDealsSoldCount: dealBuckets.sold,
      salesPipelineId: salesPipeline.id,
      salesPipelineName: salesPipeline.name,
      salesStageCounts,
    };
    return NextResponse.json(payload);
  } catch (e) {
    const message = e instanceof Error ? e.message : "Unknown error";
    return NextResponse.json({ ok: false, error: message } satisfies ApiErr, { status: 500 });
  }
}
