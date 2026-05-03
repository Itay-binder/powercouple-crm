import { randomUUID } from "crypto";
import { NextRequest, NextResponse } from "next/server";
import { requireApprovedUser } from "@/lib/auth/guard";
import { getAdminDb } from "@/lib/firebase/admin";
import type { AudienceCondition, AudienceLogic } from "@/lib/whatsapp/audienceFilter";
import {
  listWhatsAppAudiences,
  listWhatsAppCampaigns,
  saveWhatsAppAudience,
  type WhatsAppAudienceMode,
} from "@/lib/whatsapp/repo";

export const dynamic = "force-dynamic";

type ApiErr = { ok: false; error: string };

export async function GET(req: NextRequest) {
  const auth = await requireApprovedUser(req);
  if (!auth.ok) {
    return NextResponse.json({ ok: false, error: auth.error } satisfies ApiErr, { status: auth.status });
  }
  try {
    const db = await getAdminDb();
    const audiences = await listWhatsAppAudiences(db);
    return NextResponse.json({ ok: true, audiences });
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
  let body: {
    id?: string;
    name?: string;
    mode?: WhatsAppAudienceMode;
    conditions?: AudienceCondition[];
    logic?: AudienceLogic;
    contactIds?: string[];
    sourceCampaignId?: string;
  };
  try {
    body = (await req.json()) as typeof body;
  } catch {
    return NextResponse.json({ ok: false, error: "Invalid JSON" } satisfies ApiErr, { status: 400 });
  }
  try {
    const db = await getAdminDb();
    const id = body.id?.trim() || randomUUID();
    const mode: WhatsAppAudienceMode = body.mode === "contact_ids" ? "contact_ids" : "filters";
    const logic: AudienceLogic = body.logic === "or" ? "or" : "and";
    const name = body.name?.trim() || "קהל ללא שם";

    let contactIds = Array.isArray(body.contactIds)
      ? Array.from(new Set(body.contactIds.map((x) => String(x).trim()).filter(Boolean)))
      : [];
    let sourceCampaignId = body.sourceCampaignId?.trim() || undefined;
    let sourceCampaignName: string | undefined;
    if (sourceCampaignId) {
      const campaigns = await listWhatsAppCampaigns(db);
      const campaign = campaigns.find((c) => c.id === sourceCampaignId);
      if (!campaign) {
        return NextResponse.json(
          { ok: false, error: "Campaign not found" } satisfies ApiErr,
          { status: 404 }
        );
      }
      contactIds = Array.from(
        new Set(
          (campaign.dispatches ?? [])
            .map((d) => String(d.contactId ?? "").trim())
            .filter(Boolean)
        )
      );
      sourceCampaignName = campaign.broadcastName?.trim() || campaign.templateName?.trim() || campaign.id;
    }

    const saved = await saveWhatsAppAudience(db, {
      id,
      name,
      mode,
      conditions: Array.isArray(body.conditions) ? body.conditions : [],
      logic,
      contactIds,
      sourceCampaignId,
      sourceCampaignName,
      createdBy: auth.user.email ?? auth.user.uid,
    });
    return NextResponse.json({ ok: true, audience: saved });
  } catch (e) {
    return NextResponse.json(
      { ok: false, error: e instanceof Error ? e.message : "Unknown error" } satisfies ApiErr,
      { status: 400 }
    );
  }
}
