import { NextRequest, NextResponse } from "next/server";
import { requireApprovedUser } from "@/lib/auth/guard";
import { assertMovingOrdersWorkspace } from "@/lib/movingOrders/guard";
import { listMovingOrders } from "@/lib/movingOrders/repo";
import { getPayingCustomersPipelineId, listOpportunities } from "@/lib/opportunities/repo";
import { driverIdsForOpportunitiesColumn } from "@/lib/movingOrders/driverIdsForOpportunityDisplay";
import type { MovingOrderRecord } from "@/lib/movingOrders/types";
import type { OpportunityOrdersGroup, OrderByOpportunityRow } from "@/lib/movingOrders/opportunityOrdersView";

export const dynamic = "force-dynamic";
export const revalidate = 0;

function orderDisplayTitle(o: MovingOrderRecord): string {
  const cv = o.customValues ?? {};
  const fromCv = cv.moving_order_name ?? cv.moving_order_items_text;
  if (typeof fromCv === "string" && fromCv.trim()) return fromCv.trim().slice(0, 120);
  const pl = o.payload;
  const parts = [pl.items_text?.trim(), pl.move_type?.trim(), pl.name?.trim()].filter(Boolean);
  if (parts.length) return parts[0] as string;
  return pl.order_id || o.id;
}

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
    const payingPipelineId = await getPayingCustomersPipelineId();
    const [opportunities, orders] = await Promise.all([
      listOpportunities(payingPipelineId),
      listMovingOrders({ db: g.db }),
    ]);

    const contactToOrders = new Map<string, MovingOrderRecord[]>();
    for (const order of orders) {
      for (const cid of driverIdsForOpportunitiesColumn(order)) {
        const t = cid.trim();
        if (!t) continue;
        const arr = contactToOrders.get(t) ?? [];
        arr.push(order);
        contactToOrders.set(t, arr);
      }
    }

    const items: OpportunityOrdersGroup[] = opportunities
      .filter((opp) => (opp.contactId ?? "").trim())
      .map((opp) => {
        const contactId = opp.contactId.trim();
        const rawList = contactToOrders.get(contactId) ?? [];
        const seen = new Set<string>();
        const dedup: MovingOrderRecord[] = [];
        for (const o of rawList) {
          if (seen.has(o.id)) continue;
          seen.add(o.id);
          dedup.push(o);
        }
        dedup.sort((a, b) => {
          const ta = a.createdAt ? new Date(a.createdAt).getTime() : 0;
          const tb = b.createdAt ? new Date(b.createdAt).getTime() : 0;
          return tb - ta;
        });
        const name = (opp.name ?? "").trim() || opp.contactName?.trim() || "ללא שם";
        return {
          opportunityId: opp.id,
          opportunityName: name,
          contactId,
          orders: dedup.map((o) => ({
            id: o.id,
            orderId: o.orderId,
            displayName: orderDisplayTitle(o),
            status: o.status,
            createdAt: o.createdAt,
          })),
        };
      })
      .sort((a, b) => a.opportunityName.localeCompare(b.opportunityName, "he"));

    return NextResponse.json({ ok: true, items, payingPipelineId });
  } catch (e) {
    return NextResponse.json(
      { ok: false, error: e instanceof Error ? e.message : "Unknown error" },
      { status: 500 }
    );
  }
}
