import { NextRequest, NextResponse } from "next/server";
import { getAdminDb } from "@/lib/firebase/admin";
import { sweepMatchSendFollowupWebhooks } from "@/lib/movingOrders/matchSendFollowupWebhook";
import { sweepTaskWebhooks } from "@/lib/tasks/webhookSweep";

export const dynamic = "force-dynamic";
export const revalidate = 0;

const DISABLED = true;

export async function GET(req: NextRequest) {
  if (DISABLED) return NextResponse.json({ ok: false, error: "disabled" }, { status: 503 });
  const secret = process.env.CRON_SECRET?.trim();
  const auth = req.headers.get("authorization") ?? "";
  if (secret) {
    if (auth !== `Bearer ${secret}`) {
      return NextResponse.json({ ok: false, error: "Unauthorized" }, { status: 401 });
    }
  } else if (process.env.NODE_ENV === "production") {
    return NextResponse.json(
      { ok: false, error: "CRON_SECRET is not configured" },
      { status: 500 }
    );
  }

  try {
    const db = await getAdminDb();
    const [taskResult, matchFollowupResult] = await Promise.all([
      sweepTaskWebhooks(),
      sweepMatchSendFollowupWebhooks(db),
    ]);
    return NextResponse.json({ ok: true, tasks: taskResult, movingOrderMatchFollowups: matchFollowupResult });
  } catch (e) {
    return NextResponse.json(
      { ok: false, error: e instanceof Error ? e.message : "Unknown error" },
      { status: 500 }
    );
  }
}
