import { randomUUID } from "crypto";
import { NextRequest, NextResponse } from "next/server";
import { getMoverProfilesDb } from "@/movers-profile/firestore";
import { getMoverProfileBySlug, addPhoto } from "@/movers-profile/repo";
import { uploadPublicFile, formatStorageError } from "@/lib/supabase/storage";
import { getMoverSession, normalizePhoneForAuth } from "@/movers-profile/session";

export const dynamic = "force-dynamic";

type Ctx = { params: Promise<{ slug: string }> };

const MAX_BYTES = 15 * 1024 * 1024;

export async function POST(req: NextRequest, { params }: Ctx) {
  const { slug } = await params;
  const db = getMoverProfilesDb();
  const profile = await getMoverProfileBySlug(db, slug);
  if (!profile || !profile.isActive) {
    return NextResponse.json({ ok: false, error: "Not found" }, { status: 404 });
  }

  try {
    const form = await req.formData();
    const file = form.get("file");
    if (!(file instanceof File)) {
      return NextResponse.json({ ok: false, error: "file is required" }, { status: 400 });
    }
    if (file.size > MAX_BYTES) {
      return NextResponse.json({ ok: false, error: "קובץ גדול מדי (מקסימום 15MB)" }, { status: 400 });
    }

    const session = await getMoverSession();
    const isMover =
      session &&
      normalizePhoneForAuth(session.phone) === normalizePhoneForAuth(profile.phone);

    const ext = (file.name.split(".").pop() ?? "jpg").toLowerCase();
    const filePath = `movers/${slug}/${randomUUID()}.${ext}`;
    const buf = Buffer.from(await file.arrayBuffer());
    const { url: photoUrl } = await uploadPublicFile(
      filePath,
      buf,
      file.type || "image/jpeg"
    );

    const photo = await addPhoto(db, profile.id, {
      url: photoUrl,
      uploadedBy: isMover ? "mover" : "customer",
    });

    return NextResponse.json({ ok: true, photo });
  } catch (e) {
    return NextResponse.json(
      { ok: false, error: formatStorageError(e) },
      { status: 500 }
    );
  }
}
