import { Buffer } from "node:buffer";

export type WordPressPublishResult = {
  id: number;
  link: string;
  status: string;
};

/**
 * פרסום פוסט לוורדפרס (REST). משתני סביבה:
 * WORDPRESS_REST_BASE — למשל https://liftygo.co.il/wp-json
 * WORDPRESS_USERNAME — שם משתמש וורדפרס
 * WORDPRESS_APP_PASSWORD — סיסמת אפליקציה (רווחים מוסרים אוטומטית)
 */
export async function publishHtmlToWordPress(input: {
  title: string;
  html: string;
  status: "draft" | "publish";
}): Promise<WordPressPublishResult> {
  const base = process.env.WORDPRESS_REST_BASE?.trim() ?? "";
  const user = process.env.WORDPRESS_USERNAME?.trim() ?? "";
  const pass = (process.env.WORDPRESS_APP_PASSWORD ?? "").replace(/\s+/g, "").trim();
  if (!base || !user || !pass) {
    throw new Error(
      "חסרים משתני סביבה: WORDPRESS_REST_BASE, WORDPRESS_USERNAME, WORDPRESS_APP_PASSWORD"
    );
  }
  const root = base.replace(/\/$/, "");
  const url = `${root}/wp/v2/posts`;
  const auth = Buffer.from(`${user}:${pass}`, "utf8").toString("base64");
  const res = await fetch(url, {
    method: "POST",
    headers: {
      Authorization: `Basic ${auth}`,
      "Content-Type": "application/json",
      Accept: "application/json",
    },
    body: JSON.stringify({
      title: input.title,
      content: input.html,
      status: input.status,
    }),
  });
  const text = await res.text();
  let json: Record<string, unknown> = {};
  try {
    json = JSON.parse(text) as Record<string, unknown>;
  } catch {
    // ignore
  }
  if (!res.ok) {
    const msg =
      typeof json.message === "string"
        ? json.message
        : typeof (json as { error?: string }).error === "string"
          ? (json as { error: string }).error
          : text.slice(0, 200) || `HTTP ${res.status}`;
    throw new Error(`WordPress: ${msg}`);
  }
  const id = Number(json.id ?? 0);
  const link = String(json.link ?? "");
  const status = String(json.status ?? input.status);
  if (!id) throw new Error("WordPress לא החזיר מזהה פוסט");
  return { id, link, status };
}
