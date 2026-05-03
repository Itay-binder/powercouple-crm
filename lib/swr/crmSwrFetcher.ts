/** Fetcher ל-SWR: JSON + credentials, זורק בשגיאת HTTP */
export async function crmSwrFetcher<T = unknown>(url: string): Promise<T> {
  const res = await fetch(url, { credentials: "include", cache: "no-store" });
  const json = (await res.json().catch(() => null)) as T | null;
  if (!res.ok) {
    const msg =
      json && typeof json === "object" && json !== null && "error" in json
        ? String((json as { error?: string }).error ?? res.statusText)
        : res.statusText;
    throw new Error(msg || `HTTP ${res.status}`);
  }
  return json as T;
}
