import { NextRequest, NextResponse } from "next/server";
import { getTenantByDatabaseId } from "@/lib/tenant/config";
import { getRequestTenantDatabaseId } from "@/lib/firebase/admin";
import { isMovingOrdersTenant } from "@/lib/tenant/movingOrders";
import { isValidIngestApiKeyAsync } from "@/lib/ingest/apiKey";
import { normalizePayloadForStorage } from "@/lib/movingOrders/customValuesFromPayload";
import { upsertMovingOrderFromIngest } from "@/lib/movingOrders/repo";
import type { MovingOrderPayload } from "@/lib/movingOrders/types";

export const dynamic = "force-dynamic";
export const revalidate = 0;

type ApiErr = { ok: false; error: string };

function normalizeItems(body: unknown): MovingOrderPayload[] {
  if (Array.isArray(body)) {
    return body.filter((x) => x && typeof x === "object") as MovingOrderPayload[];
  }
  if (body && typeof body === "object") {
    const o = body as Record<string, unknown>;
    if (Array.isArray(o.items)) {
      return o.items.filter((x) => x && typeof x === "object") as MovingOrderPayload[];
    }
    if (o.order && typeof o.order === "object") {
      return [o.order as MovingOrderPayload];
    }
    if (typeof o.order_id === "string" || typeof (o as MovingOrderPayload).order_id === "string") {
      return [o as MovingOrderPayload];
    }
    const fromMoving = o.moving_order_order_id;
    if (typeof fromMoving === "string" && fromMoving.trim()) {
      return [{ ...(o as unknown as MovingOrderPayload), order_id: fromMoving.trim() }];
    }
  }
  return [];
}

export async function POST(req: NextRequest) {
  if (!(await isValidIngestApiKeyAsync(req))) {
    return NextResponse.json({ ok: false, error: "Unauthorized" } satisfies ApiErr, { status: 401 });
  }

  const dbId = await getRequestTenantDatabaseId();
  const tenant = getTenantByDatabaseId(dbId);
  if (!tenant || !isMovingOrdersTenant(tenant.id)) {
    return NextResponse.json(
      {
        ok: false,
        error: "ניהול הזמנות לא מופעל לטננט הזה. שלח כותרת x-crm-tenant או בחר עסק מתאים.",
      } satisfies ApiErr,
      { status: 403 }
    );
  }

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ ok: false, error: "Invalid JSON" } satisfies ApiErr, { status: 400 });
  }

  const items = normalizeItems(body);
  if (items.length === 0) {
    return NextResponse.json(
      { ok: false, error: "ציפיתי למערך הזמנות או אובייקט עם order_id" } satisfies ApiErr,
      { status: 400 }
    );
  }

  const out: Array<{ id: string; order_id: string }> = [];
  try {
    for (const raw of items) {
      const payload = normalizePayloadForStorage(raw as Record<string, unknown>);
      const rec = await upsertMovingOrderFromIngest(payload);
      out.push({ id: rec.id, order_id: rec.orderId });
    }
  } catch (e) {
    return NextResponse.json(
      { ok: false, error: e instanceof Error ? e.message : "Unknown error" } satisfies ApiErr,
      { status: 400 }
    );
  }

  return NextResponse.json({ ok: true, orders: out });
}
