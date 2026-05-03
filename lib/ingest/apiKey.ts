import type { NextRequest } from "next/server";
import { timingSafeEqualString } from "@/lib/ingest/apiKeyCrypto";
import { verifyStoredIngestApiKey } from "@/lib/ingest/apiKeysRepo";

/** Reads API key from ingest-compatible headers (matches /api/ingest/*). */
export function providedIngestApiKey(req: NextRequest): string | null {
  const direct = req.headers.get("x-api-key");
  if (direct?.trim()) return direct.trim();
  const legacy = req.headers.get("x-crm-api-key");
  if (legacy?.trim()) return legacy.trim();
  const authz = req.headers.get("authorization");
  if (authz?.startsWith("Bearer ")) return authz.slice(7).trim();
  return null;
}

/**
 * Validates ingest API access: legacy env key (timing-safe) OR tenant-scoped key in Firestore.
 * No DB read when env key matches (fast path for existing integrations).
 */
export async function isValidIngestApiKeyAsync(req: NextRequest): Promise<boolean> {
  const got = providedIngestApiKey(req);
  if (!got) return false;

  const expected = process.env.CRM_INGEST_API_KEY?.trim();
  if (expected && timingSafeEqualString(got, expected)) {
    return true;
  }

  return verifyStoredIngestApiKey(got);
}

/**
 * @deprecated Use isValidIngestApiKeyAsync — kept for callers that only need env check without DB.
 */
export function isValidIngestApiKey(req: NextRequest): boolean {
  const expected = process.env.CRM_INGEST_API_KEY?.trim();
  if (!expected) return false;
  const got = providedIngestApiKey(req);
  return Boolean(got && timingSafeEqualString(got, expected));
}
