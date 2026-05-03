import { FieldValue } from "firebase-admin/firestore";
import { getAdminDb } from "@/lib/firebase/admin";

export type StoredGoogleCalendarTokens = {
  accessToken: string;
  refreshToken?: string;
  scope?: string;
  tokenType?: string;
  expiryDate?: number;
  /** Google account email (from userinfo), for display */
  accountEmail?: string;
};

const COL = "tenantIntegrations";
const DOC = "googleCalendar";

export async function getGoogleCalendarTokensForTenant(): Promise<StoredGoogleCalendarTokens | null> {
  const db = await getAdminDb();
  const snap = await db.collection(COL).doc(DOC).get();
  if (!snap.exists) return null;
  const d = (snap.data() ?? {}) as Record<string, unknown>;
  const accessToken = typeof d.accessToken === "string" ? d.accessToken : "";
  if (!accessToken) return null;
  return {
    accessToken,
    refreshToken: typeof d.refreshToken === "string" ? d.refreshToken : undefined,
    scope: typeof d.scope === "string" ? d.scope : undefined,
    tokenType: typeof d.tokenType === "string" ? d.tokenType : undefined,
    expiryDate: typeof d.expiryDate === "number" ? d.expiryDate : undefined,
    accountEmail: typeof d.accountEmail === "string" ? d.accountEmail : undefined,
  };
}

export async function saveGoogleCalendarTokensForTenant(input: {
  accessToken: string;
  refreshToken?: string;
  scope?: string;
  tokenType?: string;
  expiryDate?: number;
  accountEmail?: string;
}): Promise<void> {
  const db = await getAdminDb();
  await db.collection(COL).doc(DOC).set(
    {
      accessToken: input.accessToken,
      ...(input.refreshToken ? { refreshToken: input.refreshToken } : {}),
      scope: input.scope ?? "",
      tokenType: input.tokenType ?? "Bearer",
      expiryDate: input.expiryDate ?? 0,
      accountEmail: input.accountEmail ?? "",
      updatedAt: FieldValue.serverTimestamp(),
    },
    { merge: true }
  );
}

export async function disconnectGoogleCalendarForTenant(): Promise<void> {
  const db = await getAdminDb();
  await db.collection(COL).doc(DOC).delete();
}
