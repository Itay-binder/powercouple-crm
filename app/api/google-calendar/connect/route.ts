import { NextRequest, NextResponse } from "next/server";
import { requireApprovedUser } from "@/lib/auth/guard";
import { getCalendarOAuth2Client } from "@/lib/googleCalendar/calendarClient";
import { signCalendarOAuthState } from "@/lib/googleCalendar/oauthState";
import { getCurrentTenantIdOrThrow } from "@/lib/googleCalendar/tenantContext";

export const dynamic = "force-dynamic";

const SCOPES = [
  "https://www.googleapis.com/auth/calendar.events",
  "https://www.googleapis.com/auth/calendar.readonly",
  "https://www.googleapis.com/auth/userinfo.email",
  "openid",
];

export async function GET(req: NextRequest) {
  const auth = await requireApprovedUser(req);
  if (!auth.ok) {
    return NextResponse.json({ ok: false, error: auth.error }, { status: auth.status });
  }
  try {
    const tenantId = await getCurrentTenantIdOrThrow();
    const state = signCalendarOAuthState(tenantId, auth.user.uid);
    const oauth2 = getCalendarOAuth2Client();
    const url = oauth2.generateAuthUrl({
      access_type: "offline",
      prompt: "consent",
      scope: SCOPES,
      state,
    });
    return NextResponse.redirect(url);
  } catch (e) {
    return NextResponse.json(
      { ok: false, error: e instanceof Error ? e.message : "OAuth setup failed" },
      { status: 500 }
    );
  }
}
