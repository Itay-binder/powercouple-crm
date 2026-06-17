import { createServerSupabase } from "@/lib/supabase/server";

// Kept for backwards-compatible imports. With Supabase Auth the session lives in
// Supabase's own cookies; this constant is no longer the source of truth.
export const SESSION_COOKIE = "__session";

export function authDisabled(): boolean {
  return process.env.AUTH_DISABLED === "true";
}

/** The currently authenticated user (server components / route handlers). */
export async function getSessionUser(): Promise<{ uid: string; email?: string } | null> {
  if (authDisabled()) return null;
  try {
    const supabase = await createServerSupabase();
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) return null;
    return { uid: user.id, email: user.email ?? undefined };
  } catch {
    return null;
  }
}
