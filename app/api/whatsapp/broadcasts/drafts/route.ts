import { randomUUID } from "crypto";
import { NextRequest, NextResponse } from "next/server";
import { requireApprovedUser } from "@/lib/auth/guard";
import { getAdminDb } from "@/lib/firebase/admin";
import { listWhatsAppBroadcastDrafts, saveWhatsAppBroadcastDraft } from "@/lib/whatsapp/repo";
import type { AudienceCondition, AudienceLogic } from "@/lib/whatsapp/audienceFilter";

export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  const auth = await requireApprovedUser(req);
  if (!auth.ok) {
    return NextResponse.json({ ok: false, error: auth.error }, { status: auth.status });
  }
  try {
    const db = await getAdminDb();
    const drafts = await listWhatsAppBroadcastDrafts(db);
    return NextResponse.json({ ok: true, drafts });
  } catch (e) {
    return NextResponse.json(
      { ok: false, error: e instanceof Error ? e.message : "Unknown error" },
      { status: 500 }
    );
  }
}

export async function POST(req: NextRequest) {
  const auth = await requireApprovedUser(req);
  if (!auth.ok) {
    return NextResponse.json({ ok: false, error: auth.error }, { status: auth.status });
  }

  let body: {
    name?: string;
    templateId?: string;
    parameterValues?: string[];
    conditions?: AudienceCondition[];
    logic?: AudienceLogic;
    audiencePinnedIds?: string[];
    id?: string;
  };
  try {
    body = (await req.json()) as typeof body;
  } catch {
    return NextResponse.json({ ok: false, error: "Invalid JSON" }, { status: 400 });
  }

  const templateId = body.templateId?.trim() ?? "";
  if (!templateId) {
    return NextResponse.json({ ok: false, error: "templateId is required" }, { status: 400 });
  }

  try {
    const db = await getAdminDb();
    const id = body.id?.trim() || randomUUID();
    const conditions = Array.isArray(body.conditions) ? body.conditions : [];
    const logic: AudienceLogic = body.logic === "or" ? "or" : "and";
    const audiencePinnedIds = Array.isArray(body.audiencePinnedIds)
      ? body.audiencePinnedIds.map((x) => String(x).trim()).filter(Boolean)
      : [];
    const saved = await saveWhatsAppBroadcastDraft(db, {
      id,
      name: body.name?.trim() ?? "טיוטה",
      templateId,
      parameterValues: Array.isArray(body.parameterValues) ? body.parameterValues : [],
      conditions,
      logic,
      audiencePinnedIds,
      createdBy: auth.user.email ?? auth.user.uid,
    });
    return NextResponse.json({ ok: true, draft: saved });
  } catch (e) {
    return NextResponse.json(
      { ok: false, error: e instanceof Error ? e.message : "Unknown error" },
      { status: 400 }
    );
  }
}
