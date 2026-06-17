import { cookies } from "next/headers";
import { createServerClient, type CookieOptions } from "@supabase/ssr";
import { createClient } from "@supabase/supabase-js";

function url(): string {
  const v = process.env.NEXT_PUBLIC_SUPABASE_URL?.trim();
  if (!v) throw new Error("Missing NEXT_PUBLIC_SUPABASE_URL");
  return v;
}
function anonKey(): string {
  const v = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY?.trim();
  if (!v) throw new Error("Missing NEXT_PUBLIC_SUPABASE_ANON_KEY");
  return v;
}

/**
 * Supabase client bound to the request cookies (App Router server components and
 * route handlers). Used to read the authenticated user and to refresh the session.
 */
export async function createServerSupabase() {
  const cookieStore = await cookies();
  return createServerClient(url(), anonKey(), {
    cookies: {
      getAll() {
        return cookieStore.getAll();
      },
      setAll(toSet: { name: string; value: string; options: CookieOptions }[]) {
        try {
          toSet.forEach(({ name, value, options }) => cookieStore.set(name, value, options));
        } catch {
          // Called from a Server Component where cookies are read-only — ignore.
        }
      },
    },
  });
}

/**
 * Service-role client — bypasses RLS, never persists a session. For admin user
 * management (listing/creating users) when needed.
 */
export function createServiceSupabase() {
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY?.trim();
  if (!key) throw new Error("Missing SUPABASE_SERVICE_ROLE_KEY");
  return createClient(url(), key, { auth: { persistSession: false, autoRefreshToken: false } });
}
