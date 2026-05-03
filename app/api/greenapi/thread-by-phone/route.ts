import { NextRequest, NextResponse } from "next/server";
import { requireApprovedUser } from "@/lib/auth/guard";
import { getAdminDb } from "@/lib/firebase/admin";
import { normalizePhone } from "@/lib/leads/repo";
import { listGreenApiRecentMessages } from "@/lib/whatsapp/greenapi";
import { getGreenApiConfig } from "@/lib/whatsapp/repo";

export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  const auth = await requireApprovedUser(req);
  if (!auth.ok) {
    return NextResponse.json({ ok: false, error: auth.error }, { status: auth.status });
  }
  const rawPhone = req.nextUrl.searchParams.get("phone")?.trim() ?? "";
  const phone = normalizePhone(rawPhone);
  if (!phone) {
    return NextResponse.json({ ok: true, phone: null, messages: [] });
  }
  try {
    const db = await getAdminDb();
    const config = await getGreenApiConfig(db);
    if (!config?.instanceId || !config.apiTokenInstance) {
      return NextResponse.json({ ok: true, phone, messages: [], notConfigured: true });
    }
    const all = await listGreenApiRecentMessages(config, 200);
    const messages = all.filter((m) => m.phone === phone);
    return NextResponse.json({ ok: true, phone, messages });
  } catch (e) {
    return NextResponse.json(
      { ok: false, error: e instanceof Error ? e.message : "Unknown error" },
      { status: 500 }
    );
  }
}
