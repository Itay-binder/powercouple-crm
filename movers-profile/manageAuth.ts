import { getMoverSession, normalizePhoneForAuth } from "./session";
import { getSessionUser } from "@/lib/auth/cookiesSession";
import type { MoverProfile } from "./types";

/** Returns true if the current request is authorised to manage this profile.
 *  Accepts either a valid mover SMS session (phone matches) or any logged-in CRM user. */
export async function isAuthorisedForManage(profile: MoverProfile): Promise<boolean> {
  const moverSession = await getMoverSession();
  if (
    moverSession &&
    normalizePhoneForAuth(moverSession.phone) === normalizePhoneForAuth(profile.phone)
  ) {
    return true;
  }
  const crmUser = await getSessionUser();
  return crmUser !== null;
}
