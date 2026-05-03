import { NextRequest, NextResponse } from "next/server";
import { requireApprovedUser } from "@/lib/auth/guard";
import { isAdminEmail } from "@/lib/auth/profile";
import { getAdminDb } from "@/lib/firebase/admin";
import {
  ALL_WEBHOOK_EVENTS,
  WEBHOOK_EVENT_LABELS,
  getWebhookTriggers,
  saveWebhookTriggers,
  type WebhookTriggerRow,
} from "@/lib/webhooks/triggersRepo";

export const dynamic = "force-dynamic";

function canManage(user: { profile: { role: string }; email?: string }): boolean {
  return user.profile.role === "admin" || isAdminEmail(user.email);
}

export async function GET(req: NextRequest) {
  const auth = await requireApprovedUser(req);
  if (!auth.ok) {
    return NextResponse.json({ ok: false, error: auth.error }, { status: auth.status });
  }
  if (!canManage(auth.user)) {
    return NextResponse.json({ ok: false, error: "Forbidden" }, { status: 403 });
  }
  try {
    const db = await getAdminDb();
    const triggers = await getWebhookTriggers(db);
    return NextResponse.json({
      ok: true,
      triggers,
      eventLabels: WEBHOOK_EVENT_LABELS,
      eventOrder: ALL_WEBHOOK_EVENTS,
    });
  } catch (e) {
    return NextResponse.json(
      { ok: false, error: e instanceof Error ? e.message : "Unknown error" },
      { status: 500 }
    );
  }
}

export async function PUT(req: NextRequest) {
  const auth = await requireApprovedUser(req);
  if (!auth.ok) {
    return NextResponse.json({ ok: false, error: auth.error }, { status: auth.status });
  }
  if (!canManage(auth.user)) {
    return NextResponse.json({ ok: false, error: "Forbidden" }, { status: 403 });
  }
  let body: { triggers?: WebhookTriggerRow[] };
  try {
    body = (await req.json()) as { triggers?: WebhookTriggerRow[] };
  } catch {
    return NextResponse.json({ ok: false, error: "Invalid JSON" }, { status: 400 });
  }
  if (!Array.isArray(body.triggers)) {
    return NextResponse.json({ ok: false, error: "Missing triggers array" }, { status: 400 });
  }
  try {
    const db = await getAdminDb();
    await saveWebhookTriggers(db, body.triggers);
    const triggers = await getWebhookTriggers(db);
    return NextResponse.json({ ok: true, triggers });
  } catch (e) {
    return NextResponse.json(
      { ok: false, error: e instanceof Error ? e.message : "Unknown error" },
      { status: 400 }
    );
  }
}
