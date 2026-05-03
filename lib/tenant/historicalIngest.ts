import type { NextRequest } from "next/server";
import { TENANT_DB_HEADER } from "@/lib/tenant/config";

/** מזהה מסד מהבקשה (קליטה / API עם כותרת טננט). */
export function tenantDatabaseIdFromIngestRequest(req: NextRequest): string | undefined {
  const v = req.headers.get(TENANT_DB_HEADER)?.trim();
  return v || undefined;
}

/**
 * תאריכי יצירה/עדכון היסטוריים בקליטה — רק למסדי Firestore שמופיעים ב־CRM_HISTORICAL_IMPORT_TENANT_DATABASE_IDS
 * (מופרד בפסיק, לדוגמה: powercouple,client2-db).
 */
export function isHistoricalIngestAllowedForDatabaseId(databaseId: string | undefined | null): boolean {
  if (!databaseId?.trim()) return false;
  const raw = process.env.CRM_HISTORICAL_IMPORT_TENANT_DATABASE_IDS?.trim();
  if (!raw) return false;
  const allowed = new Set(
    raw
      .split(",")
      .map((s) => s.trim())
      .filter(Boolean)
  );
  return allowed.has(databaseId.trim());
}
