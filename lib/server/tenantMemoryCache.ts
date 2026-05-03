/**
 * מטמון TTL בזיכרון לפרוקסי שרת — מפתחות כוללים tenant (databaseId) כדי לא לערבב עסקים.
 * לא משותף בין מופעי serverless; מפחית קריאות חוזרות באותו מופע חם.
 */

type Entry = { expires: number; value: unknown };

const store = new Map<string, Entry>();
const MAX_KEYS = 400;

function pruneExpired() {
  const now = Date.now();
  for (const [k, v] of store) {
    if (v.expires <= now) store.delete(k);
  }
}

function pruneSize() {
  if (store.size <= MAX_KEYS) return;
  const entries = [...store.entries()].sort((a, b) => a[1].expires - b[1].expires);
  while (store.size > MAX_KEYS * 0.75 && entries.length) {
    const [k] = entries.shift()!;
    store.delete(k);
  }
}

export async function withTenantTtlCache<T>(key: string, ttlMs: number, fetcher: () => Promise<T>): Promise<T> {
  const now = Date.now();
  pruneExpired();
  const hit = store.get(key);
  if (hit && hit.expires > now) return hit.value as T;
  const value = await fetcher();
  store.set(key, { expires: now + ttlMs, value });
  pruneSize();
  return value;
}

/** מוחק כל המפתחות שמתחילים ב-prefix (למשל `lbl:dbId` או `pl:dbId:`) */
export function invalidateTenantCachePrefix(prefix: string) {
  for (const k of [...store.keys()]) {
    if (k.startsWith(prefix)) store.delete(k);
  }
}
