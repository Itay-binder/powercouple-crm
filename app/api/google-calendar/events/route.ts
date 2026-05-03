import { NextRequest, NextResponse } from "next/server";
import { requireApprovedUser } from "@/lib/auth/guard";
import { getAuthorizedCalendarClient } from "@/lib/googleCalendar/calendarClient";
import { getGoogleCalendarTokensForTenant } from "@/lib/googleCalendar/tokensRepo";

export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  const auth = await requireApprovedUser(req);
  if (!auth.ok) {
    return NextResponse.json({ ok: false, error: auth.error }, { status: auth.status });
  }
  const calendarId = req.nextUrl.searchParams.get("calendarId")?.trim() || "primary";
  const timeMin = req.nextUrl.searchParams.get("timeMin")?.trim();
  const timeMax = req.nextUrl.searchParams.get("timeMax")?.trim();
  if (!timeMin || !timeMax) {
    return NextResponse.json({ ok: false, error: "timeMin and timeMax required (ISO)" }, { status: 400 });
  }
  const stored = await getGoogleCalendarTokensForTenant();
  if (!stored) {
    return NextResponse.json({ ok: false, error: "Not connected" }, { status: 400 });
  }
  try {
    const { calendar } = await getAuthorizedCalendarClient(stored);
    const res = await calendar.events.list({
      calendarId,
      timeMin,
      timeMax,
      singleEvents: true,
      orderBy: "startTime",
      maxResults: 2500,
    });
    const events =
      res.data.items?.map((ev) => ({
        id: ev.id ?? "",
        summary: ev.summary ?? "(ללא כותרת)",
        start: ev.start?.dateTime ?? ev.start?.date ?? "",
        end: ev.end?.dateTime ?? ev.end?.date ?? "",
        htmlLink: ev.htmlLink ?? "",
      })) ?? [];
    return NextResponse.json({ ok: true, events: events.filter((e) => e.id) });
  } catch (e) {
    return NextResponse.json(
      { ok: false, error: e instanceof Error ? e.message : "events list failed" },
      { status: 500 }
    );
  }
}
