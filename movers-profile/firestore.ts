import { getFirestoreForDatabaseId, fallbackTenantDatabaseId } from "@/lib/firebase/admin";
import type { Firestore } from "firebase-admin/firestore";

export function getMoverProfilesDb(): Firestore {
  const dbId =
    process.env.MOVER_PROFILES_DATABASE_ID?.trim() || fallbackTenantDatabaseId();
  return getFirestoreForDatabaseId(dbId);
}