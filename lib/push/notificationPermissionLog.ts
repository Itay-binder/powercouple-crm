import { FieldValue, type Firestore } from "firebase-admin/firestore";

const MAX_LOG = 50;

export type NotificationPermissionLogEntry = {
  at: string;
  action: "request" | "granted" | "denied" | "default" | "unsupported";
  permissionVersion: number | null;
  userAgent: string | null;
  platform: string | null;
  language: string | null;
  deviceFingerprint: string | null;
};

export async function appendNotificationPermissionLog(
  db: Firestore,
  userDocId: string,
  entry: Omit<NotificationPermissionLogEntry, "at"> & { at?: string }
): Promise<void> {
  const ref = db.collection("users").doc(userDocId);
  const snap = await ref.get();
  const prev = (snap.data() ?? {}) as Record<string, unknown>;
  const existing = Array.isArray(prev.notificationPermissionLog)
    ? [...(prev.notificationPermissionLog as unknown[])]
    : [];
  const row: NotificationPermissionLogEntry = {
    at: entry.at ?? new Date().toISOString(),
    action: entry.action,
    permissionVersion: entry.permissionVersion ?? null,
    userAgent: entry.userAgent,
    platform: entry.platform,
    language: entry.language,
    deviceFingerprint: entry.deviceFingerprint,
  };
  const next = [...existing, row].slice(-MAX_LOG);
  await ref.set(
    {
      notificationPermissionLog: next,
      notificationPermissionLast: row,
      updatedAt: FieldValue.serverTimestamp(),
    },
    { merge: true }
  );
}
