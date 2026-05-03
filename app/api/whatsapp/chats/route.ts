import { NextRequest, NextResponse } from "next/server";
import { requireApprovedUser } from "@/lib/auth/guard";
import { getAdminDb } from "@/lib/firebase/admin";
import { getLeadById, normalizePhone } from "@/lib/leads/repo";
import type { LeadRecord } from "@/lib/leads/repo";
import {
  getWhatsAppChatThread,
  listWhatsAppChatThreads,
  markWhatsAppChatThreadRead,
  type WhatsAppChatThreadRecord,
} from "@/lib/whatsapp/repo";

function leadToChatContactVm(lead: LeadRecord) {
  return {
    id: lead.id,
    name: lead.name,
    email: lead.email,
    phone: lead.phone,
    stage: lead.stage,
    status: lead.status,
    source: lead.source,
    contactCode: lead.contactCode,
    assignedRep: lead.assignedRep,
    pipelineId: lead.pipelineId,
    customFields: lead.customFields as Record<string, unknown> | undefined,
  };
}

async function resolveLeadForChat(thread: WhatsAppChatThreadRecord) {
  if (thread.contactId) {
    const lead = await getLeadById(thread.contactId);
    if (lead) return leadToChatContactVm(lead);
  }
  const p = normalizePhone(thread.phone);
  if (!p) return null;
  const db = await getAdminDb();
  const snap = await db.collection("leads").where("phone", "==", p).limit(1).get();
  if (snap.empty) return null;
  const lead = await getLeadById(snap.docs[0]!.id);
  return lead ? leadToChatContactVm(lead) : null;
}

export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  const auth = await requireApprovedUser(req);
  if (!auth.ok) {
    return NextResponse.json({ ok: false, error: auth.error }, { status: auth.status });
  }
  try {
    const db = await getAdminDb();
    const threadId = req.nextUrl.searchParams.get("thread")?.trim() ?? "";
    /** ריענון שיחה בלבד — בלי listWhatsAppChatThreads (חוסך קריאת רשימה מלאה בכל פול). */
    if (threadId) {
      const thread = await getWhatsAppChatThread(db, threadId);
      if (!thread) {
        return NextResponse.json({ ok: false, error: "Chat thread not found" }, { status: 404 });
      }
      await markWhatsAppChatThreadRead(db, threadId);
      const contact = await resolveLeadForChat(thread);
      return NextResponse.json({ ok: true, thread: { ...thread, unreadCount: 0 }, contact });
    }
    const threads = await listWhatsAppChatThreads(db, 120);
    return NextResponse.json({ ok: true, threads });
  } catch (e) {
    return NextResponse.json(
      { ok: false, error: e instanceof Error ? e.message : "Unknown error" },
      { status: 500 }
    );
  }
}
