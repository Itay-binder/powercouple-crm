import { NextRequest, NextResponse } from "next/server";
import { requireApprovedUser } from "@/lib/auth/guard";
import { getAdminDb } from "@/lib/firebase/admin";
import {
  listGreenApiRecentMessages,
  sendTextMessageViaGreenApi,
} from "@/lib/whatsapp/greenapi";
import { getGreenApiConfig } from "@/lib/whatsapp/repo";

export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  const auth = await requireApprovedUser(req);
  if (!auth.ok) {
    return NextResponse.json({ ok: false, error: auth.error }, { status: auth.status });
  }
  try {
    const db = await getAdminDb();
    const config = await getGreenApiConfig(db);
    if (!config?.instanceId || !config.apiTokenInstance) {
      return NextResponse.json(
        { ok: false, error: "חסרה הגדרת GreenAPI (instance/token)." },
        { status: 400 }
      );
    }
    const limitRaw = req.nextUrl.searchParams.get("limit") ?? "60";
    const limit = Number.parseInt(limitRaw, 10);
    const messages = await listGreenApiRecentMessages(config, Number.isFinite(limit) ? limit : 60);
    return NextResponse.json({ ok: true, messages });
  } catch (e) {
    return NextResponse.json(
      { ok: false, error: e instanceof Error ? e.message : "Unknown error" },
      { status: 400 }
    );
  }
}

export async function POST(req: NextRequest) {
  const auth = await requireApprovedUser(req);
  if (!auth.ok) {
    return NextResponse.json({ ok: false, error: auth.error }, { status: auth.status });
  }
  let body: { phone?: string; text?: string };
  try {
    body = (await req.json()) as typeof body;
  } catch {
    return NextResponse.json({ ok: false, error: "Invalid JSON" }, { status: 400 });
  }
  const phone = body.phone?.trim() ?? "";
  const text = body.text?.trim() ?? "";
  if (!phone || !text) {
    return NextResponse.json(
      { ok: false, error: "phone and text are required" },
      { status: 400 }
    );
  }
  try {
    const db = await getAdminDb();
    const config = await getGreenApiConfig(db);
    if (!config?.instanceId || !config.apiTokenInstance) {
      return NextResponse.json(
        { ok: false, error: "חסרה הגדרת GreenAPI (instance/token)." },
        { status: 400 }
      );
    }
    const sent = await sendTextMessageViaGreenApi(config, { phone, text });
    return NextResponse.json({ ok: true, messageId: sent.messageId });
  } catch (e) {
    return NextResponse.json(
      { ok: false, error: e instanceof Error ? e.message : "Unknown error" },
      { status: 400 }
    );
  }
}
