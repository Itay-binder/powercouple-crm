/**
 * Firebase Admin compatibility layer — now backed by the Supabase Firestore shim.
 *
 * All Firestore access goes through getFirestore() from the shim; the old
 * multi-database / Firebase Storage / Firebase Auth code paths are gone.
 * Exported function names are preserved so existing callers keep compiling.
 */
import { getFirestore, type Firestore } from "@/lib/supabase/firestoreShim";
import { formatStorageError } from "@/lib/supabase/storage";

/** No-op: there is no Firebase Admin app to initialise anymore. */
export function ensureAdmin(): void {
  /* no-op */
}

export function getFirestoreForDatabaseId(_databaseId?: string): Firestore {
  return getFirestore();
}

export function fallbackTenantDatabaseId(): string {
  return "(default)";
}

export async function getRequestTenantDatabaseId(): Promise<string> {
  return "(default)";
}

export async function getAdminDb(): Promise<Firestore> {
  return getFirestore();
}

/** מזהה מסד ל-webhook ווטסאפ — single tenant. */
export function getWhatsAppWebhookDatabaseId(): string {
  return "(default)";
}

export function getFirestoreForWhatsAppWebhook(): Firestore {
  return getFirestore();
}

/**
 * Back-compat re-export: storage error formatting now lives in lib/supabase/storage.
 * Callers that imported formatFirebaseStorageClientError keep working.
 */
export const formatFirebaseStorageClientError = formatStorageError;
