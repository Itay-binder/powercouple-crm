import { NextRequest, NextResponse } from "next/server";
import { requireApprovedUser } from "@/lib/auth/guard";
import { createSeoArticle, listSeoArticles } from "@/lib/seoArticles/repo";
import { buildArticleHtml, titleFromIdea } from "@/lib/seoAgent/mockEngine";

export const dynamic = "force-dynamic";
export const revalidate = 0;

type ApiErr = { ok: false; error: string };

function serializeArticle(a: Awaited<ReturnType<typeof listSeoArticles>>[number]) {
  const slug = a.slug.trim();
  return {
    id: a.id,
    title: a.title,
    slug,
    idea: a.idea,
    keywords: a.keywords,
    createdAt: a.createdAt ? a.createdAt.toISOString() : null,
    publishedAt: a.publishedAt ? a.publishedAt.toISOString() : null,
    publicUrl: slug ? `/blog/${encodeURIComponent(slug)}` : null,
  };
}

export async function GET(req: NextRequest) {
  const auth = await requireApprovedUser(req);
  if (!auth.ok) {
    return NextResponse.json({ ok: false, error: auth.error } satisfies ApiErr, {
      status: auth.status,
    });
  }
  try {
    const list = await listSeoArticles();
    return NextResponse.json({ ok: true, articles: list.map(serializeArticle) });
  } catch (e) {
    return NextResponse.json(
      { ok: false, error: e instanceof Error ? e.message : "Unknown error" } satisfies ApiErr,
      { status: 500 }
    );
  }
}

export async function POST(req: NextRequest) {
  const auth = await requireApprovedUser(req);
  if (!auth.ok) {
    return NextResponse.json({ ok: false, error: auth.error } satisfies ApiErr, {
      status: auth.status,
    });
  }
  try {
    const body = (await req.json()) as {
      title?: string;
      idea?: string;
      keywords?: string[];
      html?: string;
      /** ברירת מחדל true — המאמר עולה מיד כפוסט ציבורי עם סלאג */
      autoPublish?: boolean;
    };
    const idea = String(body.idea ?? "").trim();
    const keywords = Array.isArray(body.keywords) ? body.keywords.map(String) : [];
    const title = (body.title?.trim() || titleFromIdea(idea)) || "מאמר SEO";
    const html =
      body.html?.trim() ||
      (await buildArticleHtml({ title, idea: idea || title, keywords }));
    const autoPublish = body.autoPublish !== false;
    const article = await createSeoArticle({
      title,
      idea: idea || title,
      keywords,
      html,
      autoPublish,
    });
    return NextResponse.json({
      ok: true,
      article: { ...serializeArticle(article), html: article.html },
    });
  } catch (e) {
    return NextResponse.json(
      { ok: false, error: e instanceof Error ? e.message : "Unknown error" } satisfies ApiErr,
      { status: 400 }
    );
  }
}
