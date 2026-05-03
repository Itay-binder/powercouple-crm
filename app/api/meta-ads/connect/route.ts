import { NextRequest, NextResponse } from "next/server";
import { requireApprovedUser } from "@/lib/auth/guard";
import { isAdminEmail } from "@/lib/auth/profile";
import { signMetaOAuthState } from "@/lib/metaAds/oauthState";

export const dynamic = "force-dynamic";

const META_SCOPES = ["ads_read", "ads_management", "business_management"];

function metaCallbackUri(): string {
  const base = (process.env.NEXT_PUBLIC_APP_URL ?? "").replace(/\/$/, "");
  return `${base}/api/meta-ads/callback`;
}

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

  const appId = process.env.META_APP_ID?.trim();
  if (!appId) {
    return NextResponse.json(
      { ok: false, error: "META_APP_ID לא מוגדר. הוסף אותו ל-.env ול-Vercel." },
      { status: 500 }
    );
  }

  const redirectUri = metaCallbackUri();
  if (!redirectUri.startsWith("http")) {
    return NextResponse.json(
      { ok: false, error: "NEXT_PUBLIC_APP_URL לא מוגדר. הוסף אותו ל-.env ול-Vercel." },
      { status: 500 }
    );
  }

  const state = signMetaOAuthState(auth.user.uid);
  const params = new URLSearchParams({
    client_id: appId,
    redirect_uri: redirectUri,
    scope: META_SCOPES.join(","),
    state,
    response_type: "code",
  });

  return NextResponse.redirect(
    `https://www.facebook.com/v22.0/dialog/oauth?${params.toString()}`
  );
}
