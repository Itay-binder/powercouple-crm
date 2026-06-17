import { NextRequest, NextResponse } from "next/server";
import { requireApprovedUser } from "@/lib/auth/guard";
import { assertMovingOrdersWorkspace } from "@/lib/movingOrders/guard";
import { enqueueMatchSendFollowupWebhook } from "@/lib/movingOrders/matchSendFollowupWebhook";
import { applyMatchSendSideEffects } from "@/lib/movingOrders/matchOrderActions";
import { postMatchSendWebhookForDrivers } from "@/lib/movingOrders/postMatchSendWebhook";
import { getMovingOrder, updateMovingOrder } from "@/lib/movingOrders/repo";
import { MOVING_ORDER_STAGES } from "@/lib/movingOrders/pipelineConstants";
import type { MovingOrderRecord } from "@/lib/movingOrders/types";

export const dynamic = "force-dynamic";
export const revalidate = 0;

function defaultSelectedIds(order: MovingOrderRecord): string[] {
  const all = [
    ...new Set([...order.matchedDriverIds, ...order.optionalDriverIds, ...order.manualDriverIds]),
  ];
  const ex = new Set(order.excludedDriverIds);
  return all.filter((x) => !ex.has(x));
}

function orderCustomerName(order: MovingOrderRecord): string {
  const cv = order.customValues ?? {};
  const n = cv.moving_order_name;
  if (typeof n === "string" && n.trim()) return n.trim();
  return order.payload.name?.trim() || order.orderId;
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

  if (order.status === "cancelled" || order.status === "rejected" || order.status === "completed") {
    return NextResponse.json({ ok: false, error: "הזמנה לא זמינה לשליחה" }, { status: 400 });
  }

  let driverIds: string[];
  let notifyCustomer = false;
  try {
    const body = (await req.json().catch(() => ({}))) as { driverIds?: unknown; notifyCustomer?: unknown };
    driverIds = Array.isArray(body.driverIds)
      ? body.driverIds.map((x) => String(x)).filter(Boolean)
      : defaultSelectedIds(order);
    notifyCustomer = body.notifyCustomer === true;
  } catch {
    driverIds = defaultSelectedIds(order);
  }

  if (driverIds.length === 0) {
    return NextResponse.json({ ok: false, error: "לא נבחרו מובילים" }, { status: 400 });
  }

  const alreadySent = new Set(order.sentMatchDriverIds ?? []);
  const newDriverIds = driverIds.filter((id2) => !alreadySent.has(id2));
  if (newDriverIds.length === 0) {
    return NextResponse.json({
      ok: true,
      webhookPosted: true,
      skipped: true,
      reason: "כל המובילים שנבחרו כבר קיבלו שליחה להזמנה זו.",
      order,
    });
  }

  const on = orderCustomerName(order);
  const pl = order.payload;
  const cv = order.customValues ?? {};
  const moveDate = String(cv.moving_order_date ?? pl.date ?? "").trim();
  const transportNoteLines = [
    pl.pickup?.trim() ? `איסוף: ${pl.pickup.trim()}` : "",
    pl.dropoff?.trim() ? `פריקה: ${pl.dropoff.trim()}` : "",
    moveDate ? `תאריך הובלה: ${moveDate}` : "",
    pl.move_type?.trim() ? `סוג הובלה: ${pl.move_type.trim()}` : "",
    pl.phone?.trim() ? `טלפון מזמין: ${pl.phone.trim()}` : "",
  ];
  await applyMatchSendSideEffects({
    contactIds: newDriverIds,
    orderCustomerName: on,
    orderId: order.orderId,
    transportNoteLines,
  });

  const webhookOk = await postMatchSendWebhookForDrivers(g.db, order, newDriverIds, notifyCustomer);

  const dispatchedAt = new Date().toISOString();
  await enqueueMatchSendFollowupWebhook({
    db: g.db,
    movingOrderId: id,
    orderId: order.orderId,
    driverIds: newDriverIds,
    notifyCustomer,
    sentAt: dispatchedAt,
  });
  const updated = await updateMovingOrder(
    id,
    { stage: MOVING_ORDER_STAGES[1], dispatchedAt, appendSentMatchDriverIds: newDriverIds },
    g.db
  );

  return NextResponse.json({
    ok: true,
    webhookPosted: webhookOk,
    order: updated,
  });
}
