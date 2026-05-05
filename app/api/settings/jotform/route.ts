import { NextRequest, NextResponse } from "next/server";
import { requireApprovedUser } from "@/lib/auth/guard";
import { isAdminEmail } from "@/lib/auth/profile";
import {
  getJotformConfig,
  parseDriveFolderId,
  parseJotformFormId,
  saveJotformConfig,
} from "@/lib/jotform/configRepo";

export const dynamic = "force-dynamic";
export const revalidate = 0;

function canManage(user: { profile: { role: string }; email?: string }): boolean {
  return user.profile.role === "admin" || isAdminEmail(user.email);
}

export async function GET(req: NextRequest) {
  const auth = await requireApprovedUser(req);
  if (!auth.ok) return NextResponse.json({ ok: false, error: auth.error }, { status: auth.status });
  if (!canManage(auth.user)) return NextResponse.json({ ok: false, error: "Forbidden" }, { status: 403 });
  const cfg = await getJotformConfig();
  return NextResponse.json({
    ok: true,
    config: {
      enabled: cfg.enabled,
      hasApiKey: Boolean(cfg.apiKey?.trim()),
      apiKeyHint: cfg.apiKey ? `${cfg.apiKey.slice(0, 6)}...` : "",
      formId: cfg.formId ?? "",
      formUrl: cfg.formUrl ?? "",
      driveParentFolderId: cfg.driveParentFolderId ?? "",
      webhookToken: cfg.webhookToken ?? "",
      mappingsCount: cfg.mappings.length,
      updatedAt: cfg.updatedAt ? cfg.updatedAt.toISOString() : null,
    },
  });
}

export async function PUT(req: NextRequest) {
  const auth = await requireApprovedUser(req);
  if (!auth.ok) return NextResponse.json({ ok: false, error: auth.error }, { status: auth.status });
  if (!canManage(auth.user)) return NextResponse.json({ ok: false, error: "Forbidden" }, { status: 403 });
  try {
    const body = (await req.json()) as {
      enabled?: boolean;
      apiKey?: string;
      clearApiKey?: boolean;
      formIdOrUrl?: string;
      driveParentFolderIdOrUrl?: string;
    };
    const rawForm = String(body.formIdOrUrl ?? "").trim();
    const formId = parseJotformFormId(rawForm);
    if (rawForm && !formId) throw new Error("מזהה/קישור שאלון Jotform לא תקין");
    const rawDrive = String(body.driveParentFolderIdOrUrl ?? "").trim();
    const driveId = parseDriveFolderId(rawDrive);
    if (rawDrive && !driveId) throw new Error("קישור/מזהה תיקיית Drive לא תקין");
    const prev = await getJotformConfig();
    const webhookToken = prev.webhookToken?.trim() || crypto.randomUUID().replace(/-/g, "");
    const cfg = await saveJotformConfig({
      enabled: body.enabled ?? prev.enabled,
      apiKey: body.clearApiKey ? "" : body.apiKey !== undefined ? String(body.apiKey) : prev.apiKey ?? "",
      formId: formId || prev.formId || "",
      formUrl: rawForm || prev.formUrl || "",
      driveParentFolderId: driveId || prev.driveParentFolderId || "",
      webhookToken,
    });
    return NextResponse.json({ ok: true, config: { ...cfg, apiKey: undefined } });
  } catch (e) {
    return NextResponse.json(
      { ok: false, error: e instanceof Error ? e.message : "Unknown error" },
      { status: 400 }
    );
  }
}

