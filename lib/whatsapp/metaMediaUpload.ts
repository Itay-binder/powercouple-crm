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

function fileNameFromUrl(url: string, kind: "IMAGE" | "VIDEO" | "DOCUMENT"): string {
  try {
    const u = new URL(url);
    const last = u.pathname.split("/").filter(Boolean).pop() || "file";
    if (last.includes(".")) return last.slice(0, 120);
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

  const uploadUrl = `${base}/${encodeURIComponent(sessionId)}`;
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
