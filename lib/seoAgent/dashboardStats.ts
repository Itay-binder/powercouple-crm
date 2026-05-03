import { listSeoArticles } from "@/lib/seoArticles/repo";
import { mockCompetitors } from "@/lib/seoAgent/mockEngine";

function startOfWeekIsrael(d: Date): Date {
  const x = new Date(d);
  const day = x.getDay();
  const diff = (day + 6) % 7;
  x.setDate(x.getDate() - diff);
  x.setHours(0, 0, 0, 0);
  return x;
}

function startOfMonth(d: Date): Date {
  return new Date(d.getFullYear(), d.getMonth(), 1, 0, 0, 0, 0);
}

export async function getSeoDashboardSummary(): Promise<{
  competitors: ReturnType<typeof mockCompetitors>["competitors"];
  competitorsNote: string;
  articlesThisWeek: number;
  articlesThisMonth: number;
  publishedArticles: Array<{
    id: string;
    title: string;
    slug: string;
    publishedAt: string | null;
    publicUrl: string | null;
  }>;
  keywordLift: Array<{ keyword: string; count: number }>;
  note: string;
}> {
  const articles = await listSeoArticles();
  const now = new Date();
  const w0 = startOfWeekIsrael(now).getTime();
  const m0 = startOfMonth(now).getTime();

  const published = articles.filter((a) => a.publishedAt && a.publishedAt.getTime() > 0);
  const articlesThisWeek = published.filter((a) => (a.publishedAt?.getTime() ?? 0) >= w0).length;
  const articlesThisMonth = published.filter((a) => (a.publishedAt?.getTime() ?? 0) >= m0).length;

  const kwCount = new Map<string, number>();
  for (const a of articles) {
    for (const k of a.keywords) {
      const key = k.trim().toLowerCase();
      if (!key) continue;
      kwCount.set(key, (kwCount.get(key) ?? 0) + 1);
    }
  }
  const keywordLift = [...kwCount.entries()]
    .map(([keyword, count]) => ({ keyword, count }))
    .sort((a, b) => b.count - a.count || a.keyword.localeCompare(b.keyword, "he"))
    .slice(0, 20);

  const comp = mockCompetitors();

  return {
    competitors: comp.competitors,
    competitorsNote: comp.note,
    articlesThisWeek,
    articlesThisMonth,
    publishedArticles: published.slice(0, 50).map((a) => {
      const slug = a.slug.trim();
      return {
        id: a.id,
        title: a.title,
        slug,
        publishedAt: a.publishedAt ? a.publishedAt.toISOString() : null,
        publicUrl: slug ? `/blog/${encodeURIComponent(slug)}` : null,
      };
    }),
    keywordLift,
    note:
      "מילים שמופיעות במאמרים שנשמרו במערכת (תדירות). מאמר חדש עולה אוטומטית כפוסט ציבורי עם סלאג; אפשר לבטל פרסום מדף המאמר.",
  };
}
