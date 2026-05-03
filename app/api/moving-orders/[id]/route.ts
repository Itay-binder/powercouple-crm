import { NextRequest, NextResponse } from "next/server";
import { requireApprovedUser } from "@/lib/auth/guard";
import { assertMovingOrdersWorkspace } from "@/lib/movingOrders/guard";
import { applyMatchRemoveSideEffects } from "@/lib/movingOrders/matchOrderActions";
import { deleteMovingOrder, getMovingOrder, updateMovingOrder } from "@/lib/movingOrders/repo";
import type { MovingOrderPayload, MovingOrderStatus } from "@/lib/movingOrders/types";

export const dynamic = "force-dynamic";
export const revalidate = 0;

const STATUSES = new Set<MovingOrderStatus>([
  "pending",
  "dispatched",
  "completed",
  "cancelled",
  "rejected",
]);

export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const auth = await requireApprovedUser(req);
  if (!auth.ok) {
    return NextResponse.json({ ok: false, error: auth.error }, { status: auth.status });
  }

  const g = await assertMovingOrdersWorkspace();
  if (!g.ok) {
    return NextResponse.json({ ok: false, error: g.error }, { status: g.status });
  }

  const { id } = await params;
  const existing = await getMovingOrder(id, g.db);
  if (!existing) {
    return NextResponse.json({ ok: false, error: "לא נמצא" }, { status: 404 });
  }

  let body: Record<string, unknown>;
  try {
    body = (await req.json()) as Record<string, unknown>;
  } catch {
    return NextResponse.json({ ok: false, error: "JSON לא תקין" }, { status: 400 });
  }

  const patch: Parameters<typeof updateMovingOrder>[1] = {};

  if (Array.isArray(body.removeSentMatchDriverIds)) {
    const rm = body.removeSentMatchDriverIds.map((x) => String(x).trim()).filter(Boolean);
    if (rm.length) patch.removeSentMatchDriverIds = rm;
  }

  if (body.rematch === true) {
    patch.rematch = true;
  }

  if (typeof body.status === "string" && STATUSES.has(body.status as MovingOrderStatus)) {
    patch.status = body.status as MovingOrderStatus;
  }

  if (Array.isArray(body.excludedDriverIds)) {
    patch.excludedDriverIds = body.excludedDriverIds.map((x) => String(x));
  }

  if (Array.isArray(body.manualDriverIds)) {
    patch.manualDriverIds = body.manualDriverIds.map((x) => String(x));
  }

  if (typeof body.stage === "string" && body.stage.trim()) {
    patch.stage = body.stage.trim();
  }

  if (typeof body.pipelineId === "string" && body.pipelineId.trim()) {
    patch.pipelineId = body.pipelineId.trim();
  }

  if (body.customValues && typeof body.customValues === "object" && !Array.isArray(body.customValues)) {
    patch.customValues = body.customValues as Record<string, unknown>;
  }

  if (body.payload && typeof body.payload === "object" && !Array.isArray(body.payload)) {
    patch.payload = body.payload as Partial<MovingOrderPayload>;
  }

  if (typeof body.dispatchedAt === "string" || body.dispatchedAt === null) {
    patch.dispatchedAt = body.dispatchedAt as string | null;
  }

  if (Object.keys(patch).length === 0) {
    return NextResponse.json({ ok: false, error: "אין שדות לעדכון" }, { status: 400 });
  }

  try {
    const removed = patch.removeSentMatchDriverIds ?? [];
    const updated = await updateMovingOrder(id, patch, g.db);
    if (removed.length) {
      await applyMatchRemoveSideEffects(removed);
    }
    return NextResponse.json({ ok: true, order: updated });
  } catch (e) {
    return NextResponse.json(
      { ok: false, error: e instanceof Error ? e.message : "Unknown error" },
      { status: 400 }
    );
  }
}

export async function DELETE(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const auth = await requireApprovedUser(_req);
  if (!auth.ok) {
    return NextResponse.json({ ok: false, error: auth.error }, { status: auth.status });
  }

  const g = await assertMovingOrdersWorkspace();
  if (!g.ok) {
    return NextResponse.json({ ok: false, error: g.error }, { status: g.status });
  }

  const { id } = await params;
  try {
    await deleteMovingOrder(id, g.db);
    return NextResponse.json({ ok: true });
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Unknown error";
    const status = msg.includes("לא נמצא") ? 404 : 400;
    return NextResponse.json({ ok: false, error: msg }, { status });
  }
}
