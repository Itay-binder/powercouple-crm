import type { UserProfile } from "@/lib/auth/types";
import { getCrmSession } from "@/lib/auth/crmSession";

export { SESSION_COOKIE, authDisabled, getSessionUser } from "@/lib/auth/cookiesSession";

export async function getSessionWithProfile(): Promise<
  { uid: string; email?: string; profile: UserProfile } | null
> {
  const s = await getCrmSession();
  if (s.kind !== "ok") return null;
  return { uid: s.uid, email: s.email, profile: s.profile };
}
