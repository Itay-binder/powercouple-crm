import { NextRequest, NextResponse } from "next/server";
import { getMoverProfilesDb } from "@/movers-profile/firestore";
import { getMoverProfileBySlug, getReviews, getPhotos } from "@/movers-profile/repo";

export const dynamic = "force-dynamic";

type Ctx = { params: Promise<{ slug: string }> };

export async function GET(_req: NextRequest, { params }: Ctx) {
  const { slug } = await params;
  const db = getMoverProfilesDb();
  const profile = await getMoverProfileBySlug(db, slug);

  if (!profile || !profile.isActive) {
    return NextResponse.json({ ok: false, error: "Not found" }, { status: 404 });
  }

  const [reviews, photos] = await Promise.all([
    getReviews(db, profile.id, false),
    getPhotos(db, profile.id, false),
  ]);

  return NextResponse.json({ ok: true, profile, reviews, photos });
}