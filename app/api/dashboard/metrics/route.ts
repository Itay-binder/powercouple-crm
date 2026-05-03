import { NextRequest, NextResponse } from "next/server";
import { requireApprovedUser } from "@/lib/auth/guard";
import { createdAtInYmdRange } from "@/lib/datetime/ymdBoundary";
import { listLeadsFiltered } from "@/lib/leads/repo";
import { listMovingOrders } from "@/lib/movingOrders/repo";
import { assertMovingOrdersWorkspace } from "@/lib/movingOrders/guard";
import { getCityRegionRows } from "@/lib/movingOrders/cityRegionSettingsRepo";
import {
  ensureDefaultPipeline,
  getPayingCustomersPipelineId,
  getPayingCustomersPipelineMeta,
  listOpportunities,
} from "@/lib/opportunities/repo";
import { MOVER_OPPORTUNITY_FIELD_IDS } from "@/lib/movingOrders/fieldIds";
import type { OpportunityRecord } from "@/lib/opportunities/repo";
import {
  leadIsMoverPoolMember,
  mergeLeadAndOpportunity,
  moverIsNationwide,
  normHe,
  readMoverRegionsText,
} from "@/lib/movingOrders/moverFieldReaders";

export const dynamic = "force-dynamic";
export const revalidate = 0;

