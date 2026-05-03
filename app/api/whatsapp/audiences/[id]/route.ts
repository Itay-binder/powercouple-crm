import { NextRequest, NextResponse } from "next/server";
import { requireApprovedUser } from "@/lib/auth/guard";
import { getAdminDb } from "@/lib/firebase/admin";
import type { AudienceCondition, AudienceLogic } from "@/lib/whatsapp/audienceFilter";
import {
  deleteWhatsAppAudience,
  listWhatsAppAudiences,
  listWhatsAppCampaigns,
  saveWhatsAppAudience,
  type WhatsAppAudienceMode,
} from "@/lib/whatsapp/repo";

export const dynamic = "force-dynamic";

type Params = { params: Promise<{ id: string }> };
type ApiErr = { ok: false; error: string };

export async function PUT(req: NextRequest, { params }: Params) {
  const auth = await requireApprovedUser(req);
  if (!auth.ok) {
    return NextResponse.json({ ok: false, error: auth.error } satisfies ApiErr, { status: auth.status });
  }
  const { id } = await params;
  const audienceId = id?.trim();
  if (!audienceId) {
    return NextResponse.json({ ok: false, error: "Invalid id" } satisfies ApiErr, { status: 400 });
  }

  let body: {
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
    const existing = (await listWhatsAppAudiences(db)).find((x) => x.id === audienceId);
    if (!existing) {
      return NextResponse.json({ ok: false, error: "Audience not found" } satisfies ApiErr, { status: 404 });
    }
    const mode: WhatsAppAudienceMode = body.mode === "contact_ids" ? "contact_ids" : existing.mode;
    const logic: AudienceLogic =
      body.logic === "or" ? "or" : body.logic === "and" ? "and" : existing.logic;
    let contactIds = Array.isArray(body.contactIds)
      ? Array.from(new Set(body.contactIds.map((x) => String(x).trim()).filter(Boolean)))
      : existing.contactIds;
    let sourceCampaignId = body.sourceCampaignId?.trim() || existing.sourceCampaignId;
    let sourceCampaignName = existing.sourceCampaignName;
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
      id: audienceId,
      name: body.name?.trim() ?? existing.name,
      mode,
      conditions: Array.isArray(body.conditions) ? body.conditions : existing.conditions,
      logic,
      contactIds,
      sourceCampaignId,
      sourceCampaignName,
      createdBy: existing.createdBy,
      createdAt: existing.createdAt,
    });
    return NextResponse.json({ ok: true, audience: saved });
  } catch (e) {
    return NextResponse.json(
      { ok: false, error: e instanceof Error ? e.message : "Unknown error" } satisfies ApiErr,
      { status: 400 }
    );
  }
}

export async function DELETE(req: NextRequest, { params }: Params) {
  const auth = await requireApprovedUser(req);
  if (!auth.ok) {
    return NextResponse.json({ ok: false, error: auth.error } satisfies ApiErr, { status: auth.status });
  }
  const { id } = await params;
  const audienceId = id?.trim();
  if (!audienceId) {
    return NextResponse.json({ ok: false, error: "Invalid id" } satisfies ApiErr, { status: 400 });
  }
  try {
    const db = await getAdminDb();
    await deleteWhatsAppAudience(db, audienceId);
    return NextResponse.json({ ok: true });
  } catch (e) {
    return NextResponse.json(
      { ok: false, error: e instanceof Error ? e.message : "Unknown error" } satisfies ApiErr,
      { status: 400 }
    );
  }
}
