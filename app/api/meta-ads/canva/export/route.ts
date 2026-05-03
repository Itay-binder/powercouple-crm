import { NextRequest, NextResponse } from "next/server";
import { requireApprovedUser } from "@/lib/auth/guard";
import { getAdminDb } from "@/lib/firebase/admin";
import { getValidCanvaToken, startCanvaExport, getCanvaExport } from "@/lib/canva/api";

export const dynamic = "force-dynamic";

const MAX_POLL_ATTEMPTS = 20;
const POLL_INTERVAL_MS = 1500;

async function sleep(ms: number) {
  return new Promise((res) => setTimeout(res, ms));
}

export async function POST(req: NextRequest) {
  const auth = await requireApprovedUser(req);
  if (!auth.ok) return NextResponse.json({ ok: false, error: auth.error }, { status: auth.status });

  let body: { designId?: string };
  try {
    body = (await req.json()) as { designId?: string };
  } catch {
    return NextResponse.json({ ok: false, error: "Invalid JSON" }, { status: 400 });
  }

  const designId = body.designId?.trim() ?? "";
  if (!designId) {
    return NextResponse.json({ ok: false, error: "designId נדרש" }, { status: 400 });
  }

  try {
    const db = await getAdminDb();
    const token = await getValidCanvaToken(db);
    if (!token) {
      return NextResponse.json(
        { ok: false, error: "Canva לא מחובר.", notConnected: true },
        { status: 400 }
      );
    }

    const exportJobId = await startCanvaExport(token, designId);

    // Poll until done (max ~30 seconds)
    for (let i = 0; i < MAX_POLL_ATTEMPTS; i++) {
      await sleep(POLL_INTERVAL_MS);
      const result = await getCanvaExport(token, exportJobId);
      if (result.status === "success" && result.url) {
        return NextResponse.json({ ok: true, imageUrl: result.url });
      }
      if (result.status === "failed") {
        return NextResponse.json({ ok: false, error: "ייצוא Canva נכשל" }, { status: 500 });
      }
    }
    return NextResponse.json(
      { ok: false, error: "ייצוא Canva לקח יותר מדי זמן — נסה שוב" },
      { status: 408 }
    );
  } catch (e) {
    return NextResponse.json(
      { ok: false, error: e instanceof Error ? e.message : "Unknown error" },
      { status: 500 }
    );
  }
}