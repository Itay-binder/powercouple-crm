import { NextRequest, NextResponse } from "next/server";
import { requireApprovedUser } from "@/lib/auth/guard";
import { getAdminDb } from "@/lib/firebase/admin";
import { getNewestLeadByCreatedAt } from "@/lib/leads/repo";
import { getNewestMovingOrderByCreatedAt } from "@/lib/movingOrders/repo";
import { getNewestOpportunityByCreatedAt } from "@/lib/opportunities/repo";
import { listWhatsAppChatThreads } from "@/lib/whatsapp/repo";

export const dynamic = "force-dynamic";
export const revalidate = 0;

type ApiErr = { ok: false; error: string };

export async function GET(req: NextRequest) {
  const auth = await requireApprovedUser(req);
  if (!auth.ok) {
    return NextResponse.json({ ok: false, error: auth.error } satisfies ApiErr, { status: auth.status });
  }
  try {
    const db = await getAdminDb();
    const [threads, latestLead, latestOpportunity, latestOrder] = await Promise.all([
      listWhatsAppChatThreads(db, 120),
      getNewestLeadByCreatedAt(),
      getNewestOpportunityByCreatedAt(),
      getNewestMovingOrderByCreatedAt(db),
    ]);
    return NextResponse.json({
      ok: true,
      whatsapp: threads.map((t) => ({
        id: t.id,
        phone: t.phone,
        contactName: t.contactName,
        lastInboundAt: t.lastInboundAt ?? null,
        lastMessageAt: t.lastMessageAt,
        unreadCount: t.unreadCount,
      })),
      latestLead,
      latestOpportunity,
      latestOrder,
    });
  } catch (e) {
    return NextResponse.json(
      { ok: false, error: e instanceof Error ? e.message : "Unknown error" } satisfies ApiErr,
      { status: 500 }
    );
  }
}
