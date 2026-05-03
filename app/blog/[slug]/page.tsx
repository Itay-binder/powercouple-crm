import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { getPublishedSeoArticleBySlug } from "@/lib/seoArticles/repo";

export const dynamic = "force-dynamic";

type Props = { params: Promise<{ slug: string }> };

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { slug } = await params;
  const article = await getPublishedSeoArticleBySlug(decodeURIComponent(slug));
  if (!article) return { title: "לא נמצא" };
  const base = process.env.CRM_SITE_URL?.replace(/\/$/, "") ?? "";
  const path = `/blog/${encodeURIComponent(article.slug)}`;
  return {
    title: article.title,
    description: article.idea.slice(0, 160),
    alternates: base ? { canonical: `${base}${path}` } : undefined,
    openGraph: base
      ? { title: article.title, url: `${base}${path}`, type: "article" }
      : { title: article.title, type: "article" },
  };
}

export default async function PublicBlogPostPage({ params }: Props) {
  const { slug } = await params;
  const article = await getPublishedSeoArticleBySlug(decodeURIComponent(slug));
  if (!article) notFound();

  return (
    <div style={{ minHeight: "100vh", background: "#f3f4f6" }}>
      <iframe
        title={article.title}
        sandbox="allow-same-origin"
        srcDoc={article.html}
        style={{ width: "100%", minHeight: "100vh", border: "none", display: "block" }}
      />
    </div>
  );
}
