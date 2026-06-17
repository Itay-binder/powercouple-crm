import { Buffer } from "node:buffer";

function graphBaseUrl(): string {
  return process.env.WHATSAPP_GRAPH_API_BASE?.trim() || "https://graph.facebook.com/v22.0";
}

function mimeForKind(kind: "IMAGE" | "VIDEO" | "DOCUMENT", fileName: string): string {
  const lower = fileName.toLowerCase();
  if (kind === "IMAGE") {
    if (lower.endsWith(".png")) return "image/png";
    if (lower.endsWith(".webp")) return "image/webp";
    return "image/jpeg";
  }
  if (kind === "VIDEO") return "video/mp4";
  if (lower.endsWith(".pdf")) return "application/pdf";
  return "application/octet-stream";
}

/**
 * מטא דורשת ל־file_name ב־Resumable Upload תבנית מחמירה (בדרך כלל ASCII, ללא רווחים וכו׳).
 * שם מה־URL (Firebase, קידודים, עברית) עלול לשבור את ה־regex ולהחזיר #100.
 */
function sanitizeMetaUploadFileName(raw: string, kind: "IMAGE" | "VIDEO" | "DOCUMENT"): string {
  const base = raw.replace(/\\/g, "/").split("/").pop() || "";
  const noQuery = base.split("?")[0].split("#")[0];
  const extFromRaw = (() => {
    const m = noQuery.match(/\.([a-zA-Z0-9]{1,10})$/);
    return m ? m[1].toLowerCase() : "";
  })();
  const allowedExt =
    kind === "IMAGE"
      ? ["jpg", "jpeg", "png", "webp"].includes(extFromRaw)
        ? extFromRaw === "jpeg"
          ? "jpg"
          : extFromRaw
        : "jpg"
      : kind === "VIDEO"
        ? "mp4"
        : extFromRaw === "pdf"
          ? "pdf"
          : "bin";
  const stem = noQuery.replace(/\.[^.]+$/, "").slice(0, 80);
  const ascii = stem
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-zA-Z0-9._-]+/g, "_")
    .replace(/^_+|_+$/g, "")
    .slice(0, 60);
  const safeStem = stem.length > 0 && ascii.length > 0 ? ascii : "header";
  return `${safeStem}.${allowedExt}`.slice(0, 120);
}

function fileNameFromUrl(url: string, kind: "IMAGE" | "VIDEO" | "DOCUMENT"): string {
  try {
    const u = new URL(url);
    const last = decodeURIComponent(u.pathname.split("/").filter(Boolean).pop() || "file");
    if (last && last !== "/") {
      return sanitizeMetaUploadFileName(last, kind);
    }
  } catch {
    // ignore
  }
  if (kind === "IMAGE") return "header.jpg";
  if (kind === "VIDEO") return "header.mp4";
  return "header.bin";
}

/**
 * העלאת קובץ מקישור ציבורי ל־Meta Resumable Upload, להחזרת handle לתבנית (HEADER).
 */
export async function uploadMediaHandleFromUrl(
  appId: string,
  accessToken: string,
  sourceUrl: string,
  kind: "IMAGE" | "VIDEO" | "DOCUMENT"
): Promise<string> {
  const base = graphBaseUrl().replace(/\/$/, "");
  const resBin = await fetch(sourceUrl, { redirect: "follow" });
  if (!resBin.ok) {
    throw new Error(`לא ניתן להוריד את קובץ המדיה (${resBin.status}). ודאו קישור ציבורי ב־HTTPS.`);
  }
  const buf = Buffer.from(await resBin.arrayBuffer());
  if (buf.length < 16) throw new Error("קובץ המדיה קטן מדי או ריק.");
  if (buf.length > 45 * 1024 * 1024) {
    throw new Error("קובץ המדיה גדול מדי (מעל ~45MB). נסו קובץ קטן יותר.");
  }
  const fileName = fileNameFromUrl(sourceUrl, kind);
  const fileType = mimeForKind(kind, fileName);
  const fileLength = buf.length;

  const startUrl = `${base}/${appId}/uploads?file_name=${encodeURIComponent(fileName)}&file_length=${fileLength}&file_type=${encodeURIComponent(fileType)}`;
  const start = await fetch(startUrl, {
    method: "POST",
    headers: { Authorization: `Bearer ${accessToken}` },
  });
  const startJson = (await start.json().catch(() => ({}))) as { id?: string; error?: { message?: string } };
  if (!start.ok) {
    throw new Error(startJson.error?.message || `Meta upload session failed (${start.status})`);
  }
  const sessionId = startJson.id?.trim();
  if (!sessionId) {
    throw new Error("Meta לא החזיר מזהה העלאה (upload session).");
  }

  // Meta's resumable upload step must use the base host WITHOUT the API version prefix.
  const graphHost = base.replace(/\/v\d+\.\d+$/, "");
  const uploadUrl = `${graphHost}/${sessionId}`;
  const up = await fetch(uploadUrl, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${accessToken}`,
      file_offset: "0",
      "Content-Type": "application/octet-stream",
    },
    body: new Uint8Array(buf),
  });
  const upJson = (await up.json().catch(() => ({}))) as { h?: string; error?: { message?: string } };
  if (!up.ok) {
    throw new Error(upJson.error?.message || `Meta upload failed (${up.status})`);
  }
  const h = upJson.h?.trim();
  if (!h) {
    throw new Error("Meta לא החזיר handle למדיה אחרי ההעלאה.");
  }
  return h;
}
