import * as admin from "firebase-admin";
import { getFirestore } from "firebase-admin/firestore";
import { headers } from "next/headers";
import { TENANT_DB_HEADER, getTenantConfigs } from "@/lib/tenant/config";

let init = false;

function parseServiceAccountJson(raw: string): Record<string, unknown> {
  const direct = raw.trim();
  try {
    return JSON.parse(direct) as Record<string, unknown>;
  } catch {
    // Some env providers may materialize private_key with literal newlines.
    const patched = direct.replace(
      /"private_key"\s*:\s*"([\s\S]*?)"\s*,\s*"client_email"/,
      (_m, pk) => {
        const escaped = String(pk)
          .replace(/\\/g, "\\\\")
          .replace(/\r?\n/g, "\\n")
          .replace(/"/g, '\\"');
        return `"private_key":"${escaped}","client_email"`;
      }
    );
    return JSON.parse(patched) as Record<string, unknown>;
  }
}

function ensureAdmin() {
  if (init) return;
  const raw = process.env.FIREBASE_SERVICE_ACCOUNT_JSON?.trim();
  if (!raw) throw new Error("Missing FIREBASE_SERVICE_ACCOUNT_JSON");

  const cred = parseServiceAccountJson(raw);
  if (typeof cred.private_key === "string") {
    cred.private_key = cred.private_key.replace(/\\n/g, "\n");
  }

  if (!admin.apps.length) {
    admin.initializeApp({
      credential: admin.credential.cert(cred as admin.ServiceAccount),
    });
  }

  init = true;
}

export function getAdminAuth(): admin.auth.Auth {
  ensureAdmin();
  return admin.auth();
}

export function getFirestoreForDatabaseId(databaseId: string): admin.firestore.Firestore {
  ensureAdmin();
  const id = databaseId.trim();
  if (!id || id === "(default)") {
    return getFirestore();
  }
  return getFirestore(admin.app(), id);
}

export function fallbackTenantDatabaseId(): string {
  const env = process.env.FIRESTORE_DATABASE_ID?.trim();
  if (env) return env;
  const t = getTenantConfigs()[0];
  return t?.databaseId?.trim() || "(default)";
}

export async function getRequestTenantDatabaseId(): Promise<string> {
  try {
    const h = await headers();
    const fromHeader = h.get(TENANT_DB_HEADER)?.trim();
    if (fromHeader) return fromHeader;
  } catch {
    // Outside an App Router request (e.g. build / scripts).
  }
  return fallbackTenantDatabaseId();
}

export async function getAdminDb(): Promise<admin.firestore.Firestore> {
  const id = await getRequestTenantDatabaseId();
  return getFirestoreForDatabaseId(id);
}

/**
 * מזהה מסד Firestore שאליו מצביע webhook ווטסאפ (ללא אתחול admin).
 * אותה לוגיקה כמו {@link getFirestoreForWhatsAppWebhook}.
 */
export function getWhatsAppWebhookDatabaseId(): string {
  const explicit = process.env.WHATSAPP_WEBHOOK_FIRESTORE_DATABASE_ID?.trim();
  if (explicit) return explicit;
  return fallbackTenantDatabaseId();
}

/**
 * מסד Firestore להודעות WhatsApp מ-webhook של מטא.
 * בקשות ממטא אין בהן עוגיית tenant — לכן לא משתמשים ב-headers() של הדפדפן.
 * הגדירו WHATSAPP_WEBHOOK_FIRESTORE_DATABASE_ID ב-Vercel (אותו databaseId כמו ב-CRM_TENANTS / FIRESTORE_DATABASE_ID)
 * אם הנתונים לא ב-(default).
 */
export function getFirestoreForWhatsAppWebhook(): admin.firestore.Firestore {
  ensureAdmin();
  return getFirestoreForDatabaseId(getWhatsAppWebhookDatabaseId());
}

/** Default bucket resolves from project when FIREBASE_STORAGE_BUCKET is unset. */
export function getAdminStorageBucket(): ReturnType<admin.storage.Storage["bucket"]> {
  ensureAdmin();
  const name = process.env.FIREBASE_STORAGE_BUCKET?.trim();
  if (name) return admin.storage().bucket(name);
  return admin.storage().bucket();
}
