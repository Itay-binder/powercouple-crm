import type { NextRequest } from "next/server";
import { getAdminAuth } from "@/lib/firebase/admin";
import { SESSION_COOKIE } from "@/lib/auth/session";

/**
 * אימות לפי:
 * - cookie session (מועדף)
 * - או Authorization: Bearer <Firebase idToken> (כש-iframe חוסם cookies)
 */
export async function getVerifiedAuthFromRequest(
  req: NextRequest
): Promise<{ uid: string; email?: string } | null> {
  const cookie = req.cookies.get(SESSION_COOKIE)?.value;
  if (cookie) {
    try {
      const decoded = await getAdminAuth().verifySessionCookie(cookie, true);
      return { uid: decoded.uid, email: decoded.email };
    } catch {
      // fallback to bearer
    }
  }

  const authHeader = req.headers.get("authorization");
  if (authHeader?.startsWith("Bearer ")) {
    const idToken = authHeader.slice(7).trim();
    if (!idToken) return null;
    try {
      const decoded = await getAdminAuth().verifyIdToken(idToken);
      return { uid: decoded.uid, email: decoded.email };
    } catch {
      return null;
    }
  }

  return null;
}

