import { randomBytes, scryptSync, timingSafeEqual } from "crypto";

const SCRYPT_PARAMS = { N: 8192, r: 8, p: 1, maxmem: 64 * 1024 * 1024 } as const;
const DERIVED_KEY_LEN = 64;

export function hashIngestApiKeyPlaintext(plaintext: string): {
  saltB64: string;
  hashB64: string;
} {
  const salt = randomBytes(16);
  const hash = scryptSync(plaintext, salt, DERIVED_KEY_LEN, SCRYPT_PARAMS);
  return { saltB64: salt.toString("base64"), hashB64: hash.toString("base64") };
}

export function verifyIngestApiKeyPlaintext(
  plaintext: string,
  saltB64: string,
  hashB64: string
): boolean {
  try {
    const salt = Buffer.from(saltB64, "base64");
    const expected = Buffer.from(hashB64, "base64");
    if (expected.length !== DERIVED_KEY_LEN) return false;
    const hash = scryptSync(plaintext, salt, DERIVED_KEY_LEN, SCRYPT_PARAMS);
    if (hash.length !== expected.length) return false;
    return timingSafeEqual(hash, expected);
  } catch {
    return false;
  }
}

export function timingSafeEqualString(a: string, b: string): boolean {
  if (!a || !b) return false;
  const ba = Buffer.from(a, "utf8");
  const bb = Buffer.from(b, "utf8");
  if (ba.length !== bb.length) return false;
  return timingSafeEqual(ba, bb);
}
