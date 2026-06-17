import { NextRequest, NextResponse } from "next/server";
import { requireApprovedUser } from "@/lib/auth/guard";
import {
  createSalesCall,
  listSalesCalls,
  type SalesCallStatus,
} from "@/lib/calls/repo";

export const dynamic = "force-dynamic";
export const revalidate = 0;
type ApiErr = { ok: false; error: string };

export async function GET(req: NextRequest) {
  const auth = await requireApprovedUser(req);
  if (!auth.ok) {
    return NextResponse.json(
      { ok: false, error: auth.error } satisfies ApiErr,
      { status: auth.status }
    );
  }
  try {
    const repId = req.nextUrl.searchParams.get("repId")?.trim() || undefined;
    const statusRaw = req.nextUrl.searchParams.get("status")?.trim();
    const status =
      statusRaw === "pending" || statusRaw === "done" || statusRaw === "canceled"
        ? (statusRaw as SalesCallStatus)
        : undefined;
    const calls = await listSalesCalls({ repId, status });
    return NextResponse.json({ ok: true, calls });
  } catch (e) {
    return NextResponse.json(
      { ok: false, error: e instanceof Error ? e.message : "Unknown error" } satisfies ApiErr,
      { status: 500 }
    );
  }
}

export async function POST(req: NextRequest) {
  const auth = await requireApprovedUser(req);
  if (!auth.ok) {
    return NextResponse.json(
      { ok: false, error: auth.error } satisfies ApiErr,
      { status: auth.status }
    );
  }
  try {
    const body = (await req.json()) as {
      contactId?: string;
      repId?: string;
      title?: string;
      note?: string;
      scheduledAt?: string;
      followUpOfId?: string;
      syncToGoogleCalendar?: boolean;
      googleCalendarId?: string;
    };
    const call = await createSalesCall({
      contactId: body.contactId ?? "",
      repId: body.repId ?? "",
      title: body.title,
      note: body.note,
      scheduledAt: body.scheduledAt,
      followUpOfId: body.followUpOfId,
      syncToGoogleCalendar: body.syncToGoogleCalendar,
      googleCalendarId: body.googleCalendarId,
    });
    return NextResponse.json({ ok: true, call });
  } catch (e) {
    return NextResponse.json(
      { ok: false, error: e instanceof Error ? e.message : "Unknown error" } satisfies ApiErr,
      { status: 400 }
    );
  }
}
