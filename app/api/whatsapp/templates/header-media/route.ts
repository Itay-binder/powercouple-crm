import { randomUUID } from "crypto";
import { NextRequest, NextResponse } from "next/server";
import { requireApprovedUser } from "@/lib/auth/guard";
import { isAdminEmail } from "@/lib/auth/profile";
import { uploadPublicFile, formatStorageError } from "@/lib/supabase/storage";

export const dynamic = "force-dynamic";

const MAX_BYTES = 15 * 1024 * 1024;

type HeaderKind = "IMAGE" | "VIDEO" | "DOCUMENT";

function canManage(user: { profile: { role: string }; email?: string }): boolean {
  return user.profile.role === "admin" || isAdminEmail(user.email);
}

const MIME_ALLOW: Record<HeaderKind, string[]> = {
  IMAGE: ["image/jpeg", "image/jpg", "image/png", "image/webp"],
  VIDEO: ["video/mp4"],
  DOCUMENT: [
    "application/pdf",
    "audio/mpeg",
    "audio/mp3",
    "audio/x-mpeg",
    "audio/mp4",
    "audio/ogg",
    "application/ogg",
    "application/octet-stream",
  ],
};

function pickExt(kind: HeaderKind, file: File): string {
  const n = (file.name.split(".").pop() ?? "").toLowerCase();
  if (n && /^[a-z0-9]{1,8}$/.test(n)) {
    if (kind === "IMAGE" && ["jpg", "jpeg", "png", "webp"].includes(n)) return n === "jpeg" ? "jpg" : n;
    if (kind === "VIDEO" && n === "mp4") return "mp4";
    if (kind === "DOCUMENT") return n;
  }
  if (kind === "IMAGE") return "jpg";
  if (kind === "VIDEO") return "mp4";
  return "pdf";
}

export async function POST(req: NextRequest) {
  const auth = await requireApprovedUser(req);
  if (!auth.ok) {
    return NextResponse.json({ ok: false, error: auth.error }, { status: auth.status });
  }
  if (!canManage(auth.user)) {
    return NextResponse.json({ ok: false, error: "Forbidden" }, { status: 403 });
  }

  try {
    const form = await req.formData();
    const file = form.get("file");
    const kindRaw = String(form.get("kind") ?? "").trim().toUpperCase();
    if (!(file instanceof File)) {
      return NextResponse.json({ ok: false, error: "file is required" }, { status: 400 });
    }
    if (!["IMAGE", "VIDEO", "DOCUMENT"].includes(kindRaw)) {
      return NextResponse.json(
        { ok: false, error: "kind must be IMAGE, VIDEO, or DOCUMENT" },
        { status: 400 }
      );
    }
    const kind = kindRaw as HeaderKind;

    if (file.size > MAX_BYTES) {
      return NextResponse.json({ ok: false, error: "קובץ גדול מדי (מקסימום 15MB)" }, { status: 400 });
    }

    const ct = (file.type || "").toLowerCase().split(";")[0].trim();
    const allowed = MIME_ALLOW[kind];
    if (ct && !allowed.includes(ct)) {
      return NextResponse.json(
        {
          ok: false,
          error: `סוג קובץ לא מתאים לכותרת ${kind}. נסו פורמט אחר או צרפו כקובץ מתאים.`,
        },
        { status: 400 }
      );
    }

    const ext = pickExt(kind, file);
    const filePath = `whatsapp-template-headers/${kind.toLowerCase()}/${Date.now()}-${randomUUID().slice(0, 8)}.${ext}`;
    const buf = Buffer.from(await file.arrayBuffer());
    const contentType =
      ct || (kind === "IMAGE" ? "image/jpeg" : kind === "VIDEO" ? "video/mp4" : "application/pdf");
    const { url } = await uploadPublicFile(filePath, buf, contentType);

    return NextResponse.json({ ok: true, url });
  } catch (e) {
    return NextResponse.json(
      { ok: false, error: formatStorageError(e) },
      { status: 500 }
    );
  }
}
