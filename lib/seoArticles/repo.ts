import { FieldValue } from "firebase-admin/firestore";
import type { Firestore } from "firebase-admin/firestore";
import { getAdminDb, getFirestoreForDatabaseId } from "@/lib/firebase/admin";
import { generateAgentSlug } from "@/lib/seoAgent/slug";

export type SeoArticleRecord = {
  id: string;
  title: string;
  slug: string;
  idea: string;
  keywords: string[];
  html: string;
  createdAt: Date | null;
  publishedAt: Date | null;
};

function mapTs(ts: unknown): Date | null {
  if (ts && typeof ts === "object" && "toDate" in ts) {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    return (ts as any).toDate?.() ?? null;
  }
  return null;
}

function mapDoc(id: string, d: Record<string, unknown>): SeoArticleRecord {
  return {
    id,
    title: String(d.title ?? ""),
    slug: String(d.slug ?? ""),
    idea: String(d.idea ?? ""),
    keywords: Array.isArray(d.keywords) ? d.keywords.map((x) => String(x)) : [],
    html: String(d.html ?? ""),
    createdAt: mapTs(d.createdAt),
    publishedAt: mapTs(d.publishedAt),
  };
}

async function getBlogFirestore(): Promise<Firestore> {
  const id = process.env.CRM_PUBLIC_BLOG_DATABASE_ID?.trim();
  if (id) return getFirestoreForDatabaseId(id);
  return getAdminDb();
}

async function ensureUniqueSlug(db: Firestore, base: string): Promise<string> {
  const root = base.trim().toLowerCase() || "post";
  let candidate = root.slice(0, 96);
  let n = 0;
  for (;;) {
    const snap = await db.collection("seoArticles").where("slug", "==", candidate).limit(1).get();
    if (snap.empty) return candidate;
    n += 1;
    candidate = `${root}-${n}`.slice(0, 96);
  }
}

export async function getPublishedSeoArticleBySlug(
  slug: string
): Promise<SeoArticleRecord | null> {
  const s = slug.trim().toLowerCase();
  if (!s) return null;
  const db = await getBlogFirestore();
  const snap = await db.collection("seoArticles").where("slug", "==", s).limit(8).get();
  if (snap.empty) return null;
  const articles = snap.docs.map((doc) =>
    mapDoc(doc.id, (doc.data() ?? {}) as Record<string, unknown>)
  );
  const published = articles.filter((a) => a.publishedAt && a.publishedAt.getTime() > 0);
  if (!published.length) return null;
  published.sort((a, b) => (b.publishedAt?.getTime() ?? 0) - (a.publishedAt?.getTime() ?? 0));
  return published[0] ?? null;
}

export async function listSeoArticles(): Promise<SeoArticleRecord[]> {
  const db = await getAdminDb();
  const snap = await db.collection("seoArticles").get();
  const out = snap.docs.map((doc) => mapDoc(doc.id, (doc.data() ?? {}) as Record<string, unknown>));
  return out.sort((a, b) => {
    const at = a.createdAt?.getTime() ?? 0;
    const bt = b.createdAt?.getTime() ?? 0;
    return bt - at;
  });
}

export async function getSeoArticle(id: string): Promise<SeoArticleRecord | null> {
  const db = await getAdminDb();
  const ref = db.collection("seoArticles").doc(id);
  const snap = await ref.get();
  if (!snap.exists) return null;
  return mapDoc(snap.id, (snap.data() ?? {}) as Record<string, unknown>);
}

export async function createSeoArticle(input: {
  title: string;
  idea: string;
  keywords: string[];
  html: string;
  /** כש־true — המאמר עולה מיד כפוסט ציבורי (publishedAt). */
  autoPublish?: boolean;
}): Promise<SeoArticleRecord> {
  const now = FieldValue.serverTimestamp();
  const db = await getAdminDb();
  const ref = await db.collection("seoArticles").add({
    title: input.title.trim(),
    idea: input.idea.trim(),
    keywords: input.keywords.map((k) => k.trim()).filter(Boolean),
    html: input.html,
    createdAt: now,
    publishedAt: input.autoPublish ? now : null,
    slug: "",
  });
  const id = ref.id;
  const baseSlug = generateAgentSlug({
    title: input.title.trim(),
    keywords: input.keywords.map((k) => k.trim()).filter(Boolean),
    articleId: id,
  });
  const slug = await ensureUniqueSlug(db, baseSlug);
  await ref.update({ slug });
  const snap = await ref.get();
  return mapDoc(snap.id, (snap.data() ?? {}) as Record<string, unknown>);
}

export async function setSeoArticlePublished(
  id: string,
  published: boolean
): Promise<SeoArticleRecord> {
  const db = await getAdminDb();
  const docRef = db.collection("seoArticles").doc(id);
  const snap = await docRef.get();
  if (!snap.exists) throw new Error("מאמר לא נמצא");
  const cur = mapDoc(snap.id, (snap.data() ?? {}) as Record<string, unknown>);

  let slug = cur.slug.trim();
  if (published && !slug) {
    slug = await ensureUniqueSlug(
      db,
      generateAgentSlug({
        title: cur.title,
        keywords: cur.keywords,
        articleId: id,
      })
    );
  }

  await docRef.set(
    {
      publishedAt: published ? FieldValue.serverTimestamp() : null,
      ...(published && slug ? { slug } : {}),
    },
    { merge: true }
  );
  const again = await docRef.get();
  return mapDoc(again.id, (again.data() ?? {}) as Record<string, unknown>);
}
