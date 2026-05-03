import { FieldValue } from "firebase-admin/firestore";
import { getAdminDb } from "@/lib/firebase/admin";
import defaultRows from "@/lib/movingOrders/data/settlementRegions.json";

const COLLECTION = "workspaceSettings";
const DOC_ID = "movingOrdersCityRegions";

export type CityRegionRow = { settlement: string; region: string };

export type CityRegionSettingsSource = "bundled" | "firestore";

export const bundledCityRegionRowCount = (defaultRows as CityRegionRow[]).length;

/** נרמול שם יישוב / עיר למפתח חיפוש (תואם ל־normSettlementLookupKey ב־matchDrivers) */
export function normSettlementKey(s: string): string {
  return s
    .trim()
    .replace(/\s+/g, " ")
    .replace(/[\u0591-\u05C7]/g, "")
    .toLowerCase();
}

export function buildSettlementRegionMap(rows: CityRegionRow[]): Map<string, string> {
  const m = new Map<string, string>();
  for (const r of rows) {
    const st = String(r.settlement ?? "").trim();
    const reg = String(r.region ?? "").trim();
    if (!st || !reg) continue;
    m.set(normSettlementKey(st), reg);
  }
  return m;
}

function normSettlementCollapsed(s: string): string {
  return normSettlementKey(s).replace(/\s+/g, "");
}

/**
 * מציאת אזור במפת יישוב→אזור: מפתח ישיר ואם חסר — התאמה לפי שם ללא רווחים (פערי נרמול/הקלדה).
 */
export function lookupRegionForSettlement(
  settlementRegionMap: Map<string, string>,
  cityRaw: string
): string | undefined {
  const c = cityRaw.trim();
  if (!c) return undefined;
  const direct = settlementRegionMap.get(normSettlementKey(c));
  if (direct?.trim()) return direct.trim();

  const collapsed = normSettlementCollapsed(c);
  if (collapsed.length >= 2) {
    for (const [settlementKey, region] of settlementRegionMap) {
      if (!region.trim()) continue;
      if (normSettlementCollapsed(settlementKey) === collapsed) return region.trim();
    }
  }
  return undefined;
}

function cleanRows(stored: unknown): CityRegionRow[] {
  if (!Array.isArray(stored)) return [];
  return stored.map((r) => ({
    settlement: String((r as CityRegionRow).settlement ?? "").trim(),
    region: String((r as CityRegionRow).region ?? "").trim(),
  }));
}

export async function getCityRegionSettings(): Promise<{
  rows: CityRegionRow[];
  source: CityRegionSettingsSource;
}> {
  const db = await getAdminDb();
  const snap = await db.collection(COLLECTION).doc(DOC_ID).get();
  const stored = snap.exists ? (snap.data() as { rows?: CityRegionRow[] }).rows : null;
  const cleaned = cleanRows(stored);
  if (cleaned.length > 0) {
    return { rows: cleaned.filter((r) => r.settlement && r.region), source: "firestore" };
  }
  const bundled = defaultRows as CityRegionRow[];
  return { rows: bundled.filter((r) => r.settlement && r.region), source: "bundled" };
}

export async function getCityRegionRows(): Promise<CityRegionRow[]> {
  const { rows } = await getCityRegionSettings();
  return rows;
}

const MAP_CACHE_TTL_MS = 60_000;
let cityRegionMapCache: { map: Map<string, string>; until: number } | null = null;

function invalidateCityRegionMapCache(): void {
  cityRegionMapCache = null;
}

export async function getCityRegionMap(): Promise<Map<string, string>> {
  const now = Date.now();
  if (cityRegionMapCache && cityRegionMapCache.until > now) {
    return cityRegionMapCache.map;
  }
  const { rows } = await getCityRegionSettings();
  const map = buildSettlementRegionMap(rows);
  cityRegionMapCache = { map, until: now + MAP_CACHE_TTL_MS };
  return map;
}

export async function saveCityRegionRows(rows: CityRegionRow[]): Promise<void> {
  const db = await getAdminDb();
  const cleaned = rows
    .map((r) => ({
      settlement: String(r.settlement ?? "").trim(),
      region: String(r.region ?? "").trim(),
    }))
    .filter((r) => r.settlement && r.region);
  await db.collection(COLLECTION).doc(DOC_ID).set(
    {
      rows: cleaned,
      updatedAt: FieldValue.serverTimestamp(),
    },
    { merge: true }
  );
  invalidateCityRegionMapCache();
}

export async function clearCityRegionOverrides(): Promise<void> {
  const db = await getAdminDb();
  await db.collection(COLLECTION).doc(DOC_ID).delete();
  invalidateCityRegionMapCache();
}
