"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { formatIsraelDateTime } from "@/lib/datetime/formatIsrael";

const AUTH_REDIRECT = "CRM_SEO_AUTH_REDIRECT";

type ArticleFull = {
  id: string;
  title: string;
  slug?: string;
  idea: string;
  keywords: string[];
  html: string;
  createdAt: string | null;
  publishedAt: string | null;
  publicUrl?: string | null;
};

async function fetchJson<T>(url: string, init?: RequestInit): Promise<T> {
  const res = await fetch(url, { cache: "no-store", credentials: "include", ...init });
  if (res.status === 401) {
    window.location.href = `/login?returnTo=${encodeURIComponent("/seo")}`;
    throw new Error(AUTH_REDIRECT);
  }
  if (res.status === 403) {
    window.location.href = `/pending?returnTo=${encodeURIComponent("/seo")}`;
    throw new Error(AUTH_REDIRECT);
  }
  return res.json() as Promise<T>;
}

export default function SeoArticleViewClient({ id }: { id: string }) {
  const [article, setArticle] = useState<ArticleFull | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [publishBusy, setPublishBusy] = useState(false);
  const [wpBusy, setWpBusy] = useState(false);
  const [wpLink, setWpLink] = useState<string | null>(null);
  const [wpErr, setWpErr] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setErr(null);
    try {
      const j = await fetchJson<{ ok: boolean; article?: ArticleFull; error?: string }>(
        `/api/seo/articles/${id}`
      );
      if (!j.ok || !j.article) throw new Error(j.error || "לא נמצא");
      setArticle(j.article);
    } catch (e) {
      if ((e as Error).message !== AUTH_REDIRECT) {
        setErr((e as Error).message || "שגיאה");
      }
    } finally {
      setLoading(false);
    }
  }, [id]);

  useEffect(() => {
    void load();
  }, [load]);

  const publishToWordPress = useCallback(async () => {
    setWpErr(null);
    setWpLink(null);
    setWpBusy(true);
    try {
      const j = await fetchJson<{
        ok: boolean;
        wordpress?: { id: number; link: string };
        error?: string;
      }>(`/api/seo/articles/${id}/wordpress-publish`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status: "publish" }),
      });
      if (!j.ok) throw new Error(j.error || "שגיאה בפרסום לוורדפרס");
      setWpLink(j.wordpress?.link?.trim() || null);
    } catch (e) {
      if ((e as Error).message !== AUTH_REDIRECT) {
        setWpErr((e as Error).message || "שגיאה");
      }
    } finally {
      setWpBusy(false);
    }
  }, [id]);

  const togglePublished = useCallback(async () => {
    if (!article) return;
    setPublishBusy(true);
    try {
      const next = !article.publishedAt;
      const j = await fetchJson<{ ok: boolean; article?: ArticleFull; error?: string }>(
        `/api/seo/articles/${id}`,
        {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ published: next }),
        }
      );
      if (!j.ok || !j.article) throw new Error(j.error || "שגיאה");
      setArticle(j.article);
    } catch (e) {
      if ((e as Error).message !== AUTH_REDIRECT) {
        setErr((e as Error).message || "שגיאה");
      }
    } finally {
      setPublishBusy(false);
    }
  }, [article, id]);

  if (loading) {
    return <div style={{ color: "#6b7280" }}>טוען מאמר…</div>;
  }
  if (err || !article) {
    return (
      <div style={{ color: "#b91c1c" }}>
        {err || "לא נמצא"}{" "}
        <Link href="/seo" style={{ color: "#1d4ed8" }}>
          חזרה
        </Link>
      </div>
    );
  }

  const isPublished = Boolean(article.publishedAt);

  return (
    <div style={{ maxWidth: 1100, margin: "0 auto" }}>
      <div
        style={{
          background: "#fff",
          border: "1px solid #e5e7eb",
          borderRadius: 16,
          padding: 20,
          marginBottom: 16,
        }}
      >
        <div
          style={{
            display: "flex",
            flexWrap: "wrap",
            gap: 12,
            alignItems: "flex-start",
            justifyContent: "space-between",
          }}
        >
          <div style={{ flex: "1 1 280px", minWidth: 0 }}>
            <h1 style={{ margin: "0 0 10px", fontSize: 24, fontWeight: 800, lineHeight: 1.25 }}>
              {article.title}
            </h1>
            <div style={{ fontSize: 14, color: "#6b7280", marginBottom: 10 }}>
              נוצר: {formatIsraelDateTime(article.createdAt)}
              {isPublished ? ` · פורסם: ${formatIsraelDateTime(article.publishedAt)}` : ""}
            </div>
            <div style={{ display: "flex", flexWrap: "wrap", gap: 8 }}>
              {article.keywords.map((k) => (
                <span
                  key={k}
                  style={{
                    padding: "4px 10px",
                    borderRadius: 999,
                    background: "#eff6ff",
                    color: "#1d4ed8",
                    fontSize: 13,
                    fontWeight: 600,
                  }}
                >
                  {k}
                </span>
              ))}
            </div>
          </div>
          <div style={{ display: "flex", flexWrap: "wrap", gap: 10, alignItems: "center" }}>
            <Link
              href="/seo"
              style={{
                padding: "10px 16px",
                borderRadius: 12,
                border: "1px solid #e5e7eb",
                textDecoration: "none",
                color: "#111827",
                fontWeight: 700,
                background: "#f9fafb",
              }}
            >
              חוזר
            </Link>
            {isPublished && article.publicUrl ? (
              <Link
                href={article.publicUrl}
                target="_blank"
                rel="noopener noreferrer"
                style={{
                  padding: "10px 16px",
                  borderRadius: 12,
                  border: "1px solid #bfdbfe",
                  textDecoration: "none",
                  color: "#1d4ed8",
                  fontWeight: 700,
                  background: "#eff6ff",
                }}
              >
                פתח פוסט ציבורי
              </Link>
            ) : null}
            <button
              type="button"
              onClick={() => void togglePublished()}
              disabled={publishBusy}
              style={{
                padding: "10px 16px",
                borderRadius: 12,
                border: "none",
                fontWeight: 700,
                cursor: publishBusy ? "wait" : "pointer",
                background: isPublished ? "#fef3c7" : "#059669",
                color: isPublished ? "#92400e" : "#fff",
              }}
            >
              {publishBusy
                ? "מעדכן…"
                : isPublished
                  ? "הסר מהאתר (בטל פרסום)"
                  : "פרסם באתר"}
            </button>
            <button
              type="button"
              onClick={() => void publishToWordPress()}
              disabled={wpBusy}
              style={{
                padding: "10px 16px",
                borderRadius: 12,
                border: "1px solid #c4b5fd",
                fontWeight: 700,
                cursor: wpBusy ? "wait" : "pointer",
                background: "#f5f3ff",
                color: "#5b21b6",
              }}
              title="דורש WORDPRESS_REST_BASE, WORDPRESS_USERNAME, WORDPRESS_APP_PASSWORD בשרת"
            >
              {wpBusy ? "שולח…" : "פרסם לוורדפרס"}
            </button>
          </div>
        </div>
        {wpLink ? (
          <div
            style={{
              marginTop: 12,
              padding: 10,
              borderRadius: 10,
              fontSize: 14,
              background: "#ecfdf5",
              color: "#065f46",
            }}
          >
            פורסם בוורדפרס:{" "}
            <a href={wpLink} target="_blank" rel="noopener noreferrer" style={{ fontWeight: 700 }}>
              פתח פוסט
            </a>
          </div>
        ) : null}
        {wpErr ? (
          <div
            style={{
              marginTop: 12,
              padding: 10,
              borderRadius: 10,
              fontSize: 14,
              background: "#fef2f2",
              color: "#991b1b",
            }}
          >
            {wpErr}
          </div>
        ) : null}
      </div>

      <div
        style={{
          borderRadius: 16,
          overflow: "hidden",
          border: "1px solid #e5e7eb",
          background: "#fff",
        }}
      >
        <iframe
          title={article.title}
          sandbox="allow-same-origin"
          srcDoc={article.html}
          style={{ width: "100%", minHeight: "70vh", border: "none", display: "block" }}
        />
      </div>
    </div>
  );
}
