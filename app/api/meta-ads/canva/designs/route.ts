import { NextRequest, NextResponse } from "next/server";
import { requireApprovedUser } from "@/lib/auth/guard";
import { getAdminDb } from "@/lib/firebase/admin";
import { getValidCanvaToken, listCanvaDesigns } from "@/lib/canva/api";

export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  const auth = await requireApprovedUser(req);
  if (!auth.ok) return NextResponse.json({ ok: false, error: auth.error }, { status: auth.status });

  const continuation = req.nextUrl.searchParams.get("continuation") ?? undefined;

  try {
    const db = await getAdminDb();
    const token = await getValidCanvaToken(db);
    if (!token) {
      return NextResponse.json(
        { ok: false, error: "Canva לא מחובר. חבר את Canva תחילה.", notConnected: true },
        { status: 400 }
      );
    }
    const result = await listCanvaDesigns(token, continuation);
    return NextResponse.json({ ok: true, ...result });
  } catch (e) {
    return NextResponse.json(
      { ok: false, error: e instanceof Error ? e.message : "Unknown error" },
      { status: 500 }
    );
  }
}