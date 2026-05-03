import { NextRequest, NextResponse } from "next/server";
import { requireApprovedUser } from "@/lib/auth/guard";
import { getAdminDb } from "@/lib/firebase/admin";
import { normalizePhone } from "@/lib/leads/repo";
import { getWhatsAppChatThread } from "@/lib/whatsapp/repo";

export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  const auth = await requireApprovedUser(req);
  if (!auth.ok) {
    return NextResponse.json({ ok: false, error: auth.error }, { status: auth.status });
  }
  const rawPhone = req.nextUrl.searchParams.get("phone")?.trim() ?? "";
  const phone = normalizePhone(rawPhone);
  if (!phone) {
    return NextResponse.json({ ok: true, phone: null, messages: [], lastInboundAt: null });
  }
  try {
    const db = await getAdminDb();
    const thread = await getWhatsAppChatThread(db, phone);
    return NextResponse.json({
      ok: true,
      phone,
      messages: thread?.messages ?? [],
      lastInboundAt: thread?.lastInboundAt ?? null,
      contactName: thread?.contactName ?? null,
    });
  } catch (e) {
    return NextResponse.json(
      { ok: false, error: e instanceof Error ? e.message : "Unknown error" },
      { status: 500 }
    );
  }
}
