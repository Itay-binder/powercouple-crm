import { NextRequest, NextResponse } from "next/server";
import { getAdminDb } from "@/lib/firebase/admin";
import { saveMetaAdsConfig } from "@/lib/metaAds/repo";
import { verifyMetaOAuthState } from "@/lib/metaAds/oauthState";

export const dynamic = "force-dynamic";

function appUrl(): string {
  return (process.env.NEXT_PUBLIC_APP_URL ?? "").replace(/\/$/, "");
}

function metaCallbackUri(): string {
  return `${appUrl()}/api/meta-ads/callback`;
}

async function exchangeCodeForLongLivedToken(code: string): Promise<{
  accessToken: string;
  tokenExpiresAt: string;
}> {
  const appId = process.env.META_APP_ID?.trim() ?? "";
  const appSecret = process.env.META_APP_SECRET?.trim() ?? "";

  // Step 1: code → short-lived user token (~1 hour)
  const shortRes = await fetch(
    `https://graph.facebook.com/v22.0/oauth/access_token?` +
      new URLSearchParams({
        client_id: appId,
        client_secret: appSecret,
        redirect_uri: metaCallbackUri(),
        code,
      }).toString(),
    { cache: "no-store" }
  );
  const shortJson = (await shortRes.json().catch(() => ({}))) as {
    access_token?: string;
    error?: { message?: string };
  };
  if (!shortRes.ok || !shortJson.access_token) {
    throw new Error(shortJson.error?.message ?? `Token exchange failed (${shortRes.status})`);
  }

  // Step 2: short-lived → long-lived user token (~60 days)
  const longRes = await fetch(
    `https://graph.facebook.com/v22.0/oauth/access_token?` +
      new URLSearchParams({
        grant_type: "fb_exchange_token",
        client_id: appId,
        client_secret: appSecret,
        fb_exchange_token: shortJson.access_token,
      }).toString(),
    { cache: "no-store" }
  );
  const longJson = (await longRes.json().catch(() => ({}))) as {
    access_token?: string;
    expires_in?: number;
    error?: { message?: string };
  };
  if (!longRes.ok || !longJson.access_token) {
    throw new Error(
      longJson.error?.message ?? `Long-lived token exchange failed (${longRes.status})`
    );
  }

  const expiresInSec = typeof longJson.expires_in === "number" ? longJson.expires_in : 5184000;
  const tokenExpiresAt = new Date(Date.now() + expiresInSec * 1000).toISOString();

  return { accessToken: longJson.access_token, tokenExpiresAt };
}

export async function GET(req: NextRequest) {
  const base = appUrl();
  const errRedirect = (msg: string) =>
    NextResponse.redirect(`${base}/meta-ads?meta_error=${encodeURIComponent(msg)}`);

  const oauthError = req.nextUrl.searchParams.get("error");
  if (oauthError) {
    const desc = req.nextUrl.searchParams.get("error_description") ?? oauthError;
    return errRedirect(desc);
  }

  const code = req.nextUrl.searchParams.get("code");
  const stateRaw = req.nextUrl.searchParams.get("state");
  const verified = verifyMetaOAuthState(stateRaw);

  if (!code || !verified) {
    return errRedirect("OAuth state אינו תקף — נסה שוב.");
  }

  try {
    const { accessToken, tokenExpiresAt } = await exchangeCodeForLongLivedToken(code);
    const db = await getAdminDb();
    await saveMetaAdsConfig(db, { accessToken, tokenExpiresAt });
    return NextResponse.redirect(`${base}/meta-ads?meta_connected=1`);
  } catch (e) {
    return errRedirect(e instanceof Error ? e.message : "Connection failed");
  }
}
