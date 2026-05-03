import { createHash, timingSafeEqual } from "node:crypto";
import type { MetaAdsConfig } from "@/lib/metaAds/repo";

export const DEFAULT_STATUS_TOGGLE_PASSWORD = "250599";

function sha256(raw: string): string {
  return createHash("sha256").update(raw).digest("hex");
}

export function hashStatusTogglePassword(password: string): string {
  const normalized = password.trim();
  if (!normalized) throw new Error("סיסמה לא יכולה להיות ריקה.");
  return sha256(normalized);
}

export function resolveStatusTogglePasswordHash(config: MetaAdsConfig | null): string {
  const fromConfig = config?.statusTogglePasswordHash?.trim() ?? "";
  return fromConfig || sha256(DEFAULT_STATUS_TOGGLE_PASSWORD);
}

export function verifyStatusTogglePassword(config: MetaAdsConfig | null, password: string): boolean {
  const inputHash = sha256(password.trim());
  const expectedHash = resolveStatusTogglePasswordHash(config);
  const a = Buffer.from(inputHash);
  const b = Buffer.from(expectedHash);
  if (a.length !== b.length) return false;
  return timingSafeEqual(a, b);
}
