import { randomUUID } from "crypto";
import { NextRequest, NextResponse } from "next/server";
import { getMoverProfilesDb } from "@/movers-profile/firestore";
import { getMoverProfileBySlug, updateMoverProfile } from "@/movers-profile/repo";
import { isAuthorisedForManage } from "@/movers-profile/manageAuth";
import { uploadPublicFile, formatStorageError } from "@/lib/supabase/storage";

export const dynamic = "force-dynamic";

type Ctx = { params: Promise<{ slug: string }> };

const MAX_BYTES = 10 * 1024 * 1024;

export async function POST(req: NextRequest, { params }: Ctx) {
  const { slug } = await params;
  const db = getMoverProfilesDb();
  const profile = await getMoverProfileBySlug(db, slug);
  if (!profile) return NextResponse.json({ ok: false, error: "Not found" }, { status: 404 });

  if (!(await isAuthorisedForManage(profile))) {
    return NextResponse.json({ ok: false, error: "Unauthorized" }, { status: 401 });
  }

  try {
    const form = await req.formData();
    const file = form.get("file");
    if (!(file instanceof File)) {
      return NextResponse.json({ ok: false, error: "file is required" }, { status: 400 });
    }
    if (file.size > MAX_BYTES) {
      return NextResponse.json({ ok: false, error: "קובץ גדול מדי (מקסימום 10MB)" }, { status: 400 });
    }

    const ext = (file.name.split(".").pop() ?? "jpg").toLowerCase();
    const filePath = `movers/${slug}/${randomUUID()}-profile.${ext}`;
    const buf = Buffer.from(await file.arrayBuffer());
    const { url: imageUrl } = await uploadPublicFile(
      filePath,
      buf,
      file.type || "image/jpeg"
    );

    await updateMoverProfile(db, profile.id, { profileImageUrl: imageUrl });

    return NextResponse.json({ ok: true, imageUrl });
  } catch (e) {
    return NextResponse.json(
      { ok: false, error: formatStorageError(e) },
      { status: 500 }
    );
  }
}
