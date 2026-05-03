import { NextRequest, NextResponse } from "next/server";
import { requireApprovedUser } from "@/lib/auth/guard";
import { getAdminDb } from "@/lib/firebase/admin";
import { getSeoAgentSettings, saveSeoAgentSettings } from "@/lib/seoAgent/seoSettingsRepo";

export const dynamic = "force-dynamic";
export const revalidate = 0;

type ApiErr = { ok: false; error: string };

export async function GET(req: NextRequest) {
  const auth = await requireApprovedUser(req);
  if (!auth.ok) {
    return NextResponse.json({ ok: false, error: auth.error } satisfies ApiErr, {
      status: auth.status,
    });
  }
  try {
    const db = await getAdminDb();
    const settings = await getSeoAgentSettings(db);
    return NextResponse.json({ ok: true, settings });
  } catch (e) {
    return NextResponse.json(
      { ok: false, error: e instanceof Error ? e.message : "Unknown error" } satisfies ApiErr,
      { status: 500 }
    );
  }
}

export async function PUT(req: NextRequest) {
  const auth = await requireApprovedUser(req);
  if (!auth.ok) {
    return NextResponse.json({ ok: false, error: auth.error } satisfies ApiErr, {
      status: auth.status,
    });
  }
  try {
    const body = (await req.json()) as Partial<{
      siteUrl: string;
      scanFocus: string;
      businessName: string;
      businessBlurb: string;
      defaultKeywordSeeds: string;
      knowledgeDocs: Array<{ id: string; title: string; content: string }>;
    }>;
    const db = await getAdminDb();
    const settings = await saveSeoAgentSettings(db, {
      siteUrl: body.siteUrl,
      scanFocus: body.scanFocus,
      businessName: body.businessName,
      businessBlurb: body.businessBlurb,
      defaultKeywordSeeds: body.defaultKeywordSeeds,
      knowledgeDocs: body.knowledgeDocs,
    });
    return NextResponse.json({ ok: true, settings });
  } catch (e) {
    return NextResponse.json(
      { ok: false, error: e instanceof Error ? e.message : "Unknown error" } satisfies ApiErr,
      { status: 500 }
    );
  }
}
