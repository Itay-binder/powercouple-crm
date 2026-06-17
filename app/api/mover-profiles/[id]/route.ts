import { NextRequest, NextResponse } from "next/server";
import { requireApprovedUser } from "@/lib/auth/guard";
import { getMoverProfilesDb } from "@/movers-profile/firestore";
import { normalizePhoneForAuth } from "@/movers-profile/phoneNormalize";
import type { MoverService } from "@/movers-profile/types";
import {
  getMoverProfileById,
  getMoverProfileBySlug,
  updateMoverProfile,
  deleteMoverProfile,
} from "@/movers-profile/repo";
import { normalizeMoverDisplayTheme } from "@/movers-profile/viewTheme";

export const dynamic = "force-dynamic";

const SERVICE_SET = new Set<MoverService>(["apartment", "small", "office", "loading"]);

type Ctx = { params: Promise<{ id: string }> };

export async function GET(req: NextRequest, { params }: Ctx) {
  const auth = await requireApprovedUser(req);
  if (!auth.ok) return NextResponse.json({ ok: false, error: auth.error }, { status: auth.status });

  const { id } = await params;
  const db = getMoverProfilesDb();
  const profile = await getMoverProfileById(db, id);
  if (!profile) return NextResponse.json({ ok: false, error: "Not found" }, { status: 404 });
  return NextResponse.json({ ok: true, profile });
}

export async function PATCH(req: NextRequest, { params }: Ctx) {
  const auth = await requireApprovedUser(req);
  if (!auth.ok) return NextResponse.json({ ok: false, error: auth.error }, { status: auth.status });

  const { id } = await params;
  const body = (await req.json()) as Record<string, unknown>;
  const db = getMoverProfilesDb();
  const profile = await getMoverProfileById(db, id);
  if (!profile) return NextResponse.json({ ok: false, error: "Not found" }, { status: 404 });

  const updates: Parameters<typeof updateMoverProfile>[2] = {};

  if (body.name !== undefined) {
    const n = String(body.name).trim();
    if (!n) {
      return NextResponse.json({ ok: false, error: "שם ריק" }, { status: 400 });
    }
    updates.name = n;
  }

  if (body.slug !== undefined) {
    const slug = String(body.slug).trim().toLowerCase();
    if (!/^[a-z0-9_-]+$/.test(slug) || slug.length > 64) {
      return NextResponse.json(
        { ok: false, error: "סלאג לא תקין (אנגלית קטנה, מקף, קו תחתון, ספרות)" },
        { status: 400 }
      );
    }
    if (slug !== profile.slug) {
      const taken = await getMoverProfileBySlug(db, slug);
      if (taken && taken.id !== profile.id) {
        return NextResponse.json({ ok: false, error: "סלאג זה כבר קיים" }, { status: 409 });
      }
    }
    updates.slug = slug;
  }

  if (body.phone !== undefined) {
    const phoneNorm = normalizePhoneForAuth(String(body.phone));
    if (!phoneNorm || phoneNorm.replace(/\D/g, "").length < 11) {
      return NextResponse.json({ ok: false, error: "מספר טלפון לא תקין" }, { status: 400 });
    }
    updates.phone = phoneNorm;
  }

  if (body.bio !== undefined) {
    updates.bio = String(body.bio ?? "");
  }

  if (body.coverArea !== undefined) {
    const c = String(body.coverArea ?? "").trim();
    updates.coverArea = c || profile.coverArea;
  }

  if (body.profileImageUrl !== undefined) {
    updates.profileImageUrl = String(body.profileImageUrl ?? "");
  }

  if (body.isActive !== undefined) {
    updates.isActive = Boolean(body.isActive);
  }

  if (body.services !== undefined) {
    if (!Array.isArray(body.services)) {
      return NextResponse.json({ ok: false, error: "services חייב להיות מערך" }, { status: 400 });
    }
    const services = body.services.filter((s): s is MoverService =>
      typeof s === "string" && SERVICE_SET.has(s as MoverService)
    );
    updates.services = services;
  }

  if (body.displayTheme !== undefined) {
    updates.displayTheme = normalizeMoverDisplayTheme(body.displayTheme);
  }

  if (Object.keys(updates).length === 0) {
    return NextResponse.json({ ok: false, error: "אין שדות לעדכון" }, { status: 400 });
  }

  await updateMoverProfile(db, id, updates);
  const updated = await getMoverProfileById(db, id);
  return NextResponse.json({ ok: true, profile: updated });
}

export async function DELETE(req: NextRequest, { params }: Ctx) {
  const auth = await requireApprovedUser(req);
  if (!auth.ok) return NextResponse.json({ ok: false, error: auth.error }, { status: auth.status });

  const { id } = await params;
  const db = getMoverProfilesDb();
  await deleteMoverProfile(db, id);
  return NextResponse.json({ ok: true });
}