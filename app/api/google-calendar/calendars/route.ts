import { NextRequest, NextResponse } from "next/server";
import { requireApprovedUser } from "@/lib/auth/guard";
import { listWritableCalendars } from "@/lib/googleCalendar/calendarClient";
import { getGoogleCalendarTokensForTenant } from "@/lib/googleCalendar/tokensRepo";

export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  const auth = await requireApprovedUser(req);
  if (!auth.ok) {
    return NextResponse.json({ ok: false, error: auth.error }, { status: auth.status });
  }
  const stored = await getGoogleCalendarTokensForTenant();
  if (!stored) {
    return NextResponse.json({ ok: false, error: "Not connected" }, { status: 400 });
  }
  try {
    const calendars = await listWritableCalendars(stored);
    return NextResponse.json({ ok: true, calendars });
  } catch (e) {
    return NextResponse.json(
      { ok: false, error: e instanceof Error ? e.message : "List failed" },
      { status: 500 }
    );
  }
}
