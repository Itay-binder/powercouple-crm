import { NextRequest, NextResponse } from "next/server";
import { requireApprovedUser } from "@/lib/auth/guard";
import {
  deleteSalesCall,
  type SalesCallStatus,
  updateSalesCall,
} from "@/lib/calls/repo";

export const dynamic = "force-dynamic";
export const revalidate = 0;
type ApiErr = { ok: false; error: string };

export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const auth = await requireApprovedUser(req);
  if (!auth.ok) {
    return NextResponse.json(
      { ok: false, error: auth.error } satisfies ApiErr,
      { status: auth.status }
    );
  }
  try {
    const { id } = await params;
    const body = (await req.json()) as {
      title?: string;
      note?: string;
      scheduledAt?: string;
      repId?: string;
      status?: SalesCallStatus;
      completionNote?: string;
      syncToGoogleCalendar?: boolean;
      googleCalendarId?: string;
    };
    const call = await updateSalesCall(id, body);
    return NextResponse.json({ ok: true, call });
  } catch (e) {
    return NextResponse.json(
      { ok: false, error: e instanceof Error ? e.message : "Unknown error" } satisfies ApiErr,
      { status: 400 }
    );
  }
}

export async function DELETE(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const auth = await requireApprovedUser(req);
  if (!auth.ok) {
    return NextResponse.json(
      { ok: false, error: auth.error } satisfies ApiErr,
      { status: auth.status }
    );
  }
  try {
    const { id } = await params;
    await deleteSalesCall(id);
    return NextResponse.json({ ok: true });
  } catch (e) {
    return NextResponse.json(
      { ok: false, error: e instanceof Error ? e.message : "Unknown error" } satisfies ApiErr,
      { status: 400 }
    );
  }
}
