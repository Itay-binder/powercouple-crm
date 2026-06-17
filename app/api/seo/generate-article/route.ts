import { NextRequest, NextResponse } from "next/server";
import { requireApprovedUser } from "@/lib/auth/guard";
import { buildArticleHtml, titleFromIdea } from "@/lib/seoAgent/mockEngine";
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
    const body = (await req.json()) as { idea?: string; keywords?: string[]; title?: string };
    const idea = String(body.idea ?? "").trim();
    const keywords = Array.isArray(body.keywords) ? body.keywords.map(String) : [];
    if (!idea) {
      return NextResponse.json(
        { ok: false, error: "חסר רעיון למאמר" } satisfies ApiErr,
        { status: 400 }
      );
    }
    const title = body.title?.trim() || titleFromIdea(idea);
    const brand = await getMergedSeoContextForIdeas();
    const html = await buildArticleHtml({
      title,
      idea,
      keywords,
      brandName: brand.name,
      brandBlurb: brand.blurb,
    });
    return NextResponse.json({ ok: true, title, idea, keywords, html });
  } catch (e) {
    return NextResponse.json(
      { ok: false, error: e instanceof Error ? e.message : "Unknown error" } satisfies ApiErr,
      { status: 500 }
    );
  }
}
