import { NextRequest, NextResponse } from "next/server";
import { createHash, randomBytes } from "crypto";
import { requireApprovedUser } from "@/lib/auth/guard";
import { isAdminEmail } from "@/lib/auth/profile";

export const dynamic = "force-dynamic";

const CANVA_SCOPES = ["design:content:read", "design:meta:read"].join(" ");

function appUrl(): string {
  return (process.env.NEXT_PUBLIC_APP_URL ?? "").replace(/\/$/, "");
}

function canvasCallbackUri(): string {
  return `${appUrl()}/api/meta-ads/canva/callback`;
}

function canManage(user: { profile: { role: string }; email?: string }): boolean {
  return user.profile.role === "admin" || isAdminEmail(user.email);
}

export async function GET(req: NextRequest) {
  const auth = await requireApprovedUser(req);
  if (!auth.ok) return NextResponse.json({ ok: false, error: auth.error }, { status: auth.status });
  if (!canManage(auth.user))
    return NextResponse.json({ ok: false, error: "Forbidden" }, { status: 403 });

  const clientId = process.env.CANVA_CLIENT_ID?.trim();
  if (!clientId) {
    return NextResponse.json(
      { ok: false, error: "CANVA_CLIENT_ID לא מוגדר. הוסף אותו ל-.env ול-Vercel." },
      { status: 500 }
    );
  }
  const redirectUri = canvasCallbackUri();
  if (!redirectUri.startsWith("http")) {
    return NextResponse.json(
      { ok: false, error: "NEXT_PUBLIC_APP_URL לא מוגדר." },
      { status: 500 }
    );
  }

  // PKCE
  const codeVerifier = randomBytes(32).toString("base64url");
  const codeChallenge = createHash("sha256").update(codeVerifier).digest("base64url");

  const params = new URLSearchParams({
    response_type: "code",
    client_id: clientId,
    redirect_uri: redirectUri,
    scope: CANVA_SCOPES,
    code_challenge_method: "S256",
    code_challenge: codeChallenge,
  });

  const res = NextResponse.redirect(
    `https://www.canva.com/api/oauth/authorize?${params.toString()}`
  );
  // Store verifier in short-lived cookie (10 min)
  res.cookies.set("canva_pkce_verifier", codeVerifier, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    maxAge: 600,
    path: "/",
  });
  return res;
}