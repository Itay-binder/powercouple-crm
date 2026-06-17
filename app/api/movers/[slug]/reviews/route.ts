import { NextRequest, NextResponse } from "next/server";
import { getMoverProfilesDb } from "@/movers-profile/firestore";
import { getMoverProfileBySlug, getReviews } from "@/movers-profile/repo";

export const dynamic = "force-dynamic";

type Ctx = { params: Promise<{ slug: string }> };

export async function GET(_req: NextRequest, { params }: Ctx) {
  const { slug } = await params;
  const db = getMoverProfilesDb();
  const profile = await getMoverProfileBySlug(db, slug);
  if (!profile) return NextResponse.json({ ok: false, error: "Not found" }, { status: 404 });

  const reviews = await getReviews(db, profile.id, false);
  return NextResponse.json({ ok: true, reviews });
}

/**
 * Posting a review required Google ID-token verification via Firebase Auth, which
 * was removed in the Supabase migration. Disabled until reimplemented on Supabase.
 */
export async function POST() {
  return NextResponse.json(
    { ok: false, error: "שליחת המלצות אינה זמינה כעת" },
    { status: 501 }
  );
}
