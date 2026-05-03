import { NextRequest, NextResponse } from "next/server";
import { exchangeCodeForTokens, fetchGoogleAccountEmail } from "@/lib/googleCalendar/calendarClient";
import { verifyCalendarOAuthState } from "@/lib/googleCalendar/oauthState";
import { saveGoogleCalendarTokensForTenant } from "@/lib/googleCalendar/tokensRepo";
import { getCurrentTenantIdOrThrow } from "@/lib/googleCalendar/tenantContext";

export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  const err = req.nextUrl.searchParams.get("error");
  if (err) {
    return NextResponse.redirect(new URL(`/calendar?gcal_error=${encodeURIComponent(err)}`, req.url));
  }
  const code = req.nextUrl.searchParams.get("code");
  const stateRaw = req.nextUrl.searchParams.get("state");
  const verified = verifyCalendarOAuthState(stateRaw);
  if (!code || !verified) {
    return NextResponse.redirect(new URL("/calendar?gcal_error=invalid_state", req.url));
  }
  try {
    const currentTenant = await getCurrentTenantIdOrThrow();
    if (verified.tenantId !== currentTenant) {
      return NextResponse.redirect(
        new URL("/calendar?gcal_error=tenant_mismatch", req.url)
      );
    }
    const tokens = await exchangeCodeForTokens(code);
    const access = tokens.access_token;
    if (!access) throw new Error("No access token from Google");
    const email = await fetchGoogleAccountEmail(access);
    await saveGoogleCalendarTokensForTenant({
      accessToken: access,
      refreshToken: tokens.refresh_token ?? undefined,
      scope: tokens.scope ?? undefined,
      tokenType: tokens.token_type ?? undefined,
      expiryDate: tokens.expiry_date ?? undefined,
      accountEmail: email,
    });
    return NextResponse.redirect(new URL("/calendar?gcal_connected=1", req.url));
  } catch (e) {
    const msg = e instanceof Error ? e.message : "token_exchange_failed";
    return NextResponse.redirect(new URL(`/calendar?gcal_error=${encodeURIComponent(msg)}`, req.url));
  }
}
