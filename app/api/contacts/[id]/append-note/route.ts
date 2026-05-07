import { NextRequest, NextResponse } from "next/server";
import { requireApprovedUser } from "@/lib/auth/guard";
import { appendLeadNote } from "@/lib/leads/repo";

export const dynamic = "force-dynamic";
export const revalidate = 0;

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const auth = await requireApprovedUser(req);
  if (!auth.ok) return NextResponse.json({ ok: false, error: auth.error }, { status: auth.status });
  try {
    const { id } = await params;
    const body = (await req.json().catch(() => ({}))) as { text?: string; category?: string };
    const text = String(body.text ?? "").trim();
    if (!text) return NextResponse.json({ ok: false, error: "Note text is required" }, { status: 400 });
    const lead = await appendLeadNote(id, {
      text,
      createdBy: auth.user.email || "CRM User",
      category: typeof body.category === "string" ? body.category : "שיחות",
    });
    return NextResponse.json({ ok: true, lead });
  } catch (e) {
    return NextResponse.json(
      { ok: false, error: e instanceof Error ? e.message : "Unknown error" },
      { status: 400 }
    );
  }
}

