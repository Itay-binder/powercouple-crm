import { NextRequest, NextResponse } from "next/server";
import { getMoverProfilesDb } from "@/movers-profile/firestore";
import { getMoverProfileBySlug, updateMoverProfile } from "@/movers-profile/repo";
import { isAuthorisedForManage } from "@/movers-profile/manageAuth";
import { normalizeMoverDisplayTheme } from "@/movers-profile/viewTheme";

export const dynamic = "force-dynamic";

type Ctx = { params: Promise<{ slug: string }> };

export async function PATCH(req: NextRequest, { params }: Ctx) {
  const { slug } = await params;
  const db = getMoverProfilesDb();
  const profile = await getMoverProfileBySlug(db, slug);
  if (!profile) return NextResponse.json({ ok: false, error: "Not found" }, { status: 404 });

  if (!(await isAuthorisedForManage(profile))) {
    return NextResponse.json({ ok: false, error: "Unauthorized" }, { status: 401 });
  }

  const body = await req.json();
  const { name, bio, coverArea, services, profileImageUrl, displayTheme } = body;

  await updateMoverProfile(db, profile.id, {
    name: name ? String(name) : undefined,
    bio: bio !== undefined ? String(bio) : undefined,
    coverArea: coverArea ? String(coverArea) : undefined,
    services: Array.isArray(services) ? services : undefined,
    profileImageUrl: profileImageUrl !== undefined ? String(profileImageUrl) : undefined,
    ...(displayTheme !== undefined
      ? { displayTheme: normalizeMoverDisplayTheme(displayTheme) }
      : {}),
  });

  return NextResponse.json({ ok: true });
}