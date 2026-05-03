import type { Firestore } from "firebase-admin/firestore";
import { FieldValue } from "firebase-admin/firestore";
import { getAdminDb } from "@/lib/firebase/admin";
import type { TenantConfig } from "@/lib/tenant/config";
import { isTenantMember } from "@/lib/tenant/config";
import type { UserProfile } from "@/lib/auth/types";

function normalizeEmail(email: string): string {
  return email.trim().toLowerCase();
}

/** מזהה מסמך users — זהה ל־ensureUserDoc / getUserProfile */
export function userFirestoreDocumentId(email: string | undefined, uid: string): string {
  if (email?.includes("@")) return normalizeEmail(email);
  return uid;
}

export function isAdminEmail(email: string | undefined): boolean {
  if (!email) return false;
  const list =
    process.env.ADMIN_EMAILS?.split(",").map((s) => s.trim().toLowerCase()) ??
    [];
  return list.includes(email.toLowerCase());
}

export async function inviteExists(
  email: string | undefined,
  db: Firestore
): Promise<boolean> {
  if (!email) return false;
  const normalized = normalizeEmail(email);
  const snap = await db.collection("invites").doc(normalized).get();
  if (snap.exists) return true;

  const byEmailField = await db
    .collection("invites")
    .where("email", "==", normalized)
    .limit(1)
    .get();
  return !byEmailField.empty;
}

export async function getUserProfile(
  uid: string,
  email: string | undefined,
  db: Firestore
): Promise<UserProfile | null> {
  const docId = userFirestoreDocumentId(email, uid);
  const snap = await db.collection("users").doc(docId).get();
  if (!snap.exists) return null;

  const d = snap.data() as Record<string, unknown>;
  return {
    email: String(d.email ?? email ?? ""),
    role: d.role === "admin" ? "admin" : "user",
    approved: Boolean(d.approved),
    utmSource: typeof d.utmSource === "string" ? d.utmSource : undefined,
  };
}

export async function ensureUserDoc(
  uid: string,
  email: string | undefined,
  db: Firestore,
  tenant: TenantConfig
): Promise<UserProfile> {
  const admin = isAdminEmail(email);
  const member = isTenantMember(email, tenant);
  const docId = userFirestoreDocumentId(email, uid);
  const ref = db.collection("users").doc(docId);

  const snap = await ref.get();
  if (snap.exists) {
    const d = snap.data() as Record<string, unknown>;
    const existingEmail = typeof d.email === "string" ? d.email : "";
    const newEmail = email ?? existingEmail;

    const updates: Record<string, unknown> = {};

    if (newEmail && newEmail !== existingEmail) {
      updates.email = newEmail;
    }

    const invited = await inviteExists(email, db);
    const shouldApprove = admin || member || invited;

    if (admin) {
      if (d.role !== "admin") updates.role = "admin";
      if (!d.approved) updates.approved = true;
    } else if (shouldApprove && !d.approved) {
      updates.approved = true;
    }

    if (Object.keys(updates).length > 0) {
      updates.updatedAt = FieldValue.serverTimestamp();
      await ref.update(updates);
    }

    const profile = await getUserProfile(uid, email, db);
    if (!profile) throw new Error("User doc exists but profile missing");
    return profile;
  }

  const invited = await inviteExists(email, db);
  const approved = admin || member || invited;
  const role: UserProfile["role"] = admin ? "admin" : "user";
  const profile: UserProfile = {
    email: email ?? "",
    role,
    approved,
  };

  await ref.set({
    ...profile,
    createdAt: FieldValue.serverTimestamp(),
    updatedAt: FieldValue.serverTimestamp(),
  });

  return profile;
}

/** Current request tenant (convenience for callers that omit explicit db). */
export async function getUserProfileForRequest(
  uid: string,
  email: string | undefined
): Promise<UserProfile | null> {
  const db = await getAdminDb();
  return getUserProfile(uid, email, db);
}
