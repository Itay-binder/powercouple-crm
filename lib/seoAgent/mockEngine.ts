import { getTenantConfigs } from "@/lib/tenant/config";
import { getRequestTenantDatabaseId } from "@/lib/firebase/admin";

/** הקשר ליצירת רעיונות — מגיע מ-Firestore + env (ראה getMergedSeoContextForIdeas) */
export type SeoIdeaContext = {
  name: string;
  blurb: string;
  siteUrl: string;
  scanFocus: string;
  defaultKeywordSeeds: string[];
  /** תמצית מאגר ידע / דף אינטרנט — לא חובה */
  knowledgeSummary?: string;
};

function hashString(s: string): number {
  let h = 0;
  for (let i = 0; i < s.length; i++) {
    h = Math.imul(31, h) + s.charCodeAt(i);
    h |= 0;
  }
  return Math.abs(h);
}

function mulberry32(seed: number) {
  return function next() {
    let t = (seed += 0x6d2b79f5);
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function businessContext(): { name: string; blurb: string } {
  const raw = process.env.CRM_SEO_BUSINESS_CONTEXT?.trim();
  if (raw) {
    try {
      const j = JSON.parse(raw) as { name?: string; blurb?: string };
      if (j && typeof j.name === "string" && j.blurb) {
        return { name: j.name.trim(), blurb: String(j.blurb).trim() };
      }
    } catch {
      return { name: "העסק שלך", blurb: raw };
    }
  }
  return {
    name: getTenantConfigs()[0]?.label?.trim() || "העסק",
    blurb:
      "שירות מקצועי, אמינות וחוויית לקוח מצוינת. אפשר להגדיר טקסט מותאם במשתנה הסביבה CRM_SEO_BUSINESS_CONTEXT (JSON עם name ו-blurb).",
  };
}

const IDEA_TEMPLATES: string[] = [
  "מדריך מעשי ללקוחות חדשים: איך לבחור את השירות הנכון ומה לשאול לפני שמחליטים",
  "השוואה בין גישות נפוצות בתחום — יתרונות, חסרונות ומתי כל אחת מתאימה",
  "שאלות נפוצות (FAQ) מורחבות סביב הבעיה המרכזית שהלקוחות שלכם פותרים",
  "סיפור הצלחה: תהליך עבודה צעד־אחר־צעד ומה למדנו בדרך",
  "מגמות {year} בתעשייה — מה משתנה ואיך להתכונן",
  "טעויות נפוצות שעולות כסף ואיך להימנע מהן (עם דוגמאות מהשטח)",
];

const KEYWORD_SUFFIXES = [
  "מחירים",
  "מדריך",
  "השוואה",
  "ביקורות",
  "לידים",
  "שירות מקצועי",
  "אזורי שירות",
  "שאלות נפוצות",
];

export async function generateIdeaPayload(ctx: SeoIdeaContext): Promise<{
  idea: string;
  keywords: string[];
}> {
  const { name, blurb, siteUrl, scanFocus, defaultKeywordSeeds } = ctx;
  const dbId = await getRequestTenantDatabaseId();
  const seed = hashString(`${dbId}:${Date.now()}:${Math.random()}:${scanFocus}:${siteUrl}`);
  const rnd = mulberry32(seed);
  const year = new Date().getFullYear();
  const tpl = IDEA_TEMPLATES[Math.floor(rnd() * IDEA_TEMPLATES.length)] ?? IDEA_TEMPLATES[0];
  const blurbShort = blurb.slice(0, 120) + (blurb.length > 120 ? "…" : "");
  let idea =
    tpl.replace(/\{year\}/g, String(year)) +
    ` — ממוקד ל־${name}: ${blurbShort}`;

  if (scanFocus.trim()) {
    idea += `\n\nכיוון מחקר / מה לסרוק ברשת (לפי ההגדרות שלך): ${scanFocus.trim()}`;
  }
  if (siteUrl.trim()) {
    idea += `\nאתר עסקי ליישור תוכן: ${siteUrl.trim()}`;
  }
  const ks = (ctx.knowledgeSummary ?? "").trim();
  if (ks) {
    idea += `\n\nתמצית מהאתר/מאגר ידע (ללמידת הקשר): ${ks.slice(0, 900)}${ks.length > 900 ? "…" : ""}`;
  }

  const base = name.split(/\s+/)[0] || name;
  const picks = new Set<string>();
  for (const k of defaultKeywordSeeds) {
    if (k.trim()) picks.add(k.trim());
  }
  while (picks.size < 8) {
    const suffix = KEYWORD_SUFFIXES[Math.floor(rnd() * KEYWORD_SUFFIXES.length)];
    picks.add(`${base} ${suffix}`);
    if (picks.size >= 8) break;
    if (scanFocus.trim()) {
      const word = scanFocus.split(/[\s,]+/).find((w) => w.length > 2);
      if (word) picks.add(`${word} ${suffix}`);
    }
  }
  return { idea, keywords: [...picks].slice(0, 8) };
}

export function mockGoogleRank(keyword: string): {
  keyword: string;
  position: number | null;
  note: string;
} {
  const k = keyword.trim();
  if (!k) {
    return { keyword: "", position: null, note: "הזינו מילת חיפוש" };
  }
  const rnd = mulberry32(hashString(k.toLowerCase()));
  const pos = 3 + Math.floor(rnd() * 47);
  return {
    keyword: k,
    position: pos,
    note:
      "נתון לדוגמה (מוקאפ). חיבור ל־API דירוג אמיתי (למשל SerpAPI / DataForSEO) יבוצע כשיהיו מפתחות.",
  };
}

export function mockSearchVolume(keyword: string): {
  keyword: string;
  monthlyVolume: number;
  similar: Array<{ phrase: string; volume: number }>;
  note: string;
} {
  const k = keyword.trim();
  if (!k) {
    return { keyword: "", monthlyVolume: 0, similar: [], note: "הזינו מילת חיפוש" };
  }
  const rnd = mulberry32(hashString(`vol:${k.toLowerCase()}`));
  const baseVol = 400 + Math.floor(rnd() * 12000);
  const similar = [
    `${k} מחיר`,
    `${k} מומלץ`,
    `איך לבחור ${k}`,
    `${k} לעסקים`,
  ].map((phrase) => ({
    phrase,
    volume: Math.floor(baseVol * (0.15 + rnd() * 0.9)),
  }));
  return {
    keyword: k,
    monthlyVolume: baseVol,
    similar,
    note: "נפחי חיפוש לדוגמה. לנתונים אמיתיים נדרש חיבור לכלי מחקר מילות מפתח.",
  };
}

export function mockCompetitors(): {
  competitors: Array<{ name: string; strength: string; focus: string }>;
  note: string;
} {
  return {
    competitors: [
      { name: "מתחרה א׳ — דומיננטיות בתוצאות האורגניות", strength: "גבוהה", focus: "תוכן ארוך + קישורים" },
      { name: "מתחרה ב׳ — חזק במילות מפתח מקומיות", strength: "בינונית־גבוהה", focus: "Google Business + ביקורות" },
      { name: "מתחרה ג׳ — מוביל במודעות חיפוש", strength: "גבוהה (ממומן)", focus: "קמפיינים ממומנים" },
    ],
    note: "רשימת מתחרים לדוגמה. ניתן לחבר ניתוח SERP אמיתי לפי דומיין העסק.",
  };
}

export async function buildArticleHtml(input: {
  title: string;
  idea: string;
  keywords: string[];
  /** אופציונלי — מעדיף על פני env בלבד */
  brandName?: string;
  brandBlurb?: string;
}): Promise<string> {
  const fallback = businessContext();
  const name = input.brandName?.trim() || fallback.name;
  const blurb = input.brandBlurb?.trim() || fallback.blurb;
  const kw = input.keywords.length ? input.keywords.join(" · ") : "מילות מפתח יוגדרו בהמשך";
  const safeTitle = escapeHtml(input.title);
  const safeIdea = escapeHtml(input.idea);
  const safeName = escapeHtml(name);
  const safeBlurb = escapeHtml(blurb);
  const safeKw = escapeHtml(kw);

  return `<!DOCTYPE html>
<html lang="he" dir="rtl">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <title>${safeTitle}</title>
  <style>
    :root {
      --bg: #f8fafc;
      --card: #ffffff;
      --text: #0f172a;
      --muted: #64748b;
      --accent: #2563eb;
      --border: #e2e8f0;
    }
    * { box-sizing: border-box; }
    body {
      margin: 0;
      font-family: "Rubik", "Segoe UI", system-ui, sans-serif;
      background: var(--bg);
      color: var(--text);
      line-height: 1.65;
    }
    .wrap { max-width: 720px; margin: 0 auto; padding: 32px 20px 48px; }
    header {
      background: var(--card);
      border: 1px solid var(--border);
      border-radius: 16px;
      padding: 24px;
      margin-bottom: 24px;
      box-shadow: 0 1px 2px rgba(15,23,42,0.06);
    }
    h1 { margin: 0 0 12px; font-size: 1.75rem; line-height: 1.25; }
    .meta { color: var(--muted); font-size: 0.95rem; }
    .pill {
      display: inline-block;
      background: #eff6ff;
      color: var(--accent);
      padding: 4px 10px;
      border-radius: 999px;
      font-size: 0.85rem;
      font-weight: 600;
      margin: 6px 0 0 6px;
    }
    article {
      background: var(--card);
      border: 1px solid var(--border);
      border-radius: 16px;
      padding: 28px;
      box-shadow: 0 1px 2px rgba(15,23,42,0.06);
    }
    article h2 { margin-top: 28px; font-size: 1.2rem; }
    article h2:first-child { margin-top: 0; }
    article p { margin: 0 0 14px; color: #334155; }
    ul { padding-right: 1.2rem; color: #334155; }
    .lead { font-size: 1.08rem; color: #1e293b; }
    footer {
      margin-top: 28px;
      padding-top: 16px;
      border-top: 1px solid var(--border);
      font-size: 0.88rem;
      color: var(--muted);
    }
  </style>
</head>
<body>
  <div class="wrap">
    <header>
      <h1>${safeTitle}</h1>
      <div class="meta">עבור <strong>${safeName}</strong></div>
      <div style="margin-top:10px"><span class="pill">מילות מפתח</span> ${safeKw}</div>
    </header>
    <article>
      <p class="lead">${safeIdea}</p>
      <h2>למה הנושא הזה חשוב ללקוחות</h2>
      <p>${safeBlurb}</p>
      <h2>מה תקבלו במאמר המלא</h2>
      <ul>
        <li>מבנה ברור לקריאה סריקה ולקידום אורגני</li>
        <li>כותרות משנה (H2/H3) שמכסות את כוונת החיפוש</li>
        <li>קריאה לפעולה רלוונטית לשירות שלכם</li>
      </ul>
      <h2>סיכום</h2>
      <p>זוהי תצוגה מקדימה שנוצרה אוטומטית. כשתגדירו את הקו העיצובי והמידע העסקי, ניתן להחליף את התבנית והטקסטים לפי הסוכן.</p>
      <footer>נוצר באמצעות סוכן SEO · Power Couple CRM</footer>
    </article>
  </div>
</body>
</html>`;
}

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

export function titleFromIdea(idea: string): string {
  const line = idea.split(/[.!?]/)[0]?.trim() || idea.trim();
  return line.length > 72 ? `${line.slice(0, 69)}…` : line || "מאמר SEO";
}
