import { NextRequest, NextResponse } from "next/server";
import { requireApprovedUser } from "@/lib/auth/guard";
import { isAdminEmail } from "@/lib/auth/profile";
import { getAdminDb } from "@/lib/firebase/admin";
import { getMetaAdsConfig, saveMetaAdsConfig } from "@/lib/metaAds/repo";
import {
  DEFAULT_STATUS_TOGGLE_PASSWORD,
  hashStatusTogglePassword,
  resolveStatusTogglePasswordHash,
} from "@/lib/metaAds/statusTogglePassword";

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
    const config = await getMetaAdsConfig(db);
    return NextResponse.json({
      ok: true,
      config: config
        ? {
            appId: config.appId,
            businessId: config.businessId,
            adAccountId: config.adAccountId,
            hasToken: Boolean(config.accessToken),
            tokenPreview: config.accessToken
              ? `${config.accessToken.slice(0, 6)}...${config.accessToken.slice(-4)}`
              : "",
            hasStatusTogglePassword: Boolean(resolveStatusTogglePasswordHash(config)),
            statusTogglePasswordMasked: "••••••",
            updatedAt: config.updatedAt,
            canManage: canManage(auth.user),
          }
        : {
            appId: "",
            businessId: "",
            adAccountId: "",
            hasToken: false,
            tokenPreview: "",
            hasStatusTogglePassword: true,
            statusTogglePasswordMasked: "••••••",
            updatedAt: "",
            canManage: canManage(auth.user),
          },
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
    businessId?: string;
    adAccountId?: string;
    accessToken?: string;
    statusTogglePassword?: string;
    resetStatusTogglePassword?: boolean;
  };
  try {
    body = (await req.json()) as typeof body;
  } catch {
    return NextResponse.json({ ok: false, error: "Invalid JSON" }, { status: 400 });
  }

  try {
    const db = await getAdminDb();
    const current = await getMetaAdsConfig(db);
    const adAccountId = body.adAccountId?.trim() ?? current?.adAccountId ?? "";
    if (!adAccountId) {
      return NextResponse.json({ ok: false, error: "adAccountId is required" }, { status: 400 });
    }
    const nextStatusTogglePasswordHash = body.resetStatusTogglePassword
      ? hashStatusTogglePassword(DEFAULT_STATUS_TOGGLE_PASSWORD)
      : body.statusTogglePassword !== undefined
      ? hashStatusTogglePassword(body.statusTogglePassword)
      : undefined;

    const saved = await saveMetaAdsConfig(db, {
      appId: body.appId,
      businessId: body.businessId,
      adAccountId,
      accessToken: body.accessToken,
      statusTogglePasswordHash: nextStatusTogglePasswordHash,
    });
    return NextResponse.json({
      ok: true,
      config: {
        appId: saved.appId,
        businessId: saved.businessId,
        adAccountId: saved.adAccountId,
        hasToken: Boolean(saved.accessToken),
        tokenPreview: saved.accessToken
          ? `${saved.accessToken.slice(0, 6)}...${saved.accessToken.slice(-4)}`
          : "",
        hasStatusTogglePassword: true,
        statusTogglePasswordMasked: "••••••",
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
