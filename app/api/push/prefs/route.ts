import { NextRequest, NextResponse } from "next/server";
import { requireApprovedUser } from "@/lib/auth/guard";
import { userFirestoreDocumentId } from "@/lib/auth/profile";
import { getAdminDb } from "@/lib/firebase/admin";
import {
  getUserDevicePushState,
  updateUserDevicePushPrefs,
  type DevicePushPrefs,
} from "@/lib/push/saveUserWebPushSubscription";
import { isWebPushConfigured } from "@/lib/push/vapid";

export const dynamic = "force-dynamic";

type ApiErr = { ok: false; error: string };

export async function GET(req: NextRequest) {
  const auth = await requireApprovedUser(req);
  if (!auth.ok) {
    return NextResponse.json({ ok: false, error: auth.error } satisfies ApiErr, { status: auth.status });
  }
  try {
    const db = await getAdminDb();
    const userDocId = userFirestoreDocumentId(auth.user.email, auth.user.uid);
    const state = await getUserDevicePushState(db, userDocId);
    return NextResponse.json({
      ok: true,
      webPushConfigured: isWebPushConfigured(),
      ...state,
    });
  } catch (e) {
    return NextResponse.json(
      { ok: false, error: e instanceof Error ? e.message : "Unknown error" } satisfies ApiErr,
      { status: 500 }
    );
  }
}

export async function PATCH(req: NextRequest) {
  const auth = await requireApprovedUser(req);
  if (!auth.ok) {
    return NextResponse.json({ ok: false, error: auth.error } satisfies ApiErr, { status: auth.status });
  }
  try {
    const body = (await req.json()) as Partial<DevicePushPrefs>;
    const db = await getAdminDb();
    const userDocId = userFirestoreDocumentId(auth.user.email, auth.user.uid);
    const prefs = await updateUserDevicePushPrefs(db, userDocId, {
      whatsapp: body.whatsapp,
      newLead: body.newLead,
      newOrder: body.newOrder,
      newOpportunity: body.newOpportunity,
    });
    return NextResponse.json({ ok: true, prefs });
  } catch (e) {
    return NextResponse.json(
      { ok: false, error: e instanceof Error ? e.message : "Unknown error" } satisfies ApiErr,
      { status: 400 }
    );
  }
}
