import { NextRequest, NextResponse } from "next/server";
import { requireApprovedUser } from "@/lib/auth/guard";
import { getMoverProfilesDb } from "@/movers-profile/firestore";
import { normalizePhoneForAuth } from "@/movers-profile/phoneNormalize";
import { listMoverProfiles, createMoverProfile } from "@/movers-profile/repo";

export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  const auth = await requireApprovedUser(req);
  if (!auth.ok) return NextResponse.json({ ok: false, error: auth.error }, { status: auth.status });

  const db = getMoverProfilesDb();
  const profiles = await listMoverProfiles(db);
  return NextResponse.json({ ok: true, profiles });
}

export async function POST(req: NextRequest) {
  const auth = await requireApprovedUser(req);
  if (!auth.ok) return NextResponse.json({ ok: false, error: auth.error }, { status: auth.status });

  const body = await req.json();
  const { name, phone, slug, bio, coverArea, services } = body as Record<string, unknown>;

  if (!name || !phone || !slug) {
    return NextResponse.json({ ok: false, error: "name, phone, slug required" }, { status: 400 });
  }

  const db = getMoverProfilesDb();

  // Check slug uniqueness
  const { getMoverProfileBySlug } = await import("@/movers-profile/repo");
  const slugTrim = String(slug).trim().toLowerCase();
  if (!/^[a-z0-9_-]+$/.test(slugTrim) || slugTrim.length > 64) {
    return NextResponse.json(
      { ok: false, error: "סלאג לא תקין (אנגלית קטנה, מקף, קו תחתון, ספרות)" },
      { status: 400 }
    );
  }

  const existing = await getMoverProfileBySlug(db, slugTrim);
  if (existing) {
    return NextResponse.json({ ok: false, error: "סלאג זה כבר קיים" }, { status: 409 });
  }

  const phoneNorm = normalizePhoneForAuth(String(phone));
  if (!phoneNorm || phoneNorm.replace(/\D/g, "").length < 11) {
    return NextResponse.json({ ok: false, error: "מספר טלפון לא תקין" }, { status: 400 });
  }

  const profile = await createMoverProfile(db, {
    name: String(name).trim(),
    phone: phoneNorm,
    slug: slugTrim,
    bio: bio ? String(bio) : undefined,
    coverArea: coverArea ? String(coverArea) : undefined,
    services: Array.isArray(services) ? services : [],
  });

  return NextResponse.json({ ok: true, profile });
}