/** שליפת טקסט גולמי מדף הבית/אתר לצורך הקשר (ללא JS) — מוגבל בזמן ובגודל */
export async function fetchPublicSiteTextSnippet(siteUrl: string, maxChars = 3500): Promise<string> {
  const u = siteUrl.trim();
  if (!u) return "";
  let parsed: URL;
  try {
    parsed = new URL(u.startsWith("http") ? u : `https://${u}`);
  } catch {
    return "";
  }
  if (parsed.protocol !== "http:" && parsed.protocol !== "https:") return "";

  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), 8000);
  try {
    const res = await fetch(parsed.toString(), {
      method: "GET",
      redirect: "follow",
      signal: ctrl.signal,
      headers: {
        "User-Agent": "LiftygoSeoAgent/1.0 (+https://liftygo.co.il)",
        Accept: "text/html,application/xhtml+xml;q=0.9,*/*;q=0.8",
      },
    });
    if (!res.ok) return "";
    const ct = res.headers.get("content-type") ?? "";
    if (!ct.includes("text/html") && !ct.includes("application/xhtml")) return "";
    const raw = await res.text();
    const stripped = raw
      .replace(/<script[\s\S]*?<\/script>/gi, " ")
      .replace(/<style[\s\S]*?<\/style>/gi, " ")
      .replace(/<[^>]+>/g, " ")
      .replace(/\s+/g, " ")
      .trim();
    return stripped.slice(0, maxChars);
  } catch {
    return "";
  } finally {
    clearTimeout(t);
  }
}
