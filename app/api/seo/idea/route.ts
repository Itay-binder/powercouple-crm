import { NextRequest, NextResponse } from "next/server";
import { requireApprovedUser } from "@/lib/auth/guard";
import { generateIdeaForMode, type SeoIdeaMode } from "@/lib/seoAgent/ideaModes";
import type { SeoIdeaContext } from "@/lib/seoAgent/mockEngine";
import { getMergedSeoContextForIdeas } from "@/lib/seoAgent/seoSettingsRepo";

export const dynamic = "force-dynamic";
export const revalidate = 0;

type ApiErr = { ok: false; error: string };

const DISABLED = true;

export async function POST(req: NextRequest) {
  if (DISABLED) return NextResponse.json({ ok: false, error: "disabled" } satisfies ApiErr, { status: 503 });
  const auth = await requireApprovedUser(req);
  if (!auth.ok) {
    return NextResponse.json({ ok: false, error: auth.error } satisfies ApiErr, {
      status: auth.status,
    });
  }
  try {
    const merged = await getMergedSeoContextForIdeas();
    const ctx: SeoIdeaContext = {
      name: merged.name,
      blurb: merged.blurb,
      siteUrl: merged.siteUrl,
      scanFocus: merged.scanFocus,
      defaultKeywordSeeds: merged.defaultKeywordSeeds,
      knowledgeSummary: merged.knowledgeSummary,
    };
    let body: { mode?: string; seedIdea?: string; seedKeywords?: string };
    try {
      body = (await req.json()) as typeof body;
    } catch {
      body = {};
    }
    const modeRaw = String(body.mode ?? "agent").trim();
    const mode: SeoIdeaMode =
      modeRaw === "from_seed" || modeRaw === "from_keywords" ? modeRaw : "agent";
    const payload = await generateIdeaForMode(ctx, mode, {
      seedIdea: body.seedIdea,
      seedKeywords: body.seedKeywords,
    });
    if (!payload.idea.trim()) {
      return NextResponse.json(
        { ok: false, error: "חסר טקסט לפי מצב שנבחר (רעיון / מילות קידום)" } satisfies ApiErr,
        { status: 400 }
      );
    }
    return NextResponse.json({ ok: true, ...payload });
  } catch (e) {
    return NextResponse.json(
      { ok: false, error: e instanceof Error ? e.message : "Unknown error" } satisfies ApiErr,
      { status: 500 }
    );
  }
}
