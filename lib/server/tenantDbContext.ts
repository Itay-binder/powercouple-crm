import { AsyncLocalStorage } from "node:async_hooks";

const tenantDatabaseIdOverride = new AsyncLocalStorage<string>();

export function getTenantDatabaseIdOverride(): string | undefined {
  const v = tenantDatabaseIdOverride.getStore()?.trim();
  return v || undefined;
}

/** מריץ פונקציה עם מזהה מסד Firestore קבוע (לסקריפטים / נתיבי API פנימיים). */
export function withTenantDatabaseId<T>(databaseId: string, fn: () => Promise<T>): Promise<T> {
  const id = databaseId.trim();
  if (!id) throw new Error("databaseId is required");
  return tenantDatabaseIdOverride.run(id, fn);
}
