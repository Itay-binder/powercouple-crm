import { NextRequest, NextResponse } from "next/server";
import { getMoverProfilesDb } from "@/movers-profile/firestore";
import {
  deletePhotoDoc,
  getMoverProfileBySlug,
  togglePhotoHidden,
} from "@/movers-profile/repo";
import { isAuthorisedForManage } from "@/movers-profile/manageAuth";
import { deletePublicFile, STORAGE_BUCKET } from "@/lib/supabase/storage";

/** Extract the storage object path from a Supabase public URL. */
function objectPathFromSupabaseUrl(url: string): string | null {
  try {
    const u = new URL(url);
    const marker = `/storage/v1/object/public/${STORAGE_BUCKET}/`;
    const idx = u.pathname.indexOf(marker);
    if (idx === -1) return null;
    return decodeURIComponent(u.pathname.slice(idx + marker.length));
  } catch {
    return null;
  }
}

export const dynamic = "force-dynamic";

type Ctx = { params: Promise<{ slug: string; photoId: string }> };

export async function PATCH(req: NextRequest, { params }: Ctx) {
  const { slug, photoId } = await params;
  const db = getMoverProfilesDb();
  const profile = await getMoverProfileBySlug(db, slug);
  if (!profile) return NextResponse.json({ ok: false, error: "Not found" }, { status: 404 });

  if (!(await isAuthorisedForManage(profile))) {
    return NextResponse.json({ ok: false, error: "Unauthorized" }, { status: 401 });
  }

  const { isHidden } = await req.json();
  await togglePhotoHidden(db, profile.id, photoId, Boolean(isHidden));
  return NextResponse.json({ ok: true });
}

export async function DELETE(_req: NextRequest, { params }: Ctx) {
  const { slug, photoId } = await params;
  const db = getMoverProfilesDb();
  const profile = await getMoverProfileBySlug(db, slug);
  if (!profile) return NextResponse.json({ ok: false, error: "Not found" }, { status: 404 });

  if (!(await isAuthorisedForManage(profile))) {
    return NextResponse.json({ ok: false, error: "Unauthorized" }, { status: 401 });
  }

  const removed = await deletePhotoDoc(db, profile.id, photoId);
  if (!removed) {
    return NextResponse.json({ ok: false, error: "לא נמצאה תמונה" }, { status: 404 });
  }

  const objectPath = removed.url ? objectPathFromSupabaseUrl(removed.url) : null;
  if (objectPath) {
    try {
      await deletePublicFile(objectPath);
    } catch {
      /* רשומת הנתונים כבר נמחקה */
    }
  }

  return NextResponse.json({ ok: true });
}