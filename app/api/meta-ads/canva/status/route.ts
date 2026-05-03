import { NextRequest, NextResponse } from "next/server";
import { requireApprovedUser } from "@/lib/auth/guard";
import { getAdminDb } from "@/lib/firebase/admin";
import { getCanvaConfig } from "@/lib/canva/repo";

export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  const auth = await requireApprovedUser(req);
  if (!auth.ok) return NextResponse.json({ ok: false, error: auth.error }, { status: auth.status });

  try {
    const db = await getAdminDb();
    const config = await getCanvaConfig(db);
    const connected = Boolean(config?.accessToken);
    return NextResponse.json({
      ok: true,
      connected,
      expiresAt: config?.expiresAt ?? "",
      updatedAt: config?.updatedAt ?? "",
    });
  } catch (e) {
    return NextResponse.json(
      { ok: false, error: e instanceof Error ? e.message : "Unknown error" },
      { status: 500 }
    );
  }
}