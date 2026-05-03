import { cache } from "react";
import { getAdminDb, getRequestTenantDatabaseId } from "@/lib/firebase/admin";
import { getTenantByDatabaseId } from "@/lib/tenant/config";
import { canAccessTenant, listAccessibleTenants } from "@/lib/tenant/access";
import { ensureUserDoc } from "@/lib/auth/profile";
import { getSessionUser, authDisabled } from "@/lib/auth/cookiesSession";
import type { UserProfile } from "@/lib/auth/types";
import type { TenantConfig } from "@/lib/tenant/config";

export type CrmSessionOk = {
  kind: "ok";
  uid: string;
  email?: string;
  profile: UserProfile;
  tenant: TenantConfig;
  accessibleTenants: TenantConfig[];
};

export type CrmSessionForbidden = {
  kind: "forbidden";
  uid: string;
  email?: string;
  accessibleTenants: TenantConfig[];
};

export type CrmSessionAnon = { kind: "anon" };

export type CrmSession = CrmSessionOk | CrmSessionForbidden | CrmSessionAnon;

export const getCrmSession = cache(async function getCrmSession(): Promise<CrmSession> {
  if (authDisabled()) {
    return { kind: "anon" };
  }
  const user = await getSessionUser();
  if (!user) return { kind: "anon" };

  const dbId = await getRequestTenantDatabaseId();
  const tenant = getTenantByDatabaseId(dbId);
  const accessible = await listAccessibleTenants(user.email, user.uid);

  if (!tenant) {
    return {
      kind: "forbidden",
      uid: user.uid,
      email: user.email,
      accessibleTenants: accessible,
    };
  }

  if (!(await canAccessTenant(user.email, user.uid, tenant))) {
    return {
      kind: "forbidden",
      uid: user.uid,
      email: user.email,
      accessibleTenants: accessible,
    };
  }

  const db = await getAdminDb();
  const profile = await ensureUserDoc(user.uid, user.email, db, tenant);
  if (!profile.approved) {
    return {
      kind: "forbidden",
      uid: user.uid,
      email: user.email,
      accessibleTenants: accessible,
    };
  }

  return {
    kind: "ok",
    uid: user.uid,
    email: user.email,
    profile,
    tenant,
    accessibleTenants: accessible,
  };
});
