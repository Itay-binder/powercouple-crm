import { NextRequest, NextResponse } from "next/server";
import { requireApprovedUser } from "@/lib/auth/guard";
import { disconnectGoogleCalendarForTenant } from "@/lib/googleCalendar/tokensRepo";

export const dynamic = "force-dynamic";

export async function POST(req: NextRequest) {
  const auth = await requireApprovedUser(req);
  if (!auth.ok) {
    return NextResponse.json({ ok: false, error: auth.error }, { status: auth.status });
  }
  await disconnectGoogleCalendarForTenant();
  return NextResponse.json({ ok: true });
}
