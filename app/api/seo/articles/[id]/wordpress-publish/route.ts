import { NextRequest, NextResponse } from "next/server";
import { requireApprovedUser } from "@/lib/auth/guard";
import { getSeoArticle } from "@/lib/seoArticles/repo";
import { publishHtmlToWordPress } from "@/lib/wordpress/publishSeoArticle";

export const dynamic = "force-dynamic";
export const revalidate = 0;

type ApiErr = { ok: false; error: string };

type Params = { params: Promise<{ id: string }> };

export async function POST(req: NextRequest, { params }: Params) {
  const auth = await requireApprovedUser(req);
  if (!auth.ok) {
    return NextResponse.json({ ok: false, error: auth.error } satisfies ApiErr, {
      status: auth.status,
    });
  }
  const { id } = await params;
  if (!id?.trim()) {
    return NextResponse.json({ ok: false, error: "חסר מזהה" } satisfies ApiErr, { status: 400 });
  }
  let status: "draft" | "publish" = "publish";
  try {
    const body = (await req.json().catch(() => ({}))) as { status?: string };
    if (body.status === "draft") status = "draft";
  } catch {
    // default publish
  }
  try {
    const article = await getSeoArticle(id.trim());
    if (!article) {
      return NextResponse.json({ ok: false, error: "לא נמצא" } satisfies ApiErr, { status: 404 });
    }
    const title = article.title.trim() || "מאמר SEO";
    const wp = await publishHtmlToWordPress({
      title,
      html: article.html,
      status,
    });
    return NextResponse.json({
      ok: true,
      wordpress: wp,
    });
  } catch (e) {
    return NextResponse.json(
      { ok: false, error: e instanceof Error ? e.message : "Unknown error" } satisfies ApiErr,
      { status: 400 }
    );
  }
}
