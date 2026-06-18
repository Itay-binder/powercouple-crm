import type { NextRequest } from "next/server";
import { createServerClient } from "@supabase/ssr";
import { SUPABASE_URL, SUPABASE_ANON_KEY } from "@/lib/supabase/publicConfig";

/**
 * Verify the request's authenticated user via:
 * - Supabase session cookies (preferred), or
 * - Authorization: Bearer <supabase access token> (when cookies are blocked, e.g. iframe).
 */
export async function getVerifiedAuthFromRequest(
  req: NextRequest
): Promise<{ uid: string; email?: string } | null> {
  const supabase = createServerClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
    cookies: {
      getAll() {
        return req.cookies.getAll();
      },
      setAll() {
        // Read-only verification — no cookie writes here.
      },
    },
  });

  try {
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (user) return { uid: user.id, email: user.email ?? undefined };
  } catch {
    // fall through to bearer
  }

  const authHeader = req.headers.get("authorization");
  if (authHeader?.startsWith("Bearer ")) {
    const token = authHeader.slice(7).trim();
    if (!token) return null;
    try {
      const {
        data: { user },
      } = await supabase.auth.getUser(token);
      if (user) return { uid: user.id, email: user.email ?? undefined };
    } catch {
      return null;
    }
  }

  return null;
}
