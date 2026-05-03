import { NextRequest, NextResponse } from "next/server";
import { requireApprovedUser } from "@/lib/auth/guard";
import { isAdminEmail } from "@/lib/auth/profile";
import { getAdminDb } from "@/lib/firebase/admin";
import { getGreenApiConfig, saveGreenApiConfig } from "@/lib/whatsapp/repo";

export const dynamic = "force-dynamic";

function canManage(user: { profile: { role: string }; email?: string }): boolean {
  return user.profile.role === "admin" || isAdminEmail(user.email);
}

export async function GET(req: NextRequest) {
  const auth = await requireApprovedUser(req);
  if (!auth.ok) {
    return NextResponse.json({ ok: false, error: auth.error }, { status: auth.status });
  }
  try {
    const db = await getAdminDb();
    const config = await getGreenApiConfig(db);
    return NextResponse.json({
      ok: true,
      config: config
        ? {
            instanceId: config.instanceId,
            apiBaseUrl: config.apiBaseUrl,
            hasToken: Boolean(config.apiTokenInstance),
            tokenPreview: config.apiTokenInstance
              ? `${config.apiTokenInstance.slice(0, 6)}...${config.apiTokenInstance.slice(-4)}`
              : "",
            updatedAt: config.updatedAt,
            canManage: canManage(auth.user),
          }
        : { instanceId: "", apiBaseUrl: "https://api.green-api.com", hasToken: false, tokenPreview: "", updatedAt: "", canManage: canManage(auth.user) },
    });
  } catch (e) {
    return NextResponse.json(
      { ok: false, error: e instanceof Error ? e.message : "Unknown error" },
      { status: 500 }
    );
  }
}

export async function PUT(req: NextRequest) {
  const auth = await requireApprovedUser(req);
  if (!auth.ok) {
    return NextResponse.json({ ok: false, error: auth.error }, { status: auth.status });
  }
  if (!canManage(auth.user)) {
    return NextResponse.json({ ok: false, error: "Forbidden" }, { status: 403 });
  }
  let body: { instanceId?: string; apiTokenInstance?: string; apiBaseUrl?: string };
  try {
    body = (await req.json()) as typeof body;
  } catch {
    return NextResponse.json({ ok: false, error: "Invalid JSON" }, { status: 400 });
  }

  const instanceId = body.instanceId?.trim() ?? "";
  if (!instanceId) {
    return NextResponse.json({ ok: false, error: "instanceId is required" }, { status: 400 });
  }

  try {
    const db = await getAdminDb();
    const saved = await saveGreenApiConfig(db, {
      instanceId,
      apiTokenInstance: body.apiTokenInstance,
      apiBaseUrl: body.apiBaseUrl,
    });
    return NextResponse.json({
      ok: true,
      config: {
        instanceId: saved.instanceId,
        apiBaseUrl: saved.apiBaseUrl,
        hasToken: Boolean(saved.apiTokenInstance),
        tokenPreview: saved.apiTokenInstance
          ? `${saved.apiTokenInstance.slice(0, 6)}...${saved.apiTokenInstance.slice(-4)}`
          : "",
        updatedAt: saved.updatedAt,
        canManage: true,
      },
    });
  } catch (e) {
    return NextResponse.json(
      { ok: false, error: e instanceof Error ? e.message : "Unknown error" },
      { status: 400 }
    );
  }
}
