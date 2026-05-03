import { NextRequest, NextResponse } from "next/server";
import { requireApprovedUser } from "@/lib/auth/guard";
import { getLeadById } from "@/lib/leads/repo";
import { assertMovingOrdersWorkspace } from "@/lib/movingOrders/guard";
import { createMovingOrderManual, listMovingOrders } from "@/lib/movingOrders/repo";
import { listOpportunities } from "@/lib/opportunities/repo";
import { getCityRegionMap } from "@/lib/movingOrders/cityRegionSettingsRepo";
import { PAYING_CUSTOMERS_PIPELINE_ID } from "@/lib/movingOrders/fieldIds";
import { driverIdsForOpportunitiesColumn } from "@/lib/movingOrders/driverIdsForOpportunityDisplay";
import {
  opportunitiesByContactId,
  orderTransportRegionDisplayTokens,
  resolveOrderCities,
  syntheticLeadFromOpportunity,
} from "@/lib/movingOrders/matchMovers";
import { buildMoverEnrichment } from "@/lib/movingOrders/moverFieldReaders";
import { hebrewWeekdayMovingOrder } from "@/lib/movingOrders/orderMoveDate";
import type {
  DriverSummary,
  MoverMatchEnrichment,
  MovingOrderRecord,
  OrderMatchUiHints,
  OrderMatchedOpportunitySummary,
} from "@/lib/movingOrders/types";

export const dynamic = "force-dynamic";
export const revalidate = 0;

export async function GET(req: NextRequest) {
  const auth = await requireApprovedUser(req);
  if (!auth.ok) {
    return NextResponse.json({ ok: false, error: auth.error }, { status: auth.status });
  }

  const g = await assertMovingOrdersWorkspace();
  if (!g.ok) {
    return NextResponse.json({ ok: false, error: g.error }, { status: g.status });
  }

  try {
    const pipelineId = req.nextUrl.searchParams.get("pipelineId")?.trim() || undefined;
    const orders = await listMovingOrders({ pipelineId: pipelineId ?? null, db: g.db });
    const idSet = new Set<string>();
    for (const o of orders) {
      for (const id of o.matchedDriverIds) idSet.add(id);
      for (const id of o.optionalDriverIds) idSet.add(id);
      for (const id of o.manualDriverIds) idSet.add(id);
      for (const id of o.sentMatchDriverIds ?? []) idSet.add(id);
    }
    const regionMap = await getCityRegionMap();
    const orderMatchUi: Record<string, OrderMatchUiHints> = {};
    for (const o of orders) {
      const cv = o.customValues ?? {};
      const { pickupCity, dropCity } = resolveOrderCities(o.payload, cv);
      const tokens = orderTransportRegionDisplayTokens(pickupCity, dropCity, regionMap);
      orderMatchUi[o.id] = {
        moveWeekdayHe: hebrewWeekdayMovingOrder(o.payload, cv),
        transportRegionsLine: tokens.length ? tokens.join(", ") : "",
        pickupCity: pickupCity.trim() || undefined,
        dropCity: dropCity.trim() || undefined,
      };
    }

    const opps = await listOpportunities(PAYING_CUSTOMERS_PIPELINE_ID);
    const oppByContact = opportunitiesByContactId(opps);
    const drivers: Record<string, DriverSummary> = {};
    const moverEnrichment: Record<string, MoverMatchEnrichment> = {};
    await Promise.all(
      [...idSet].map(async (cid) => {
        const opp = oppByContact.get(cid);
        let lead = await getLeadById(cid);
        if (!lead && opp) lead = syntheticLeadFromOpportunity(opp);
        if (!lead) return;
        drivers[cid] = {
          id: lead.id,
          name: lead.name,
          phone: lead.phone,
          email: lead.email,
        };
        moverEnrichment[cid] = buildMoverEnrichment(lead, opp);
      })
    );

    function appendOpportunityForDriver(
      driverId: string,
      seen: Set<string>,
      list: OrderMatchedOpportunitySummary[]
    ): void {
      const en = moverEnrichment[driverId];
      const oid = en?.opportunityId?.trim();
      const name =
        en?.opportunityName?.trim() || drivers[driverId]?.name?.trim() || driverId;
      if (oid) {
        const key = `o:${oid}`;
        if (seen.has(key)) return;
        seen.add(key);
        list.push({ id: oid, name, contactId: driverId });
        return;
      }
      const ckey = `c:${driverId}`;
      if (seen.has(ckey)) return;
      seen.add(ckey);
      list.push({ id: driverId, name, contactId: driverId, linkToContact: true });
    }

    const orderMatchedOpportunities: Record<string, OrderMatchedOpportunitySummary[]> = {};
    for (const o of orders) {
      const seen = new Set<string>();
      const list: OrderMatchedOpportunitySummary[] = [];
      for (const driverId of driverIdsForOpportunitiesColumn(o)) {
        appendOpportunityForDriver(driverId, seen, list);
      }
      orderMatchedOpportunities[o.id] = list;
    }

    return NextResponse.json({
      ok: true,
      orders,
      drivers,
      moverEnrichment,
      orderMatchUi,
      orderMatchedOpportunities,
    });
  } catch (e) {
    return NextResponse.json(
      { ok: false, error: e instanceof Error ? e.message : "Unknown error" },
      { status: 500 }
    );
  }
}

export async function POST(req: NextRequest) {
  const auth = await requireApprovedUser(req);
  if (!auth.ok) {
    return NextResponse.json({ ok: false, error: auth.error }, { status: auth.status });
  }

  const g = await assertMovingOrdersWorkspace();
  if (!g.ok) {
    return NextResponse.json({ ok: false, error: g.error }, { status: g.status });
  }

  let body: Record<string, unknown>;
  try {
    body = (await req.json()) as Record<string, unknown>;
  } catch {
    return NextResponse.json({ ok: false, error: "JSON לא תקין" }, { status: 400 });
  }

  const pipelineId = typeof body.pipelineId === "string" ? body.pipelineId.trim() : "";
  const stage = typeof body.stage === "string" ? body.stage.trim() : "";
  if (!pipelineId) {
    return NextResponse.json({ ok: false, error: "pipelineId נדרש" }, { status: 400 });
  }
  if (!stage) {
    return NextResponse.json({ ok: false, error: "stage נדרש" }, { status: 400 });
  }

  try {
    const order = await createMovingOrderManual(
      {
        pipelineId,
        stage,
        name: typeof body.name === "string" ? body.name : undefined,
        phone: typeof body.phone === "string" ? body.phone : undefined,
        pickup: typeof body.pickup === "string" ? body.pickup : undefined,
        dropoff: typeof body.dropoff === "string" ? body.dropoff : undefined,
        date: typeof body.date === "string" ? body.date : undefined,
        order_id: typeof body.order_id === "string" ? body.order_id : undefined,
      },
      g.db
    );
    return NextResponse.json({ ok: true, order });
  } catch (e) {
    return NextResponse.json(
      { ok: false, error: e instanceof Error ? e.message : "Unknown error" },
      { status: 400 }
    );
  }
}
