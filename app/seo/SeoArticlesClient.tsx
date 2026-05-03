"use client";

import { useCallback, useState } from "react";
import useSWR from "swr";
import Link from "next/link";
import { formatIsraelDateTime } from "@/lib/datetime/formatIsrael";

const AUTH_REDIRECT = "CRM_SEO_AUTH_REDIRECT";

type ArticleListItem = {
  id: string;
  title: string;
  slug?: string;
  idea: string;
  keywords: string[];
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

type IdeaMode = "agent" | "from_seed" | "from_keywords";

export default function SeoArticlesClient() {
  const [ideaMode, setIdeaMode] = useState<IdeaMode>("agent");
  const [seedIdea, setSeedIdea] = useState("");
  const [seedKeywords, setSeedKeywords] = useState("");
  const [idea, setIdea] = useState("");
  const [keywords, setKeywords] = useState<string[]>([]);
  const [keywordDraft, setKeywordDraft] = useState("");
  const [draftTitle, setDraftTitle] = useState("");
  const [previewHtml, setPreviewHtml] = useState<string | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [ideaApproved, setIdeaApproved] = useState(false);

  const {
    data: listData,
    error: listErr,
    isLoading: listLoading,
    mutate: mutateList,
  } = useSWR(
    "/api/seo/articles",
    async (url) => {
      const j = await fetchJson<{ ok: boolean; articles?: ArticleListItem[]; error?: string }>(url);
      if (!j.ok) throw new Error(j.error || "שגיאה");
      return j.articles ?? [];
    },
    { revalidateOnFocus: true }
  );

  const articles = listData ?? [];

  const onIdea = useCallback(async () => {
    setErr(null);
    setBusy("idea");
    setIdeaApproved(false);
    try {
      const body = JSON.stringify({
        mode: ideaMode,
        seedIdea: ideaMode === "from_seed" ? seedIdea : undefined,
        seedKeywords: ideaMode === "from_keywords" ? seedKeywords : undefined,
      });
      const j = await fetchJson<{ ok: boolean; idea?: string; keywords?: string[]; error?: string }>(
        "/api/seo/idea",
        { method: "POST", headers: { "Content-Type": "application/json" }, body }
      );
      if (!j.ok || !j.idea) throw new Error(j.error || "שגיאה ביצירת רעיון");
      setIdea(j.idea);
      setKeywords(Array.isArray(j.keywords) ? j.keywords : []);
      setDraftTitle("");
      setPreviewHtml(null);
    } catch (e) {
      if ((e as Error).message !== AUTH_REDIRECT) {
        setErr((e as Error).message || "שגיאה");
      }
    } finally {
      setBusy(null);
    }
  }, [ideaMode, seedIdea, seedKeywords]);

  const onGenerate = useCallback(async () => {
    setErr(null);
    if (!idea.trim()) {
      setErr("קודם צרו רעיון או הדביקו רעיון בשדה.");
      return;
    }
    if (!ideaApproved) {
      setErr('לחצו קודם על "אישרתי את הרעיון והמילים" לפני יצירת המאמר.');
      return;
    }
    setBusy("gen");
    try {
      const j = await fetchJson<{
        ok: boolean;
        title?: string;
        html?: string;
        error?: string;
      }>("/api/seo/generate-article", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ idea, keywords, title: draftTitle.trim() || undefined }),
      });
      if (!j.ok || !j.html) throw new Error(j.error || "שגיאה ביצירת מאמר");
      setDraftTitle(j.title || "");
      setPreviewHtml(j.html);
    } catch (e) {
      if ((e as Error).message !== AUTH_REDIRECT) {
        setErr((e as Error).message || "שגיאה");
      }
    } finally {
      setBusy(null);
    }
  }, [idea, keywords, draftTitle, ideaApproved]);

  const onSave = useCallback(async () => {
    setErr(null);
    if (!previewHtml) {
      setErr("אין תצוגה מקדימה לשמירה. צרו מאמר קודם.");
      return;
    }
    setBusy("save");
    try {
      const j = await fetchJson<{ ok: boolean; article?: { id: string }; error?: string }>(
        "/api/seo/articles",
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            title: draftTitle.trim() || undefined,
            idea,
            keywords,
            html: previewHtml,
          }),
        }
      );
      if (!j.ok || !j.article?.id) throw new Error(j.error || "שגיאה בשמירה");
      await mutateList();
      setPreviewHtml(null);
      setIdea("");
      setKeywords([]);
      setDraftTitle("");
      setIdeaApproved(false);
    } catch (e) {
      if ((e as Error).message !== AUTH_REDIRECT) {
        setErr((e as Error).message || "שגיאה");
      }
    } finally {
      setBusy(null);
    }
  }, [previewHtml, draftTitle, idea, keywords, mutateList]);

  const addKeyword = useCallback(() => {
    const t = keywordDraft.trim();
    if (!t) return;
    setKeywords((prev) => (prev.includes(t) ? prev : [...prev, t]));
    setKeywordDraft("");
    setIdeaApproved(false);
  }, [keywordDraft]);

  const removeKeywordAt = useCallback((index: number) => {
    setKeywords((prev) => prev.filter((_, i) => i !== index));
    setIdeaApproved(false);
  }, []);

  return (
    <div style={{ maxWidth: 960, margin: "0 auto" }}>
      <h1 style={{ margin: "0 0 8px", fontSize: 22, fontWeight: 800 }}>יצירת מאמר</h1>
      <p style={{ margin: "0 0 18px", color: "#6b7280", lineHeight: 1.5 }}>
        הקשר מגיע מ־
        <Link href="/seo/settings" style={{ color: "#2563eb", fontWeight: 600 }}>
          הגדרות + מאגר ידע
        </Link>
        , ומתוך שליפת טקסט מהאתר (אם הוגדר). בחרו מצב רעיון, ערכו במידת הצורך,{" "}
        <strong>אשרו</strong> ואז צרו מאמר. פרסום לוורדפרס — מדף המאמר אחרי שמירה (משתני סביבה בשרת).
      </p>

      <div
        style={{
          display: "flex",
          flexWrap: "wrap",
          gap: 8,
          marginBottom: 16,
          padding: 10,
          background: "#f9fafb",
          borderRadius: 12,
          border: "1px solid #e5e7eb",
        }}
      >
        {(
          [
            { id: "agent" as const, label: "סוכן לפי העסק והאתר" },
            { id: "from_seed" as const, label: "מתוך הרעיון שלי" },
            { id: "from_keywords" as const, label: "מתוך מילות קידום" },
          ] as const
        ).map((m) => (
          <button
            key={m.id}
            type="button"
            onClick={() => {
              setIdeaMode(m.id);
              setIdeaApproved(false);
            }}
            style={{
              padding: "8px 14px",
              borderRadius: 10,
              border: ideaMode === m.id ? "2px solid #2563eb" : "1px solid #e5e7eb",
              background: ideaMode === m.id ? "#eff6ff" : "#fff",
              fontWeight: 700,
              cursor: "pointer",
              fontSize: 13,
            }}
          >
            {m.label}
          </button>
        ))}
      </div>

      {ideaMode === "from_seed" ? (
        <div style={{ marginBottom: 16 }}>
          <label style={{ fontWeight: 600, fontSize: 14 }}>הרעיון שלי (טקסט חופשי)</label>
          <textarea
            value={seedIdea}
            onChange={(e) => {
              setSeedIdea(e.target.value);
              setIdeaApproved(false);
            }}
            rows={3}
            placeholder="למשל: מאמר על מחירון הובלות בקיץ 2026…"
            style={{
              width: "100%",
              marginTop: 6,
              padding: "10px 12px",
              borderRadius: 10,
              border: "1px solid #e5e7eb",
              fontFamily: "inherit",
            }}
          />
        </div>
      ) : null}

      {ideaMode === "from_keywords" ? (
        <div style={{ marginBottom: 16 }}>
          <label style={{ fontWeight: 600, fontSize: 14 }}>מילות קידום (פסיקים או שורות)</label>
          <textarea
            value={seedKeywords}
            onChange={(e) => {
              setSeedKeywords(e.target.value);
              setIdeaApproved(false);
            }}
            rows={2}
            placeholder="הובלות דירה, מחירון אריזה…"
            style={{
              width: "100%",
              marginTop: 6,
              padding: "10px 12px",
              borderRadius: 10,
              border: "1px solid #e5e7eb",
              fontFamily: "inherit",
            }}
          />
        </div>
      ) : null}

      {err ? (
        <div
          style={{
            marginBottom: 16,
            padding: 12,
            borderRadius: 12,
            background: "#fef2f2",
            border: "1px solid #fecaca",
            color: "#991b1b",
          }}
        >
          {err}
        </div>
      ) : null}

      <div
        style={{
          background: "#fff",
          border: "1px solid #e5e7eb",
          borderRadius: 16,
          padding: 20,
          marginBottom: 20,
        }}
      >
        <div style={{ display: "flex", flexWrap: "wrap", gap: 10, alignItems: "center" }}>
          <button
            type="button"
            onClick={() => void onIdea()}
            disabled={
              busy !== null ||
              (ideaMode === "from_seed" && !seedIdea.trim()) ||
              (ideaMode === "from_keywords" && !seedKeywords.trim())
            }
            style={{
              padding: "10px 18px",
              borderRadius: 12,
              border: "none",
              background: "#2563eb",
              color: "#fff",
              fontWeight: 700,
              cursor: busy ? "wait" : "pointer",
            }}
          >
            {busy === "idea" ? "יוצר…" : "צור רעיון"}
          </button>
          <button
            type="button"
            onClick={() => setIdeaApproved(true)}
            disabled={!idea.trim()}
            style={{
              padding: "10px 18px",
              borderRadius: 12,
              border: ideaApproved ? "2px solid #059669" : "1px solid #6ee7b7",
              background: ideaApproved ? "#ecfdf5" : "#fff",
              fontWeight: 700,
              cursor: !idea.trim() ? "not-allowed" : "pointer",
              color: !idea.trim() ? "#94a3b8" : "#065f46",
            }}
          >
            {ideaApproved ? "✓ אושר — אפשר ליצור מאמר" : "אישרתי את הרעיון והמילים"}
          </button>
          <button
            type="button"
            onClick={() => void onGenerate()}
            disabled={busy !== null || !idea.trim() || !ideaApproved}
            style={{
              padding: "10px 18px",
              borderRadius: 12,
              border: "1px solid #cbd5e1",
              background: idea.trim() && ideaApproved ? "#f8fafc" : "#f1f5f9",
              fontWeight: 700,
              cursor: busy || !idea.trim() || !ideaApproved ? "not-allowed" : "pointer",
              color: idea.trim() && ideaApproved ? "#0f172a" : "#94a3b8",
            }}
          >
            {busy === "gen" ? "יוצר מאמר…" : "צור מאמר"}
          </button>
          {previewHtml ? (
            <button
              type="button"
              onClick={() => void onSave()}
              disabled={busy !== null}
              style={{
                padding: "10px 18px",
                borderRadius: 12,
                border: "none",
                background: "#059669",
                color: "#fff",
                fontWeight: 700,
                cursor: busy ? "wait" : "pointer",
              }}
            >
              {busy === "save" ? "שומר…" : "שמור מאמר"}
            </button>
          ) : null}
        </div>

        <label style={{ display: "block", marginTop: 18, fontWeight: 600, fontSize: 14 }}>
          כותרת (אופציונלי)
        </label>
        <input
          value={draftTitle}
          onChange={(e) => setDraftTitle(e.target.value)}
          placeholder="יומלא אוטומטית מהרעיון אם תשאירו ריק"
          style={{
            width: "100%",
            marginTop: 6,
            padding: "10px 12px",
            borderRadius: 10,
            border: "1px solid #e5e7eb",
            fontSize: 15,
          }}
        />

        <label style={{ display: "block", marginTop: 16, fontWeight: 600, fontSize: 14 }}>
          רעיון למאמר
        </label>
        <textarea
          value={idea}
          onChange={(e) => {
            setIdea(e.target.value);
            setIdeaApproved(false);
          }}
          rows={5}
          style={{
            width: "100%",
            marginTop: 6,
            padding: "10px 12px",
            borderRadius: 10,
            border: "1px solid #e5e7eb",
            fontSize: 15,
            resize: "vertical",
            fontFamily: "inherit",
          }}
        />

        <div style={{ marginTop: 12 }}>
          <div style={{ fontWeight: 600, fontSize: 14, marginBottom: 6 }}>
            מילות חיפוש לשילוב במאמר (ניתן לערוך, להסיר ולהוסיף)
          </div>
          <div style={{ display: "flex", flexWrap: "wrap", gap: 8, alignItems: "center" }}>
            {keywords.length ? (
              keywords.map((k, i) => (
                <span
                  key={`${i}-${k}`}
                  style={{
                    display: "inline-flex",
                    alignItems: "center",
                    gap: 6,
                    padding: "4px 4px 4px 10px",
                    borderRadius: 999,
                    background: "#eff6ff",
                    color: "#1d4ed8",
                    fontSize: 13,
                    fontWeight: 600,
                  }}
                >
                  {k}
                  <button
                    type="button"
                    onClick={() => removeKeywordAt(i)}
                    title="הסר"
                    style={{
                      border: "none",
                      background: "rgba(255,255,255,0.7)",
                      borderRadius: 999,
                      width: 22,
                      height: 22,
                      cursor: "pointer",
                      fontSize: 14,
                      lineHeight: 1,
                      color: "#1e40af",
                    }}
                  >
                    ×
                  </button>
                </span>
              ))
            ) : (
              <span style={{ color: "#9ca3af", fontSize: 14 }}>הוסיפו מילים או לחצו &quot;צור רעיון&quot;</span>
            )}
          </div>
          <div style={{ display: "flex", flexWrap: "wrap", gap: 8, marginTop: 10, alignItems: "center" }}>
            <input
              value={keywordDraft}
              onChange={(e) => setKeywordDraft(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter") {
                  e.preventDefault();
                  addKeyword();
                }
              }}
              placeholder="מילה או ביטוי — Enter להוספה"
              style={{
                flex: "1 1 200px",
                minWidth: 160,
                padding: "8px 12px",
                borderRadius: 10,
                border: "1px solid #e5e7eb",
                fontSize: 14,
              }}
            />
            <button
              type="button"
              onClick={addKeyword}
              disabled={!keywordDraft.trim()}
              style={{
                padding: "8px 14px",
                borderRadius: 10,
                border: "1px solid #cbd5e1",
                background: keywordDraft.trim() ? "#fff" : "#f1f5f9",
                fontWeight: 600,
                cursor: keywordDraft.trim() ? "pointer" : "not-allowed",
                color: keywordDraft.trim() ? "#0f172a" : "#94a3b8",
              }}
            >
              הוסף מילה
            </button>
          </div>
        </div>
      </div>

      {previewHtml ? (
        <div style={{ marginBottom: 28 }}>
          <h2 style={{ fontSize: 18, fontWeight: 800, margin: "0 0 10px" }}>תצוגה מקדימה</h2>
          <div
            style={{
              borderRadius: 16,
              overflow: "hidden",
              border: "1px solid #e5e7eb",
              background: "#fff",
              minHeight: 420,
            }}
          >
            <iframe
              title="תצוגה מקדימה למאמר"
              sandbox="allow-same-origin"
              srcDoc={previewHtml}
              style={{ width: "100%", height: 520, border: "none", display: "block" }}
            />
          </div>
        </div>
      ) : null}

      <hr style={{ border: "none", borderTop: "1px solid #e5e7eb", margin: "28px 0" }} />

      <h2 style={{ fontSize: 18, fontWeight: 800, margin: "0 0 14px" }}>מאמרים שכבר נוצרו</h2>
      {listErr ? (
        <div style={{ color: "#b91c1c" }}>{(listErr as Error).message}</div>
      ) : listLoading ? (
        <div style={{ color: "#6b7280" }}>טוען…</div>
      ) : articles.length === 0 ? (
        <div style={{ color: "#6b7280" }}>עדיין אין מאמרים. שמרו מאמר מהתצוגה המקדימה.</div>
      ) : (
        <ul style={{ listStyle: "none", padding: 0, margin: 0, display: "grid", gap: 10 }}>
          {articles.map((a) => (
            <li key={a.id}>
              <Link
                href={`/seo/articles/${a.id}`}
                style={{
                  display: "block",
                  padding: 14,
                  borderRadius: 14,
                  background: "#fff",
                  border: "1px solid #e5e7eb",
                  textDecoration: "none",
                  color: "#111827",
                }}
              >
                <div style={{ fontWeight: 700 }}>{a.title || "ללא כותרת"}</div>
                <div style={{ fontSize: 13, color: "#6b7280", marginTop: 4 }}>
                  {formatIsraelDateTime(a.createdAt)}
                  {a.publishedAt ? " · פורסם" : " · טיוטה"}
                  {a.slug ? (
                    <>
                      {" · "}
                      <span dir="ltr" style={{ fontSize: 12 }}>
                        /blog/{a.slug}
                      </span>
                    </>
                  ) : null}
                </div>
                {a.keywords?.length ? (
                  <div style={{ marginTop: 8, display: "flex", flexWrap: "wrap", gap: 6 }}>
                    {a.keywords.slice(0, 6).map((k) => (
                      <span
                        key={k}
                        style={{
                          fontSize: 12,
                          padding: "2px 8px",
                          borderRadius: 999,
                          background: "#f3f4f6",
                          color: "#4b5563",
                        }}
                      >
                        {k}
                      </span>
                    ))}
                  </div>
                ) : null}
              </Link>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
