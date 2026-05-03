import { NextRequest, NextResponse } from "next/server";
import { requireApprovedUser } from "@/lib/auth/guard";
import { isAdminEmail } from "@/lib/auth/profile";
import { getAdminDb } from "@/lib/firebase/admin";
import { getMetaAdsConfig } from "@/lib/metaAds/repo";
import { setMetaObjectStatus } from "@/lib/metaAds/graph";
import { verifyStatusTogglePassword } from "@/lib/metaAds/statusTogglePassword";

export const dynamic = "force-dynamic";

type ToggleBody = {
  objectType?: "campaign" | "adset" | "ad";
  objectId?: string;
  status?: "ACTIVE" | "PAUSED";
  password?: string;
};

function canManage(user: { profile: { role: string }; email?: string }): boolean {
  return user.profile.role === "admin" || isAdminEmail(user.email);
}

export async function POST(req: NextRequest) {
  const auth = await requireApprovedUser(req);
  if (!auth.ok) {
    return NextResponse.json({ ok: false, error: auth.error }, { status: auth.status });
  }
  if (!canManage(auth.user)) {
    return NextResponse.json({ ok: false, error: "Forbidden" }, { status: 403 });
  }

  let body: ToggleBody;
  try {
    body = (await req.json()) as ToggleBody;
  } catch {
    return NextResponse.json({ ok: false, error: "Invalid JSON" }, { status: 400 });
  }

  const objectType = body.objectType;
  const objectId = body.objectId?.trim() ?? "";
  const status = body.status;
  const password = body.password?.trim() ?? "";

  if (!objectType || !["campaign", "adset", "ad"].includes(objectType)) {
    return NextResponse.json({ ok: false, error: "Invalid objectType" }, { status: 400 });
  }
  if (!objectId) {
    return NextResponse.json({ ok: false, error: "objectId is required" }, { status: 400 });
  }
  if (!status || !["ACTIVE", "PAUSED"].includes(status)) {
    return NextResponse.json({ ok: false, error: "Invalid status" }, { status: 400 });
  }
  if (!password) {
    return NextResponse.json({ ok: false, error: "חובה להזין סיסמת אימות לפעולה." }, { status: 400 });
  }

  try {
    const db = await getAdminDb();
    const config = await getMetaAdsConfig(db);
    if (!config?.adAccountId || !config.accessToken) {
      return NextResponse.json(
        { ok: false, error: "חסרה הגדרת Meta Ads (Ad Account / Access Token)." },
        { status: 400 }
      );
    }
    if (!verifyStatusTogglePassword(config, password)) {
      return NextResponse.json({ ok: false, error: "סיסמת האימות שגויה." }, { status: 403 });
    }

    await setMetaObjectStatus(config, objectId, status);
    return NextResponse.json({ ok: true, objectType, objectId, status });
  } catch (e) {
    return NextResponse.json(
      { ok: false, error: e instanceof Error ? e.message : "Status toggle failed" },
      { status: 400 }
    );
  }
}
