import { NextRequest, NextResponse } from "next/server";
import { requireApprovedUser } from "@/lib/auth/guard";
import { userFirestoreDocumentId } from "@/lib/auth/profile";
import { getAdminDb } from "@/lib/firebase/admin";
import { appendNotificationPermissionLog } from "@/lib/push/notificationPermissionLog";

export const dynamic = "force-dynamic";
export const revalidate = 0;

export async function GET(req: NextRequest) {
  const auth = await requireApprovedUser(req);
  if (!auth.ok) {
    return NextResponse.json({ ok: false, error: auth.error }, { status: auth.status });
  }
  try {
    const db = await getAdminDb();
    const docId = userFirestoreDocumentId(auth.user.email, auth.user.uid);
    const snap = await db.collection("users").doc(docId).get();
    const d = (snap.data() ?? {}) as Record<string, unknown>;
    const last = d.notificationPermissionLast ?? null;
    const log = Array.isArray(d.notificationPermissionLog)
      ? (d.notificationPermissionLog as unknown[]).slice(-30)
      : [];
    return NextResponse.json({ ok: true, last, log });
  } catch (e) {
    return NextResponse.json(
      { ok: false, error: e instanceof Error ? e.message : "Unknown error" },
      { status: 500 }
    );
  }
}

type Body = {
  action: "request" | "granted" | "denied" | "default" | "unsupported";
  permissionVersion?: number;
  userAgent?: string;
  platform?: string;
  language?: string;
  deviceFingerprint?: string;
};

export async function POST(req: NextRequest) {
  const auth = await requireApprovedUser(req);
  if (!auth.ok) {
    return NextResponse.json({ ok: false, error: auth.error }, { status: auth.status });
  }
  let body: Body;
  try {
    body = (await req.json()) as Body;
  } catch {
    return NextResponse.json({ ok: false, error: "Invalid JSON" }, { status: 400 });
  }
  if (!["request", "granted", "denied", "default", "unsupported"].includes(body.action)) {
    return NextResponse.json({ ok: false, error: "Invalid action" }, { status: 400 });
  }
  try {
    const db = await getAdminDb();
    const docId = userFirestoreDocumentId(auth.user.email, auth.user.uid);
    await appendNotificationPermissionLog(db, docId, {
      action: body.action,
      permissionVersion: typeof body.permissionVersion === "number" ? body.permissionVersion : null,
      userAgent: String(body.userAgent ?? "").slice(0, 500) || null,
      platform: String(body.platform ?? "").slice(0, 120) || null,
      language: String(body.language ?? "").slice(0, 40) || null,
      deviceFingerprint: String(body.deviceFingerprint ?? "").slice(0, 80) || null,
    });
    return NextResponse.json({ ok: true });
  } catch (e) {
    return NextResponse.json(
      { ok: false, error: e instanceof Error ? e.message : "Unknown error" },
      { status: 500 }
    );
  }
}
