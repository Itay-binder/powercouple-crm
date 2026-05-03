import { NextRequest, NextResponse } from "next/server";
import { requireApprovedUser } from "@/lib/auth/guard";
import { getAdminDb } from "@/lib/firebase/admin";
import {
  listLeadsFiltered,
  normalizePhone,
  setLeadWhatsAppMarketingApprovalByLeadId,
} from "@/lib/leads/repo";
import { setWhatsAppChatThreadMarketingApproved } from "@/lib/whatsapp/repo";

export const dynamic = "force-dynamic";

type ApiErr = { ok: false; error: string };

export async function GET(req: NextRequest) {
  const auth = await requireApprovedUser(req);
  if (!auth.ok) {
    return NextResponse.json({ ok: false, error: auth.error } satisfies ApiErr, { status: auth.status });
  }
  try {
    const leads = await listLeadsFiltered(null, null);
    const rows = leads
      .map((lead) => {
        const phone = normalizePhone(lead.phone) ?? "";
        const custom = (lead.customFields ?? {}) as Record<string, unknown>;
        return {
          id: lead.id,
          name: String(lead.name ?? ""),
          email: String(lead.email ?? ""),
          phone,
          status: String(lead.status ?? ""),
          marketingApproved: custom.whatsappMarketingApproved !== false,
          marketingReason:
            typeof custom.whatsappMarketingApprovalReason === "string"
              ? custom.whatsappMarketingApprovalReason
              : "",
          marketingUpdatedAt:
            typeof custom.whatsappMarketingApprovalUpdatedAt === "string"
              ? custom.whatsappMarketingApprovalUpdatedAt
              : "",
          // ניהול הסטטוס נעשה לפי מזהה איש קשר; אין תלות חובה במספר תקין כדי לאפשר כיבוי ידני.
          canManageMarketing: true,
          updatedAt: lead.updatedAt ? lead.updatedAt.toISOString() : "",
        };
      })
      .sort((a, b) => {
        const keyA = a.marketingUpdatedAt || a.updatedAt;
        const keyB = b.marketingUpdatedAt || b.updatedAt;
        return keyB.localeCompare(keyA);
      });
    return NextResponse.json({ ok: true, contacts: rows });
  } catch (e) {
    return NextResponse.json(
      { ok: false, error: e instanceof Error ? e.message : "Unknown error" } satisfies ApiErr,
      { status: 500 }
    );
  }
}

export async function POST(req: NextRequest) {
  const auth = await requireApprovedUser(req);
  if (!auth.ok) {
    return NextResponse.json({ ok: false, error: auth.error } satisfies ApiErr, { status: auth.status });
  }
  try {
    const body = (await req.json()) as { leadId?: string; marketingApproved?: boolean };
    const leadId = typeof body.leadId === "string" ? body.leadId.trim() : "";
    if (!leadId) {
      return NextResponse.json({ ok: false, error: "leadId is required" } satisfies ApiErr, { status: 400 });
    }
    if (typeof body.marketingApproved !== "boolean") {
      return NextResponse.json(
        { ok: false, error: "marketingApproved (boolean) is required" } satisfies ApiErr,
        { status: 400 }
      );
    }
    const db = await getAdminDb();
    const res = await setLeadWhatsAppMarketingApprovalByLeadId(
      leadId,
      body.marketingApproved,
      body.marketingApproved ? undefined : "manual_wa_marketing_tab_off",
      db
    );
    if (res.updatedLeadIds.length === 0) {
      return NextResponse.json({ ok: false, error: "Contact not found" } satisfies ApiErr, { status: 404 });
    }
    if (res.normalizedPhone) {
      await setWhatsAppChatThreadMarketingApproved(db, res.normalizedPhone, body.marketingApproved);
    }
    return NextResponse.json({
      ok: true,
      leadId,
      marketingApproved: body.marketingApproved,
      updatedLeadIds: res.updatedLeadIds,
      normalizedPhone: res.normalizedPhone ?? null,
    });
  } catch (e) {
    return NextResponse.json(
      { ok: false, error: e instanceof Error ? e.message : "Unknown error" } satisfies ApiErr,
      { status: 500 }
    );
  }
}