type ApiOk = {
  ok: true;
  /** הזדמנויות בחלון (כל הפייפליינים) */
  opportunityCount: number;
  /** הזמנות בחלון */
  ordersCount: number;
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
  /** מוביל → ערך opportunity_leads_count (כמו בעמודת הפייפליין); פעיל = סטטוס פתוח */
  ordersPerMover: Array<{
    opportunityId: string;
    opportunityName: string;
    orderCount: number;
    isActive: boolean;
  }>;
  activeMoversByRegion: Array<{
    region: string;
    activeMoversCount: number;
    drivers: Array<{
      contactId: string;
      name: string;
      phone: string;
      opportunityId: string;
      opportunityName: string;
    }>;
  }>;
  movingOrdersWorkspace: boolean;
  /** Power Couple — פייפליין מכירות */
  salesPipelineId: string;
  salesPipelineName: string;
  salesStageCounts: Record<string, number>;
  warning?: string;
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

/** ערך מספרי לשדה opportunity_leads_count (כמו בעמודת הפייפליין). */
function parseOpportunityLeadsCount(opp: OpportunityRecord): number {
  const key = MOVER_OPPORTUNITY_FIELD_IDS.leadsCount;
  const v = opp.customValues?.[key];
  if (typeof v === "number" && Number.isFinite(v)) return Math.max(0, Math.floor(v));
  if (typeof v === "string" && v.trim()) {
    const digits = v.trim().replace(/[^\d]/g, "");
    if (!digits) return 0;
    const n = Number.parseInt(digits, 10);
    if (Number.isFinite(n) && n >= 0) return n;
  }
  return 0;
}

function buildOrdersPerMover(payingOpportunities: OpportunityRecord[]): Array<{
  opportunityId: string;
  opportunityName: string;
  orderCount: number;
  isActive: boolean;
}> {
  const byCountThenName = (
    a: { orderCount: number; opportunityName: string },
    b: { orderCount: number; opportunityName: string }
  ) => b.orderCount - a.orderCount || a.opportunityName.localeCompare(b.opportunityName, "he");

  const rows = payingOpportunities
    .filter((opp) => (opp.contactId ?? "").trim())
    .map((opp) => {
      const name = (opp.name ?? "").trim() || opp.contactName?.trim() || "ללא שם";
      return {
        opportunityId: opp.id,
        opportunityName: name,
        orderCount: parseOpportunityLeadsCount(opp),
        isActive: isPayingCustomerOpen(opp),
      };
    });

  rows.sort((a, b) => {
    if (a.isActive !== b.isActive) return a.isActive ? -1 : 1;
    return byCountThenName(a, b);
  });
  return rows;
}

function normNoSpaces(s: string): string {
  return normHe(s).replace(/\s+/g, "");
}

function regionTokenMatch(regionsText: string, regionLabel: string): boolean {
  const a = normNoSpaces(regionsText);
  const b = normNoSpaces(regionLabel);
  if (a.length < 2 || b.length < 2) return false;
  return a.includes(b);
}

function buildActiveMoversByRegion(params: {
  payingOpportunities: OpportunityRecord[];
  allLeads: Awaited<ReturnType<typeof listLeadsFiltered>>;
  allRegions: string[];
}): ApiOk["activeMoversByRegion"] {
  const { payingOpportunities, allLeads, allRegions } = params;
  const out = new Map<
    string,
    Map<
      string,
      {
        contactId: string;
        name: string;
        phone: string;
        opportunityId: string;
        opportunityName: string;
      }
    >
  >();
  for (const region of allRegions) out.set(region, new Map());

  const leadById = new Map(allLeads.map((l) => [l.id, l]));

  for (const opp of payingOpportunities) {
    if (!isPayingCustomerOpen(opp)) continue;
    const contactId = (opp.contactId ?? "").trim();
    if (!contactId) continue;
    const lead = leadById.get(contactId);
    if (!lead) continue;
    if (!leadIsMoverPoolMember(lead)) continue;

    const merged = mergeLeadAndOpportunity(lead, opp);
    const regionsText = readMoverRegionsText(merged);
    const nationwide = moverIsNationwide(merged, regionsText);

    const driverRow = {
      contactId,
      name: (lead.name ?? opp.contactName ?? opp.name ?? "").trim() || "ללא שם",
      phone: (lead.phone ?? opp.contactPhone ?? opp.phone ?? "").trim(),
      opportunityId: opp.id,
      opportunityName: (opp.name ?? opp.contactName ?? "").trim() || "ללא שם",
    };

    for (const region of allRegions) {
      if (!region.trim()) continue;
      if (!nationwide && !regionTokenMatch(regionsText, region)) continue;
      const bucket = out.get(region);
      if (!bucket) continue;
      bucket.set(contactId, driverRow);
    }
  }

  return allRegions.map((region) => {
    const rows = Array.from(out.get(region)?.values() ?? []);
    rows.sort((a, b) => a.name.localeCompare(b.name, "he"));
    return {
      region,
      activeMoversCount: rows.length,
      drivers: rows,
    };
  });
}

export async function GET(req: NextRequest) {
  const auth = await requireApprovedUser(req);
  if (!auth.ok) return NextResponse.json({ ok: false, error: auth.error } satisfies ApiErr, { status: auth.status });

  const dateFrom = req.nextUrl.searchParams.get("date_from");
  const dateTo = req.nextUrl.searchParams.get("date_to");

  try {
    const [payingPipelineId, payingMeta, allOpportunities, allLeads, cityRegionRows, salesPipeline] =
      await Promise.all([
        getPayingCustomersPipelineId(),
        getPayingCustomersPipelineMeta(),
        listOpportunities(),
        listLeadsFiltered(),
        getCityRegionRows(),
        ensureDefaultPipeline(),
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

    let ordersCount = 0;
    let movingOrdersWorkspace = false;
    let warning: string | undefined;

    const ordersPerMover = buildOrdersPerMover(payingAll);
    const allRegions = Array.from(
      new Set(cityRegionRows.map((r) => String(r.region ?? "").trim()).filter(Boolean))
    ).sort((a, b) => a.localeCompare(b, "he"));
    const activeMoversByRegion = buildActiveMoversByRegion({
      payingOpportunities: payingAll,
      allLeads,
      allRegions,
    });

    const g = await assertMovingOrdersWorkspace();
    if (g.ok) {
      movingOrdersWorkspace = true;
      const orders = await listMovingOrders({
        db: g.db,
        dateFrom,
        dateTo,
        maxFetch: 10000,
        resultLimit: null,
      });
      ordersCount = orders.length;
    } else if (g.status !== 403) {
      warning = g.error;
    }

    const payload: ApiOk = {
      ok: true,
      opportunityCount: inRangeAll.length,
      ordersCount,
      leadsByUtmSource,
      payingCustomersPipelineId: payingPipelineId,
      payingCustomersPipelineName: payingMeta.name,
      payingCustomersInRangeCount: payingInRange.length,
      payingCustomersByUtmSource,
      payingCustomersOpenCount: payingOpen.length,
      ordersPerMover,
      activeMoversByRegion,
      movingOrdersWorkspace,
      salesPipelineId: salesPipeline.id,
      salesPipelineName: salesPipeline.name,
      salesStageCounts,
      ...(warning ? { warning } : {}),
    };
    return NextResponse.json(payload);
  } catch (e) {
    const message = e instanceof Error ? e.message : "Unknown error";
    return NextResponse.json({ ok: false, error: message } satisfies ApiErr, { status: 500 });
  }
}
