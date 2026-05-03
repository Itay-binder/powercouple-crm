/** יצירת סלאג לפוסט — מעדיף מילות מפתח/כותרת בלטינית; אחרת סלאג קצר מבוסס־hash (מתאים לכותרות בעברית). */

function hashString(s: string): number {
  let h = 0;
  for (let i = 0; i < s.length; i++) {
    h = Math.imul(31, h) + s.charCodeAt(i);
    h |= 0;
  }
  return Math.abs(h);
}

function slugifyLatin(s: string): string {
  const t = s
    .toLowerCase()
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
  return t;
}

export function generateAgentSlug(params: {
  title: string;
  keywords: string[];
  articleId: string;
}): string {
  for (const kw of params.keywords) {
    const x = slugifyLatin(kw);
    if (x.length >= 3) {
      return x.slice(0, 72);
    }
  }
  const fromTitle = slugifyLatin(params.title);
  if (fromTitle.length >= 3) {
    return fromTitle.slice(0, 72);
  }
  const h = hashString(`${params.title}:${params.articleId}`).toString(36);
  return `post-${h}`.slice(0, 72);
}
