"use client";

import { useCallback, useState, type CSSProperties } from "react";
import useSWR from "swr";
import Link from "next/link";
import { formatIsraelDateTime } from "@/lib/datetime/formatIsrael";

const AUTH_REDIRECT = "CRM_SEO_AUTH_REDIRECT";

type SummaryOk = {
  ok: true;
  competitors: Array<{ name: string; strength: string; focus: string }>;
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
};

async function fetchJson<T>(url: string, init?: RequestInit): Promise<T> {
  const res = await fetch(url, { cache: "no-store", credentials: "include", ...init });
  if (res.status === 401) {
    window.location.href = `/login?returnTo=${encodeURIComponent("/seo/dashboard")}`;
    throw new Error(AUTH_REDIRECT);
  }
  if (res.status === 403) {
    window.location.href = `/pending?returnTo=${encodeURIComponent("/seo/dashboard")}`;
    throw new Error(AUTH_REDIRECT);
  }
  return res.json() as Promise<T>;
}

function cardStyle(): CSSProperties {
  return {
    background: "#fff",
    border: "1px solid #e5e7eb",
    borderRadius: 16,
    padding: 18,
    marginBottom: 16,
  };
}

export default function SeoDashboardClient() {
  const [rankKw, setRankKw] = useState("");
  const [rankResult, setRankResult] = useState<{
    keyword: string;
    position: number | null;
    note: string;
  } | null>(null);
  const [volKw, setVolKw] = useState("");
  const [volResult, setVolResult] = useState<{
    keyword: string;
    monthlyVolume: number;
    similar: Array<{ phrase: string; volume: number }>;
    note: string;
  } | null>(null);
  const [busy, setBusy] = useState<string | null>(null);

  const { data: summary, error: sumErr } = useSWR(
    "/api/seo/dashboard/summary",
    async (url) => {
      const j = await fetchJson<SummaryOk | { ok: false; error?: string }>(url);
      if (!j.ok) throw new Error("ok" in j && j.ok === false ? j.error || "שגיאה" : "שגיאה");
      return j;
    },
    { revalidateOnFocus: true }
  );

  const checkRank = useCallback(async () => {
    setBusy("rank");
    try {
      const j = await fetchJson<{
        ok: boolean;
        result?: { keyword: string; position: number | null; note: string };
      }>("/api/seo/dashboard/rank", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ keyword: rankKw }),
      });
      if (j.ok && j.result) setRankResult(j.result);
    } finally {
      setBusy(null);
    }
  }, [rankKw]);

  const checkVol = useCallback(async () => {
    setBusy("vol");
    try {
      const j = await fetchJson<{
        ok: boolean;
        result?: {
          keyword: string;
          monthlyVolume: number;
          similar: Array<{ phrase: string; volume: number }>;
          note: string;
        };
      }>("/api/seo/dashboard/volume", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ keyword: volKw }),
      });
      if (j.ok && j.result) setVolResult(j.result);
    } finally {
      setBusy(null);
    }
  }, [volKw]);

  return (
    <div style={{ maxWidth: 960, margin: "0 auto" }}>
      <h1 style={{ margin: "0 0 8px", fontSize: 26, fontWeight: 800 }}>דשבורד SEO</h1>
      <p style={{ margin: "0 0 22px", color: "#6b7280" }}>
        נתונים לדוגמה (מוקאפ) לצד סיכומים מהמאמרים שנשמרו ב־CRM. ניתן לחבר מקורות חיצוניים בהמשך.
      </p>

      <div style={cardStyle()}>
        <h2 style={{ margin: "0 0 12px", fontSize: 17, fontWeight: 800 }}>מיקום בגוגל לפי מילה</h2>
        <div style={{ display: "flex", flexWrap: "wrap", gap: 10, alignItems: "center" }}>
          <input
            value={rankKw}
            onChange={(e) => setRankKw(e.target.value)}
            placeholder="מילת חיפוש"
            style={{
              flex: "1 1 200px",
              minWidth: 160,
              padding: "10px 12px",
              borderRadius: 10,
              border: "1px solid #e5e7eb",
            }}
          />
          <button
            type="button"
            onClick={() => void checkRank()}
            disabled={busy !== null}
            style={{
              padding: "10px 16px",
              borderRadius: 12,
              border: "none",
              background: "#2563eb",
              color: "#fff",
              fontWeight: 700,
              cursor: busy ? "wait" : "pointer",
            }}
          >
            {busy === "rank" ? "בודק…" : "הצג מיקום"}
          </button>
        </div>
        {rankResult ? (
          <div style={{ marginTop: 14, fontSize: 15, lineHeight: 1.5 }}>
            <div>
              <strong>מילה:</strong> {rankResult.keyword || "—"}
            </div>
            <div style={{ marginTop: 6 }}>
              <strong>מיקום משוער:</strong>{" "}
              {rankResult.position != null ? rankResult.position : "—"}
            </div>
            <div style={{ marginTop: 8, fontSize: 13, color: "#6b7280" }}>{rankResult.note}</div>
          </div>
        ) : null}
      </div>

      <div style={cardStyle()}>
        <h2 style={{ margin: "0 0 12px", fontSize: 17, fontWeight: 800 }}>מתחרים חזקים</h2>
        {sumErr ? (
          <div style={{ color: "#b91c1c" }}>{(sumErr as Error).message}</div>
        ) : !summary ? (
          <div style={{ color: "#6b7280" }}>טוען…</div>
        ) : (
          <>
            <ul style={{ margin: 0, paddingRight: 18, lineHeight: 1.6 }}>
              {summary.competitors.map((c) => (
                <li key={c.name} style={{ marginBottom: 8 }}>
                  <strong>{c.name}</strong>
                  <div style={{ fontSize: 14, color: "#4b5563" }}>
                    עוצמה: {c.strength} · מיקוד: {c.focus}
                  </div>
                </li>
              ))}
            </ul>
            <p style={{ margin: "12px 0 0", fontSize: 13, color: "#6b7280" }}>
              {summary.competitorsNote}
            </p>
          </>
        )}
      </div>

      <div style={cardStyle()}>
        <h2 style={{ margin: "0 0 12px", fontSize: 17, fontWeight: 800 }}>
          כמות חיפושים לפי מילת מפתח
        </h2>
        <div style={{ display: "flex", flexWrap: "wrap", gap: 10, alignItems: "center" }}>
          <input
            value={volKw}
            onChange={(e) => setVolKw(e.target.value)}
            placeholder="מילת חיפוש"
            style={{
              flex: "1 1 200px",
              minWidth: 160,
              padding: "10px 12px",
              borderRadius: 10,
              border: "1px solid #e5e7eb",
            }}
          />
          <button
            type="button"
            onClick={() => void checkVol()}
            disabled={busy !== null}
            style={{
              padding: "10px 16px",
              borderRadius: 12,
              border: "none",
              background: "#2563eb",
              color: "#fff",
              fontWeight: 700,
              cursor: busy ? "wait" : "pointer",
            }}
          >
            {busy === "vol" ? "בודק…" : "הצג נפח"}
          </button>
        </div>
        {volResult ? (
          <div style={{ marginTop: 14 }}>
            <div style={{ fontWeight: 700 }}>מילה: {volResult.keyword || "—"}</div>
            <div style={{ marginTop: 6 }}>
              נפח חודשי משוער: {volResult.monthlyVolume.toLocaleString("he-IL")}
            </div>
            <div style={{ marginTop: 10, fontWeight: 600 }}>ביטויים דומים</div>
            <ul style={{ margin: "6px 0 0", paddingRight: 18, fontSize: 14 }}>
              {volResult.similar.map((s) => (
                <li key={s.phrase}>
                  {s.phrase} — {s.volume.toLocaleString("he-IL")}
                </li>
              ))}
            </ul>
            <p style={{ margin: "10px 0 0", fontSize: 13, color: "#6b7280" }}>{volResult.note}</p>
          </div>
        ) : null}
      </div>

      <div style={cardStyle()}>
        <h2 style={{ margin: "0 0 12px", fontSize: 17, fontWeight: 800 }}>
          מאמרים שפורסמו — השבוע / החודש
        </h2>
        {!summary ? (
          <div style={{ color: "#6b7280" }}>טוען…</div>
        ) : (
          <>
            <div style={{ display: "flex", gap: 24, flexWrap: "wrap" }}>
              <div>
                <div style={{ fontSize: 13, color: "#6b7280" }}>השבוע</div>
                <div style={{ fontSize: 28, fontWeight: 800 }}>{summary.articlesThisWeek}</div>
              </div>
              <div>
                <div style={{ fontSize: 13, color: "#6b7280" }}>החודש</div>
                <div style={{ fontSize: 28, fontWeight: 800 }}>{summary.articlesThisMonth}</div>
              </div>
            </div>
            <p style={{ margin: "12px 0 0", fontSize: 13, color: "#6b7280" }}>{summary.note}</p>
            {summary.publishedArticles.length ? (
              <ul style={{ margin: "14px 0 0", padding: 0, listStyle: "none", display: "grid", gap: 8 }}>
                {summary.publishedArticles.slice(0, 8).map((a) => (
                  <li key={a.id}>
                    <Link
                      href={`/seo/articles/${a.id}`}
                      style={{ fontWeight: 600, color: "#1d4ed8", textDecoration: "none" }}
                    >
                      {a.title}
                    </Link>
                    {a.publicUrl ? (
                      <>
                        {" · "}
                        <Link
                          href={a.publicUrl}
                          target="_blank"
                          rel="noopener noreferrer"
                          style={{ fontSize: 13, color: "#059669", fontWeight: 600 }}
                        >
                          פוסט ציבורי
                        </Link>
                      </>
                    ) : null}
                    <span style={{ fontSize: 13, color: "#6b7280", marginRight: 8 }}>
                      {a.publishedAt ? formatIsraelDateTime(a.publishedAt) : ""}
                    </span>
                  </li>
                ))}
              </ul>
            ) : (
              <p style={{ marginTop: 12, color: "#6b7280" }}>
                אין מאמרים פעילים באתר. שמירה מ־SEO מפרסמת אוטומטית; אפשר להסיר פרסום מדף המאמר.
              </p>
            )}
          </>
        )}
      </div>

      <div style={cardStyle()}>
        <h2 style={{ margin: "0 0 12px", fontSize: 17, fontWeight: 800 }}>
          מילים במאמרים (תדירות)
        </h2>
        {!summary ? (
          <div style={{ color: "#6b7280" }}>טוען…</div>
        ) : summary.keywordLift.length === 0 ? (
          <div style={{ color: "#6b7280" }}>אין עדיין מילות מפתח במאמרים שמורים.</div>
        ) : (
          <div style={{ display: "flex", flexWrap: "wrap", gap: 8 }}>
            {summary.keywordLift.map((x) => (
              <span
                key={x.keyword}
                style={{
                  padding: "6px 12px",
                  borderRadius: 999,
                  background: "#f3f4f6",
                  fontSize: 14,
                }}
              >
                {x.keyword}{" "}
                <span style={{ color: "#6b7280", fontWeight: 600 }}>({x.count})</span>
              </span>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
