"use client";

import { createBrowserClient } from "@supabase/ssr";
import { SUPABASE_URL, SUPABASE_ANON_KEY } from "@/lib/supabase/publicConfig";

let _client: ReturnType<typeof createBrowserClient> | null = null;

/** Browser Supabase client (singleton) for auth in client components. */
export function getBrowserSupabase() {
  if (_client) return _client;
  _client = createBrowserClient(SUPABASE_URL, SUPABASE_ANON_KEY);
  return _client;
}
