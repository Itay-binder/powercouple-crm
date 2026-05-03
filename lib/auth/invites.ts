import { getFirestoreForDatabaseId } from "@/lib/firebase/admin";
import { getTenantConfigs } from "@/lib/tenant/config";
import { isAdminEmail } from "@/lib/auth/profile";

export async function mayCreateSession(
  uid: string,
  email: string | undefined
): Promise<boolean> {
  if (isAdminEmail(email)) return true;

  for (const t of getTenantConfigs()) {
    const db = getFirestoreForDatabaseId(t.databaseId);

    if (email?.includes("@")) {
      const docId = email.trim().toLowerCase();
      const snap = await db.collection("users").doc(docId).get();
      if (snap.exists) return true;
    }

    if (!email?.includes("@")) continue;
    const normalized = email.trim().toLowerCase();

    const inviteSnap = await db.collection("invites").doc(normalized).get();
    if (inviteSnap.exists) return true;

    const byEmailField = await db
      .collection("invites")
      .where("email", "==", normalized)
      .limit(1)
      .get();
    if (!byEmailField.empty) return true;
  }

  return false;
}
