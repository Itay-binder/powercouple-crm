import type { SeoIdeaContext } from "@/lib/seoAgent/mockEngine";
import { generateIdeaPayload } from "@/lib/seoAgent/mockEngine";

export type SeoIdeaMode = "agent" | "from_seed" | "from_keywords";

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

const EXTRA_SUFFIXES = ["מדריך", "טיפים", "מחירים", "השוואה", "ביקורות", "שירות", "אזור", "2026"];

/** רעיון מורחב מתוך טקסט שהמשתמש הזין */
export async function generateIdeaFromSeed(
  ctx: SeoIdeaContext,
  seedIdea: string
): Promise<{ idea: string; keywords: string[] }> {
  const seed = seedIdea.trim();
  if (!seed) {
    return { idea: "", keywords: [] };
  }
  const rnd = mulberry32(hashString(seed + ctx.name));
  const angles = [
    "מאמר מעמיק שמפרט את הצעדים וההחלטות הרלוונטיות",
    "פורמט FAQ + דוגמאות מהשטח לפי הנושא שהגדרת",
    "מדריך קצר ללקוחות: מה לשאול, מה לבדוק, ואיך לבחור נכון",
  ];
  const angle = angles[Math.floor(rnd() * angles.length)] ?? angles[0];
  let idea = `בהתבסס על הרעיון שלך:\n«${seed.slice(0, 500)}${seed.length > 500 ? "…" : ""}»\n\n`;
  idea += `הצעה למאמר: ${angle}, מותאם ל־${ctx.name}.`;
  if (ctx.scanFocus.trim()) {
    idea += `\n\nיישור קו עם נושאי המחקר שלך: ${ctx.scanFocus.trim()}`;
  }
  if (ctx.knowledgeSummary?.trim()) {
    idea += `\n\nהקשר ממאגר הידע/אתר (תמצית): ${ctx.knowledgeSummary.trim().slice(0, 600)}${ctx.knowledgeSummary.length > 600 ? "…" : ""}`;
  }

  const words = seed
    .split(/[\s,.;:!?'"()\[\]{}]+/)
    .map((w) => w.trim())
    .filter((w) => w.length > 2 && w.length < 40)
    .slice(0, 12);
  const picks = new Set<string>();
  for (const k of ctx.defaultKeywordSeeds) {
    if (k.trim()) picks.add(k.trim());
  }
  for (const w of words) picks.add(w);
  while (picks.size < 8) {
    picks.add(`${ctx.name.split(/\s+/)[0] || ctx.name} ${EXTRA_SUFFIXES[Math.floor(rnd() * EXTRA_SUFFIXES.length)]}`);
  }
  return { idea, keywords: [...picks].slice(0, 10) };
}

/** רעיון מתוך מילות קידום שהמשתמש הזין */
export async function generateIdeaFromKeywords(
  ctx: SeoIdeaContext,
  seedKeywords: string
): Promise<{ idea: string; keywords: string[] }> {
  const parts = seedKeywords
    .split(/[,;\n]/)
    .map((s) => s.trim())
    .filter(Boolean);
  if (!parts.length) {
    return { idea: "", keywords: [] };
  }
  const rnd = mulberry32(hashString(parts.join("|") + ctx.name));
  const main = parts.slice(0, 5).join(", ");
  let idea = `מאמר ממוקד SEO סביב המילים והביטויים: ${main}.\n`;
  idea += `קהל יעד: לקוחות ${ctx.name} — ${ctx.blurb.slice(0, 140)}${ctx.blurb.length > 140 ? "…" : ""}`;
  if (ctx.siteUrl.trim()) {
    idea += `\n\nשילוב טבעי עם שירותי האתר (${ctx.siteUrl.trim()}) ועמודי נחיתה רלוונטיים.`;
  }
  if (ctx.knowledgeSummary?.trim()) {
    idea += `\n\nתמצית הקשר מהמאגר: ${ctx.knowledgeSummary.trim().slice(0, 500)}${ctx.knowledgeSummary.length > 500 ? "…" : ""}`;
  }

  const picks = new Set<string>(parts);
  for (const k of ctx.defaultKeywordSeeds) {
    if (k.trim()) picks.add(k.trim());
  }
  while (picks.size < 8) {
    const base = parts[Math.floor(rnd() * parts.length)] ?? ctx.name;
    picks.add(`${base} ${EXTRA_SUFFIXES[Math.floor(rnd() * EXTRA_SUFFIXES.length)]}`);
  }
  return { idea, keywords: [...picks].slice(0, 10) };
}

export async function generateIdeaForMode(
  ctx: SeoIdeaContext & { knowledgeSummary?: string },
  mode: SeoIdeaMode,
  opts: { seedIdea?: string; seedKeywords?: string }
): Promise<{ idea: string; keywords: string[] }> {
  if (mode === "from_seed") {
    return generateIdeaFromSeed(ctx, opts.seedIdea ?? "");
  }
  if (mode === "from_keywords") {
    return generateIdeaFromKeywords(ctx, opts.seedKeywords ?? "");
  }
  return generateIdeaPayload(ctx);
}
