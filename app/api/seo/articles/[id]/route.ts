import { NextRequest, NextResponse } from "next/server";
import { requireApprovedUser } from "@/lib/auth/guard";
import { getSeoArticle, setSeoArticlePublished } from "@/lib/seoArticles/repo";

export const dynamic = "force-dynamic";
export const revalidate = 0;

type ApiErr = { ok: false; error: string };

function fullArticle(a: NonNullable<Awaited<ReturnType<typeof getSeoArticle>>>) {
  const slug = a.slug.trim();
  return {
    id: a.id,
    title: a.title,
    slug,
    idea: a.idea,
    keywords: a.keywords,
    html: a.html,
    createdAt: a.createdAt ? a.createdAt.toISOString() : null,
    publishedAt: a.publishedAt ? a.publishedAt.toISOString() : null,
    publicUrl: slug ? `/blog/${encodeURIComponent(slug)}` : null,
  };
}

export async function GET(
  req: NextRequest,
  ctx: { params: Promise<{ id: string }> }
) {
  const auth = await requireApprovedUser(req);
  if (!auth.ok) {
    return NextResponse.json({ ok: false, error: auth.error } satisfies ApiErr, {
      status: auth.status,
    });
  }
  const { id } = await ctx.params;
  try {
    const article = await getSeoArticle(id);
    if (!article) {
      return NextResponse.json({ ok: false, error: "לא נמצא" } satisfies ApiErr, {
        status: 404,
      });
    }
    return NextResponse.json({ ok: true, article: fullArticle(article) });
  } catch (e) {
    return NextResponse.json(
      { ok: false, error: e instanceof Error ? e.message : "Unknown error" } satisfies ApiErr,
      { status: 500 }
    );
  }
}

export async function PATCH(
  req: NextRequest,
  ctx: { params: Promise<{ id: string }> }
) {
  const auth = await requireApprovedUser(req);
  if (!auth.ok) {
    return NextResponse.json({ ok: false, error: auth.error } satisfies ApiErr, {
      status: auth.status,
    });
  }
  const { id } = await ctx.params;
  try {
    const body = (await req.json()) as { published?: boolean };
    if (typeof body.published !== "boolean") {
      return NextResponse.json(
        { ok: false, error: "published נדרש" } satisfies ApiErr,
        { status: 400 }
      );
    }
    const article = await setSeoArticlePublished(id, body.published);
    return NextResponse.json({ ok: true, article: fullArticle(article) });
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Unknown error";
    const status = msg.includes("לא נמצא") ? 404 : 400;
    return NextResponse.json({ ok: false, error: msg } satisfies ApiErr, { status });
  }
}
