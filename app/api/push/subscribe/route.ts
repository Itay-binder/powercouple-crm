import { NextRequest, NextResponse } from "next/server";
import { requireApprovedUser } from "@/lib/auth/guard";
import { userFirestoreDocumentId } from "@/lib/auth/profile";
import { getAdminDb } from "@/lib/firebase/admin";
import { saveUserWebPushSubscription, type DevicePushPrefs } from "@/lib/push/saveUserWebPushSubscription";
import { isWebPushConfigured } from "@/lib/push/vapid";

export const dynamic = "force-dynamic";

type ApiErr = { ok: false; error: string };

export async function POST(req: NextRequest) {
  if (!isWebPushConfigured()) {
    return NextResponse.json(
      { ok: false, error: "Web Push לא הוגדר בשרת (חסרים מפתחות VAPID)." } satisfies ApiErr,
      { status: 503 }
    );
  }
  const auth = await requireApprovedUser(req);
  if (!auth.ok) {
    return NextResponse.json({ ok: false, error: auth.error } satisfies ApiErr, { status: auth.status });
  }
  try {
    const body = (await req.json()) as {
      subscription?: { endpoint?: string; keys?: { p256dh?: string; auth?: string } };
      devicePushPrefs?: Partial<DevicePushPrefs>;
    };
    const sub = body.subscription;
    const ep = sub?.endpoint?.trim();
    const p256dh = sub?.keys?.p256dh?.trim();
    const authKey = sub?.keys?.auth?.trim();
    if (!ep || !p256dh || !authKey) {
      return NextResponse.json({ ok: false, error: "subscription חסר או לא תקין" } satisfies ApiErr, {
        status: 400,
      });
    }
    const db = await getAdminDb();
    const userDocId = userFirestoreDocumentId(auth.user.email, auth.user.uid);
    await saveUserWebPushSubscription(
      db,
      userDocId,
      { endpoint: ep, keys: { p256dh, auth: authKey } },
      body.devicePushPrefs
    );
    return NextResponse.json({ ok: true });
  } catch (e) {
    return NextResponse.json(
      { ok: false, error: e instanceof Error ? e.message : "Unknown error" } satisfies ApiErr,
      { status: 400 }
    );
  }
}
