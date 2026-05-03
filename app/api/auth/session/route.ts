import { NextRequest, NextResponse } from "next/server";
import { mayCreateSession } from "@/lib/auth/invites";
import { ensureUserDoc } from "@/lib/auth/profile";
import { authDisabled } from "@/lib/auth/session";
import {
  clearSessionCookieOnResponse,
  setSessionCookieOnResponse,
  setTenantCookieOnResponse,
} from "@/lib/auth/sessionCookieOptions";
import { getSessionExpiresMs } from "@/lib/auth/sessionDuration";
import { getAdminAuth, getFirestoreForDatabaseId } from "@/lib/firebase/admin";
import { listAccessibleTenants } from "@/lib/tenant/access";
import {
  getDefaultTenantId,
  resolveTenantById,
  TENANT_COOKIE,
} from "@/lib/tenant/config";

export const dynamic = "force-dynamic";

export async function POST(req: NextRequest) {
  if (authDisabled()) {
    return NextResponse.json(
      { error: "Auth disabled in this environment" },
      { status: 400 }
    );
  }

  try {
    const body = (await req.json()) as { idToken?: string };
    const idToken = body.idToken?.trim();
    if (!idToken) {
      return NextResponse.json({ error: "Missing idToken" }, { status: 400 });
    }

    const auth = getAdminAuth();
    const decoded = await auth.verifyIdToken(idToken);
    const allowed = await mayCreateSession(decoded.uid, decoded.email);

    if (!allowed) {
      return NextResponse.json(
        {
          error:
            "האימייל לא ברשימת ההזמנות. צור קשר עם המנהל כדי להוסיף אותך.",
          code: "NOT_INVITED",
        },
        { status: 403 }
      );
    }

    const tenants = await listAccessibleTenants(decoded.email, decoded.uid);
    for (const t of tenants) {
      const db = getFirestoreForDatabaseId(t.databaseId);
      await ensureUserDoc(decoded.uid, decoded.email, db, t);
    }

    const expiresMs = getSessionExpiresMs();
    const maxAgeSec = Math.floor(expiresMs / 1000);
    const sessionCookie = await auth.createSessionCookie(idToken, {
      expiresIn: expiresMs,
    });

    const res = NextResponse.json({ ok: true });
    setSessionCookieOnResponse(res, sessionCookie, maxAgeSec);

    const cookieSlug = req.cookies.get(TENANT_COOKIE)?.value;
    const preferred = resolveTenantById(cookieSlug);
    const defaultT = resolveTenantById(getDefaultTenantId());
    const pick =
      (preferred && tenants.some((x) => x.id === preferred.id) ? preferred : null) ??
      (defaultT && tenants.some((x) => x.id === defaultT.id) ? defaultT : null) ??
      tenants[0];
    if (pick) {
      setTenantCookieOnResponse(res, pick.id, maxAgeSec);
    }

    return res;
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Unknown error";
    return NextResponse.json({ error: msg }, { status: 401 });
  }
}

export async function DELETE() {
  const res = NextResponse.json({ ok: true });
  clearSessionCookieOnResponse(res);
  return res;
}
