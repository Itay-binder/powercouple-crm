import { type NextRequest, NextResponse } from "next/server";
import { processMoverWelcomeItems } from "@/lib/movingOrders/processMoverWelcomeItems";

export const dynamic = "force-dynamic";
export const revalidate = 0;

type ApiErr = { ok: false; error: string };

/**
 * אותה לוגיקה כמו `/api/ingest/mover-welcome` אך עם CRON_SECRET (ללא מפתח ingest).
 * כותרת `x-crm-tenant-database-id` אופציונלית — אם חסרה, משתמשים בטננט ברירת המחדל (עוגיה / CRM_DEFAULT_TENANT_ID).
 */
export async function POST(req: NextRequest) {
  const secret = process.env.CRON_SECRET?.trim();
  const auth = req.headers.get("authorization") ?? "";
  if (secret) {
    if (auth !== `Bearer ${secret}`) {
      return NextResponse.json({ ok: false, error: "Unauthorized" } satisfies ApiErr, { status: 401 });
    }
  } else if (process.env.NODE_ENV === "production") {
    return NextResponse.json(
      { ok: false, error: "CRON_SECRET is not configured" } satisfies ApiErr,
      { status: 500 }
    );
  }

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ ok: false, error: "Invalid JSON" } satisfies ApiErr, { status: 400 });
  }

  const out = await processMoverWelcomeItems(body);
  if (!out.ok) {
    const tenantBlocked =
      out.results.length === 0 && out.error.includes("ניהול הזמנות");
    const status = tenantBlocked ? 403 : out.results.length ? 400 : 500;
    return NextResponse.json({ ok: false, error: out.error, results: out.results }, { status });
  }
  return NextResponse.json({ ok: true, results: out.results });
}
