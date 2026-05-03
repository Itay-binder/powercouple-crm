import type { NextRequest } from "next/server";
import { getVerifiedAuthFromRequest } from "@/lib/auth/fromRequest";
import { ensureUserDoc } from "@/lib/auth/profile";
import { authDisabled } from "@/lib/auth/session";
import { getRequestTenantDatabaseId, getAdminDb } from "@/lib/firebase/admin";
import { isValidIngestApiKeyAsync } from "@/lib/ingest/apiKey";
import { getTenantByDatabaseId } from "@/lib/tenant/config";
import { canAccessTenant } from "@/lib/tenant/access";

export type ApprovedUser = {
  uid: string;
  email?: string;
  profile: Awaited<ReturnType<typeof ensureUserDoc>>;
};

export async function requireApprovedUser(req: NextRequest): Promise<
  | { ok: true; user: ApprovedUser }
  | { ok: false; status: 401 | 403; error: string }
> {
  if (authDisabled()) {
    return {
      ok: true,
      user: {
        uid: "dev",
        email: undefined,
        profile: { email: "", role: "admin", approved: true } as ApprovedUser["profile"],
      },
    };
  }

  const authUser = await getVerifiedAuthFromRequest(req);
  if (!authUser) return { ok: false, status: 401, error: "Unauthorized" };

  const dbId = await getRequestTenantDatabaseId();
  const tenant = getTenantByDatabaseId(dbId);
  if (!tenant) {
    return { ok: false, status: 403, error: "Unknown workspace" };
  }
  if (!(await canAccessTenant(authUser.email, authUser.uid, tenant))) {
    return { ok: false, status: 403, error: "No access to this workspace" };
  }

  const db = await getAdminDb();
  const profile = await ensureUserDoc(authUser.uid, authUser.email, db, tenant);
  if (!profile.approved) {
    return { ok: false, status: 403, error: "Not approved" };
  }

  return {
    ok: true,
    user: {
      uid: authUser.uid,
      email: authUser.email,
      profile,
    },
  };
}

/** Browser session (approved user) OR ingest API key — for read/list APIs used from Make, etc. */
export async function requireApprovedUserOrIngestApiKey(req: NextRequest): Promise<
  | { ok: true; user?: ApprovedUser }
  | { ok: false; status: 401 | 403; error: string }
> {
  if (authDisabled()) {
    return {
      ok: true,
      user: {
        uid: "dev",
        email: undefined,
        profile: { email: "", role: "admin", approved: true } as ApprovedUser["profile"],
      },
    };
  }

  if (await isValidIngestApiKeyAsync(req)) {
    return { ok: true };
  }

  return requireApprovedUser(req);
}
