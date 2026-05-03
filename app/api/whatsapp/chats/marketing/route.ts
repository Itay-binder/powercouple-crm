import { NextRequest, NextResponse } from "next/server";
import { requireApprovedUser } from "@/lib/auth/guard";
import { getAdminDb } from "@/lib/firebase/admin";
import { setLeadWhatsAppMarketingApprovalByPhone } from "@/lib/leads/repo";
import {
  getWhatsAppChatThread,
  setWhatsAppChatThreadMarketingApproved,
} from "@/lib/whatsapp/repo";

export const dynamic = "force-dynamic";

type ApiErr = { ok: false; error: string };

export async function POST(req: NextRequest) {
  const auth = await requireApprovedUser(req);
  if (!auth.ok) {
    return NextResponse.json({ ok: false, error: auth.error } satisfies ApiErr, { status: auth.status });
  }
  try {
    const body = (await req.json()) as { threadId?: string; marketingApproved?: boolean };
    const threadId = typeof body.threadId === "string" ? body.threadId.trim() : "";
    if (!threadId) {
      return NextResponse.json({ ok: false, error: "threadId required" } satisfies ApiErr, { status: 400 });
    }
    if (typeof body.marketingApproved !== "boolean") {
      return NextResponse.json(
        { ok: false, error: "marketingApproved (boolean) required" } satisfies ApiErr,
        { status: 400 }
      );
    }
    const db = await getAdminDb();
    const thread = await getWhatsAppChatThread(db, threadId);
    if (!thread) {
      return NextResponse.json({ ok: false, error: "Chat thread not found" } satisfies ApiErr, { status: 404 });
    }
    const approved = body.marketingApproved;
    await setLeadWhatsAppMarketingApprovalByPhone(
      thread.phone,
      approved,
      approved ? undefined : "manual_crm_toggle_off"
    );
    await setWhatsAppChatThreadMarketingApproved(db, threadId, approved);
    return NextResponse.json({ ok: true, marketingApproved: approved });
  } catch (e) {
    return NextResponse.json(
      { ok: false, error: e instanceof Error ? e.message : "Unknown error" } satisfies ApiErr,
      { status: 500 }
    );
  }
}
