import { NextRequest, NextResponse } from "next/server";
import { requireApprovedUser } from "@/lib/auth/guard";
import { isAdminEmail } from "@/lib/auth/profile";
import { getAdminDb } from "@/lib/firebase/admin";
import { getWhatsAppMetaConfig, saveWhatsAppMetaConfig } from "@/lib/whatsapp/repo";

export const dynamic = "force-dynamic";

function canManage(user: { profile: { role: string }; email?: string }): boolean {
  return user.profile.role === "admin" || isAdminEmail(user.email);
}

export async function GET(req: NextRequest) {
  const auth = await requireApprovedUser(req);
  if (!auth.ok) {
    return NextResponse.json({ ok: false, error: auth.error }, { status: auth.status });
  }
  if (!canManage(auth.user)) {
    return NextResponse.json({ ok: false, error: "Forbidden" }, { status: 403 });
  }
  try {
    const db = await getAdminDb();
    const config = await getWhatsAppMetaConfig(db);
    return NextResponse.json({
      ok: true,
      config: config
        ? {
            appId: config.appId,
            businessAccountId: config.businessAccountId,
            wabaId: config.wabaId,
            phoneNumberId: config.phoneNumberId,
            hasToken: Boolean(config.systemUserToken.trim()),
            tokenPreview: config.systemUserToken
              ? `${config.systemUserToken.slice(0, 6)}...${config.systemUserToken.slice(-4)}`
              : "",
            updatedAt: config.updatedAt,
          }
        : null,
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
  let body: {
    appId?: string;
    businessAccountId?: string;
    wabaId?: string;
    phoneNumberId?: string;
    systemUserToken?: string;
  };
  try {
    body = (await req.json()) as typeof body;
  } catch {
    return NextResponse.json({ ok: false, error: "Invalid JSON" }, { status: 400 });
  }
  const wabaId = body.wabaId?.trim() ?? "";
  const phoneNumberId = body.phoneNumberId?.trim() ?? "";
  if (!wabaId || !phoneNumberId) {
    return NextResponse.json(
      { ok: false, error: "wabaId and phoneNumberId are required" },
      { status: 400 }
    );
  }
  try {
    const db = await getAdminDb();
    const saved = await saveWhatsAppMetaConfig(db, {
      appId: body.appId,
      businessAccountId: body.businessAccountId,
      wabaId,
      phoneNumberId,
      systemUserToken: body.systemUserToken,
    });
    return NextResponse.json({
      ok: true,
      config: {
        appId: saved.appId,
        businessAccountId: saved.businessAccountId,
        wabaId: saved.wabaId,
        phoneNumberId: saved.phoneNumberId,
        hasToken: Boolean(saved.systemUserToken.trim()),
        tokenPreview: saved.systemUserToken
          ? `${saved.systemUserToken.slice(0, 6)}...${saved.systemUserToken.slice(-4)}`
          : "",
        updatedAt: saved.updatedAt,
      },
    });
  } catch (e) {
    return NextResponse.json(
      { ok: false, error: e instanceof Error ? e.message : "Unknown error" },
      { status: 400 }
    );
  }
}
