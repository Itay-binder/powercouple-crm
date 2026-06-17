import { createHmac, timingSafeEqual } from "crypto";
import { cookies } from "next/headers";

export { normalizePhoneForAuth } from "./phoneNormalize";

export const MOVER_SESSION_COOKIE = "mover_session";
const MAX_AGE_SEC = 7 * 24 * 60 * 60; // 7 days

function getSecret(): string {
  const s = process.env.MOVER_SESSION_SECRET?.trim();
  if (!s) throw new Error("Missing MOVER_SESSION_SECRET env var");
  return s;
}

function sign(encoded: string): string {
  return createHmac("sha256", getSecret()).update(encoded).digest("hex");
}

export function createMoverSessionValue(phone: string): string {
  const payload = JSON.stringify({ phone, exp: Date.now() + MAX_AGE_SEC * 1000 });
  const encoded = Buffer.from(payload).toString("base64url");
  const sig = sign(encoded);
  return `${encoded}.${sig}`;
}

export function parseMoverSessionValue(value: string): { phone: string } | null {
  const dotIdx = value.lastIndexOf(".");
  if (dotIdx === -1) return null;
  const encoded = value.slice(0, dotIdx);
  const sig = value.slice(dotIdx + 1);
  const expectedSig = sign(encoded);
  try {
    const expectedBuf = Buffer.from(expectedSig, "hex");
    const actualBuf = Buffer.from(sig, "hex");
    if (expectedBuf.length !== actualBuf.length) return null;
    if (!timingSafeEqual(expectedBuf, actualBuf)) return null;
  } catch {
    return null;
  }
  try {
    const payload = JSON.parse(Buffer.from(encoded, "base64url").toString());
    if (typeof payload.phone !== "string") return null;
    if (typeof payload.exp !== "number" || payload.exp < Date.now()) return null;
    return { phone: payload.phone };
  } catch {
    return null;
  }
}

export async function getMoverSession(): Promise<{ phone: string } | null> {
  try {
    const cookieStore = await cookies();
    const value = cookieStore.get(MOVER_SESSION_COOKIE)?.value;
    if (!value) return null;
    return parseMoverSessionValue(value);
  } catch {
    // Secret not configured or cookie invalid — treat as unauthenticated
    return null;
  }
}

export function moverSessionCookieSet(value: string) {
  return {
    name: MOVER_SESSION_COOKIE,
    value,
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax" as const,
    maxAge: MAX_AGE_SEC,
    path: "/",
  };
}