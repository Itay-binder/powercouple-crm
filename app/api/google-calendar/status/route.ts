import { NextRequest, NextResponse } from "next/server";
import { requireApprovedUser } from "@/lib/auth/guard";
import { getGoogleCalendarTokensForTenant } from "@/lib/googleCalendar/tokensRepo";

export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  const auth = await requireApprovedUser(req);
  if (!auth.ok) {
    return NextResponse.json({ ok: false, error: auth.error }, { status: auth.status });
  }
  const stored = await getGoogleCalendarTokensForTenant();
  return NextResponse.json({
    ok: true,
    connected: Boolean(stored?.accessToken),
    accountEmail: stored?.accountEmail ?? null,
  });
}
