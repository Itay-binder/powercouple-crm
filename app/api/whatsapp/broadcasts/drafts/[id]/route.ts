import { NextRequest, NextResponse } from "next/server";
import { requireApprovedUser } from "@/lib/auth/guard";
import { getAdminDb } from "@/lib/firebase/admin";
import {
  deleteWhatsAppBroadcastDraft,
  listWhatsAppBroadcastDrafts,
  saveWhatsAppBroadcastDraft,
} from "@/lib/whatsapp/repo";
import type { AudienceCondition, AudienceLogic } from "@/lib/whatsapp/audienceFilter";

export const dynamic = "force-dynamic";

type Params = { params: Promise<{ id: string }> };

export async function PUT(req: NextRequest, { params }: Params) {
  const auth = await requireApprovedUser(req);
  if (!auth.ok) {
    return NextResponse.json({ ok: false, error: auth.error }, { status: auth.status });
  }
  const { id } = await params;
  const draftId = id?.trim();
  if (!draftId) {
    return NextResponse.json({ ok: false, error: "Invalid id" }, { status: 400 });
  }

  let body: {
    name?: string;
    templateId?: string;
    parameterValues?: string[];
    conditions?: AudienceCondition[];
    logic?: AudienceLogic;
    audiencePinnedIds?: string[];
  };
  try {
    body = (await req.json()) as typeof body;
  } catch {
    return NextResponse.json({ ok: false, error: "Invalid JSON" }, { status: 400 });
  }

  try {
    const db = await getAdminDb();
    const existing = (await listWhatsAppBroadcastDrafts(db)).find((d) => d.id === draftId);
    if (!existing) {
      return NextResponse.json({ ok: false, error: "Draft not found" }, { status: 404 });
    }
    const saved = await saveWhatsAppBroadcastDraft(db, {
      id: draftId,
      name: body.name?.trim() ?? existing.name,
      templateId: body.templateId?.trim() ?? existing.templateId,
      parameterValues: Array.isArray(body.parameterValues) ? body.parameterValues : existing.parameterValues,
      conditions: Array.isArray(body.conditions) ? body.conditions : existing.conditions,
      logic: body.logic === "or" ? "or" : body.logic === "and" ? "and" : existing.logic,
      audiencePinnedIds: Array.isArray(body.audiencePinnedIds)
        ? body.audiencePinnedIds.map((x) => String(x).trim()).filter(Boolean)
        : existing.audiencePinnedIds,
      createdBy: existing.createdBy,
      createdAt: existing.createdAt,
    });
    return NextResponse.json({ ok: true, draft: saved });
  } catch (e) {
    return NextResponse.json(
      { ok: false, error: e instanceof Error ? e.message : "Unknown error" },
      { status: 400 }
    );
  }
}

export async function DELETE(req: NextRequest, { params }: Params) {
  const auth = await requireApprovedUser(req);
  if (!auth.ok) {
    return NextResponse.json({ ok: false, error: auth.error }, { status: auth.status });
  }
  const { id } = await params;
  const draftId = id?.trim();
  if (!draftId) {
    return NextResponse.json({ ok: false, error: "Invalid id" }, { status: 400 });
  }
  try {
    const db = await getAdminDb();
    await deleteWhatsAppBroadcastDraft(db, draftId);
    return NextResponse.json({ ok: true });
  } catch (e) {
    return NextResponse.json(
      { ok: false, error: e instanceof Error ? e.message : "Unknown error" },
      { status: 400 }
    );
  }
}
