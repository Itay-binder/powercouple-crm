import { NextRequest, NextResponse } from "next/server";
import { requireApprovedUser } from "@/lib/auth/guard";
import { assertMovingOrdersWorkspace } from "@/lib/movingOrders/guard";
import { getMovingOrder, updateMovingOrder } from "@/lib/movingOrders/repo";
import { postWebhookForEvent } from "@/lib/webhooks/dispatchServerWebhooks";

export const dynamic = "force-dynamic";
export const revalidate = 0;

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

  let reason = "";
  try {
    const body = (await req.json()) as { reason?: unknown };
    reason = typeof body.reason === "string" ? body.reason.trim() : "";
  } catch {
    reason = "";
  }

  if (!reason) {
    return NextResponse.json({ ok: false, error: "נדרשת סיבת ביטול" }, { status: 400 });
  }

  const webhookOk = await postWebhookForEvent(g.db, "moving_order_match_cancel", {
    movingOrderId: order.id,
    orderId: order.orderId,
    status: "לא אושרה",
    rejectionReason: reason,
    order: {
      payload: order.payload,
      customValues: order.customValues ?? {},
    },
  });

  const updated = await updateMovingOrder(
    id,
    { status: "rejected", matchRejectionReason: reason },
    g.db
  );

  return NextResponse.json({
    ok: true,
    webhookPosted: webhookOk,
    order: updated,
  });
}
