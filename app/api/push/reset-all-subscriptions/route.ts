import { NextRequest, NextResponse } from "next/server";
import { requireApprovedUser } from "@/lib/auth/guard";
import { getAdminDb } from "@/lib/firebase/admin";
import { clearAllWebPushSubscriptionsForTenant } from "@/lib/push/resetTenantWebPushSubscriptions";
import { isWebPushConfigured } from "@/lib/push/vapid";

export const dynamic = "force-dynamic";

type ApiErr = { ok: false; error: string };

/**
 * מנהלים בלבד: מוחק את כל מנויי Web Push בטננט הנוכחי — כדי לאלץ הרשמה מחדש מכל מכשיר.
 * POST עם ?confirm=1 או גוף JSON ‎{ "confirm": true }‎
 */
export async function POST(req: NextRequest) {
  const auth = await requireApprovedUser(req);
  if (!auth.ok) {
    return NextResponse.json({ ok: false, error: auth.error } satisfies ApiErr, { status: auth.status });
  }
  if (auth.user.profile.role !== "admin") {
    return NextResponse.json({ ok: false, error: "נדרשת הרשאת מנהל" } satisfies ApiErr, { status: 403 });
  }
  if (!isWebPushConfigured()) {
    return NextResponse.json(
      { ok: false, error: "Web Push לא מוגדר בשרת" } satisfies ApiErr,
      { status: 503 }
    );
  }

  let body: { confirm?: boolean } = {};
  try {
    body = (await req.json()) as { confirm?: boolean };
  } catch {
    /* ריק */
  }
  const confirmed =
    req.nextUrl.searchParams.get("confirm") === "1" || body.confirm === true;
  if (!confirmed) {
    return NextResponse.json(
      {
        ok: false,
        error: 'אישור: הוסיפו ?confirm=1 לכתובת או {"confirm":true} בגוף הבקשה',
      } satisfies ApiErr,
      { status: 400 }
    );
  }

  try {
    const db = await getAdminDb();
    const { usersUpdated } = await clearAllWebPushSubscriptionsForTenant(db);
    return NextResponse.json({ ok: true, usersUpdated });
  } catch (e) {
    return NextResponse.json(
      { ok: false, error: e instanceof Error ? e.message : "Unknown error" } satisfies ApiErr,
      { status: 500 }
    );
  }
}
