import { NextRequest, NextResponse } from "next/server";
import { requireApprovedUser } from "@/lib/auth/guard";
import { getAdminDb } from "@/lib/firebase/admin";
import { sendSessionTextMessageViaMeta } from "@/lib/whatsapp/meta";
import {
  appendWhatsAppChatMessage,
  getWhatsAppChatThread,
  getWhatsAppMetaConfig,
} from "@/lib/whatsapp/repo";

export const dynamic = "force-dynamic";

const SESSION_MS = 24 * 60 * 60 * 1000;

function isWithinSessionWindow(lastInboundIso?: string): boolean {
  if (!lastInboundIso?.trim()) return false;
  const t = new Date(lastInboundIso).getTime();
  if (Number.isNaN(t)) return false;
  return Date.now() - t < SESSION_MS;
}

export async function POST(req: NextRequest) {
  const auth = await requireApprovedUser(req);
  if (!auth.ok) {
    return NextResponse.json({ ok: false, error: auth.error }, { status: auth.status });
  }

  let body: { threadId?: string; text?: string };
  try {
    body = (await req.json()) as typeof body;
  } catch {
    return NextResponse.json({ ok: false, error: "Invalid JSON" }, { status: 400 });
  }

  const threadId = body.threadId?.trim() ?? "";
  const text = body.text?.trim() ?? "";
  if (!threadId) {
    return NextResponse.json({ ok: false, error: "threadId is required" }, { status: 400 });
  }
  if (!text) {
    return NextResponse.json({ ok: false, error: "text is required" }, { status: 400 });
  }

  try {
    const db = await getAdminDb();
    const thread = await getWhatsAppChatThread(db, threadId);
    if (!thread) {
      return NextResponse.json({ ok: false, error: "Chat thread not found" }, { status: 404 });
    }
    if (!isWithinSessionWindow(thread.lastInboundAt)) {
      return NextResponse.json(
        {
          ok: false,
          error:
            "חלון השירות של Meta (~24 שעות) לא פעיל: אין הודעה נכנסת מאיש הקשר לאחרונה. שלחו תבנית מאושרת או המתינו לתגובה מהלקוח.",
        },
        { status: 400 }
      );
    }

    const config = await getWhatsAppMetaConfig(db);
    if (!config?.phoneNumberId.trim() || !config.systemUserToken.trim()) {
      return NextResponse.json(
        { ok: false, error: "חסרים Phone Number ID או טוקן — הגדרו ב«חשבון WhatsApp»." },
        { status: 400 }
      );
    }

    const to = thread.phone.replace(/[^\d]/g, "");
    if (!to) {
      return NextResponse.json({ ok: false, error: "מספר לא תקין" }, { status: 400 });
    }

    const sent = await sendSessionTextMessageViaMeta(config, { to, body: text });
    await appendWhatsAppChatMessage(db, {
      phone: thread.phone,
      direction: "outbound",
      text,
      from: config.phoneNumberId,
      to,
      messageId: sent.messageId,
      contactId: thread.contactId,
      contactName: thread.contactName,
      marketingApproved: thread.marketingApproved,
    });

    return NextResponse.json({ ok: true, messageId: sent.messageId });
  } catch (e) {
    return NextResponse.json(
      { ok: false, error: e instanceof Error ? e.message : "Unknown error" },
      { status: 400 }
    );
  }
}
