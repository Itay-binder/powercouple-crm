import { NextRequest, NextResponse } from "next/server";
import { requireApprovedUser } from "@/lib/auth/guard";
import { assertMovingOrdersWorkspace } from "@/lib/movingOrders/guard";
import { enqueueMatchSendFollowupWebhook } from "@/lib/movingOrders/matchSendFollowupWebhook";
import { applyMatchSendSideEffects } from "@/lib/movingOrders/matchOrderActions";
import { postMatchSendWebhookForDrivers } from "@/lib/movingOrders/postMatchSendWebhook";
import { getMovingOrder, updateMovingOrder } from "@/lib/movingOrders/repo";
import type { MovingOrderRecord } from "@/lib/movingOrders/types";

export const dynamic = "force-dynamic";
export const revalidate = 0;

function orderCustomerName(order: MovingOrderRecord): string {
  const cv = order.customValues ?? {};
  const n = cv.moving_order_name;
  if (typeof n === "string" && n.trim()) return n.trim();
  return order.payload.name?.trim() || order.orderId;
}

function driverBelongsToOrder(order: MovingOrderRecord, driverId: string): boolean {
  const allowed = new Set([
    ...order.matchedDriverIds,
    ...order.optionalDriverIds,
    ...order.manualDriverIds,
  ]);
  return allowed.has(driverId);
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

  let driverId = "";
  try {
    const body = (await req.json().catch(() => ({}))) as { driverId?: unknown };
    driverId = typeof body.driverId === "string" ? body.driverId.trim() : "";
  } catch {
    driverId = "";
  }

  if (!driverId) {
    return NextResponse.json({ ok: false, error: "חסר מזהה מוביל" }, { status: 400 });
  }

  if (!driverBelongsToOrder(order, driverId)) {
    return NextResponse.json({ ok: false, error: "מוביל לא שייך להזמנה זו" }, { status: 400 });
  }

  const webhookOk = await postMatchSendWebhookForDrivers(g.db, order, [driverId], false);
  if (!webhookOk) {
    return NextResponse.json({ ok: false, error: "לא נמצא ליד למוביל או שליחת הוובהוק נכשלה" }, { status: 400 });
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
    contactIds: [driverId],
    orderCustomerName: on,
    orderId: order.orderId,
    transportNoteLines,
  });

  await enqueueMatchSendFollowupWebhook({
    db: g.db,
    movingOrderId: id,
    orderId: order.orderId,
    driverIds: [driverId],
    notifyCustomer: false,
  });

  await updateMovingOrder(id, { appendSentMatchDriverIds: [driverId] }, g.db);

  return NextResponse.json({
    ok: true,
    webhookPosted: webhookOk,
  });
}
