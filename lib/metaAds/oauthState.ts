import { createHmac, timingSafeEqual } from "crypto";

type MetaOAuthStatePayload = {
  uid: string;
  exp: number;
  sig: string;
};

function getSigningSecret(): string {
  const s = process.env.META_APP_SECRET?.trim();
  if (!s) throw new Error("META_APP_SECRET לא מוגדר.");
  return s;
}

function b64urlEncode(buf: Buffer): string {
  return buf.toString("base64").replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

function b64urlDecode(s: string): Buffer {
  const pad = 4 - (s.length % 4);
  const norm = s.replace(/-/g, "+").replace(/_/g, "/") + (pad < 4 ? "=".repeat(pad) : "");
  return Buffer.from(norm, "base64");
}

export function signMetaOAuthState(uid: string, ttlMs = 15 * 60 * 1000): string {
  const exp = Date.now() + ttlMs;
  const secret = getSigningSecret();
  const base = JSON.stringify({ u: uid, exp });
  const sig = createHmac("sha256", secret).update(base).digest("hex");
  const payload: MetaOAuthStatePayload = { uid, exp, sig };
  return b64urlEncode(Buffer.from(JSON.stringify(payload), "utf8"));
}

export function verifyMetaOAuthState(raw: string | null): MetaOAuthStatePayload | null {
  if (!raw?.trim()) return null;
  let parsed: MetaOAuthStatePayload;
  try {
    parsed = JSON.parse(b64urlDecode(raw.trim()).toString("utf8")) as MetaOAuthStatePayload;
  } catch {
    return null;
  }
  const { uid, exp, sig } = parsed;
  if (!uid || typeof exp !== "number" || typeof sig !== "string") return null;
  if (Date.now() > exp) return null;
  const secret = getSigningSecret();
  const base = JSON.stringify({ u: uid, exp });
  const expected = createHmac("sha256", secret).update(base).digest("hex");
  try {
    const a = Buffer.from(sig, "utf8");
    const b = Buffer.from(expected, "utf8");
    if (a.length !== b.length || !timingSafeEqual(a, b)) return null;
  } catch {
    return null;
  }
  return parsed;
}
