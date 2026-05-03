import { NextRequest, NextResponse } from "next/server";
import { getAdminDb } from "@/lib/firebase/admin";
import { saveCanvaConfig } from "@/lib/canva/repo";

export const dynamic = "force-dynamic";

function appUrl(): string {
  return (process.env.NEXT_PUBLIC_APP_URL ?? "").replace(/\/$/, "");
}

function canvasCallbackUri(): string {
  return `${appUrl()}/api/meta-ads/canva/callback`;
}

async function exchangeCodeForTokens(code: string, codeVerifier: string): Promise<{
  accessToken: string;
  refreshToken: string;
  expiresAt: string;
}> {
  const clientId = process.env.CANVA_CLIENT_ID?.trim() ?? "";
  const clientSecret = process.env.CANVA_CLIENT_SECRET?.trim() ?? "";

  const res = await fetch("https://api.canva.com/rest/v1/oauth/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      grant_type: "authorization_code",
      code,
      redirect_uri: canvasCallbackUri(),
      client_id: clientId,
      client_secret: clientSecret,
      code_verifier: codeVerifier,
    }).toString(),
    cache: "no-store",
  });

  const json = (await res.json().catch(() => ({}))) as {
    access_token?: string;
    refresh_token?: string;
    expires_in?: number;
    error?: string;
    error_description?: string;
  };

  if (!res.ok || !json.access_token) {
    throw new Error(
      json.error_description ?? json.error ?? `Canva token exchange failed (${res.status})`
    );
  }

  const expiresInSec = typeof json.expires_in === "number" ? json.expires_in : 3600;
  return {
    accessToken: json.access_token,
    refreshToken: json.refresh_token ?? "",
    expiresAt: new Date(Date.now() + expiresInSec * 1000).toISOString(),
  };
}

export async function GET(req: NextRequest) {
  const base = appUrl();
  const errRedirect = (msg: string) => {
    const res = NextResponse.redirect(
      `${base}/meta-ads?canva_error=${encodeURIComponent(msg)}`
    );
    res.cookies.delete("canva_pkce_verifier");
    return res;
  };

  const oauthError = req.nextUrl.searchParams.get("error");
  if (oauthError) {
    const desc = req.nextUrl.searchParams.get("error_description") ?? oauthError;
    return errRedirect(desc);
  }

  const code = req.nextUrl.searchParams.get("code");
  const codeVerifier = req.cookies.get("canva_pkce_verifier")?.value ?? "";

  if (!code || !codeVerifier) {
    return errRedirect("OAuth state אינו תקף — נסה שוב.");
  }

  try {
    const tokens = await exchangeCodeForTokens(code, codeVerifier);
    const db = await getAdminDb();
    await saveCanvaConfig(db, tokens);

    const res = NextResponse.redirect(`${base}/meta-ads?canva_connected=1`);
    res.cookies.delete("canva_pkce_verifier");
    return res;
  } catch (e) {
    return errRedirect(e instanceof Error ? e.message : "Canva connection failed");
  }
}