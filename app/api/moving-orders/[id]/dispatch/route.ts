import { NextRequest, NextResponse } from "next/server";
import { requireApprovedUser } from "@/lib/auth/guard";
import { getLeadById } from "@/lib/leads/repo";
import { assertMovingOrdersWorkspace } from "@/lib/movingOrders/guard";
import { enqueueMatchSendFollowupWebhook } from "@/lib/movingOrders/matchSendFollowupWebhook";
import { getMovingOrder, updateMovingOrder } from "@/lib/movingOrders/repo";
import { MOVING_ORDER_STAGES } from "@/lib/movingOrders/pipelineConstants";
import type { MovingOrderRecord } from "@/lib/movingOrders/types";
import { postWebhookForEvent } from "@/lib/webhooks/dispatchServerWebhooks";

export const dynamic = "force-dynamic";
export const revalidate = 0;

function defaultSelectedIds(order: MovingOrderRecord): string[] {
  const all = [
    ...new Set([...order.matchedDriverIds, ...order.optionalDriverIds, ...order.manualDriverIds]),
  ];
  const ex = new Set(order.excludedDriverIds);
  return all.filter((x) => !ex.has(x));
}

export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const auth = await requireApprovedUser(req);
  if (!auth.ok) {
    return NextResponse.json({ ok: false, error: auth.error }, { status: auth.status });
  }

  const g = await assertMovingOrdersWorkspace();
  if (!g.ok) {
    return NextResponse.json({ ok: false, error: g.error }, { status: g.status });
  }

  const { id } = await params;
  const order = await getMovingOrder(id, g.db);
  if (!order) {
    return NextResponse.json({ ok: false, error: "לא נמצא" }, { status: 404 });
  }

  if (order.status === "cancelled") {
    return NextResponse.json({ ok: false, error: "הזמנה בוטלה" }, { status: 400 });
  }
  if (order.status === "completed") {
    return NextResponse.json({ ok: false, error: "הזמנה כבר סומנה כבוצעה" }, { status: 400 });
  }

  let driverIds: string[];
  try {
    const body = (await req.json().catch(() => ({}))) as { driverIds?: unknown };
    driverIds = Array.isArray(body.driverIds)
      ? body.driverIds.map((x) => String(x)).filter(Boolean)
      : defaultSelectedIds(order);
  } catch {
    driverIds = defaultSelectedIds(order);
  }

  if (driverIds.length === 0) {
    return NextResponse.json({ ok: false, error: "לא נבחרו מובילים" }, { status: 400 });
  }

  const movers = [];
  for (const did of driverIds) {
    const lead = await getLeadById(did);
    if (lead) {
      movers.push({
        id: lead.id,
        name: lead.name ?? "",
        phone: lead.phone ?? "",
        email: lead.email ?? "",
        stage: lead.stage,
        pipelineId: lead.pipelineId ?? "",
      });
    }
  }

  const webhookOk = await postWebhookForEvent(g.db, "moving_order_dispatch", {
    movingOrderId: order.id,
    order: order.payload,
    movers,
  });

  const dispatchedAt = new Date().toISOString();
  await enqueueMatchSendFollowupWebhook({
    db: g.db,
    movingOrderId: id,
    orderId: order.orderId,
    driverIds,
    notifyCustomer: false,
    sentAt: dispatchedAt,
  });
  const updated = await updateMovingOrder(
    id,
    { stage: MOVING_ORDER_STAGES[1], dispatchedAt },
    g.db
  );

  return NextResponse.json({
    ok: true,
    webhookPosted: webhookOk,
    order: updated,
  });
}
