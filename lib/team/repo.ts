import { FieldValue } from "firebase-admin/firestore";
import { getAdminDb } from "@/lib/firebase/admin";

export type TeamMemberRecord = {
  id: string;
  name: string;
  role: string;
  createdAt: string | null;
  updatedAt: string | null;
};

const COLLECTION = "teamMembers";

function mapDoc(id: string, data: Record<string, unknown>): TeamMemberRecord {
  const created = data.createdAt;
  const updated = data.updatedAt;
  const toIso = (v: unknown): string | null => {
    if (v && typeof (v as { toDate?: () => Date }).toDate === "function") {
      try {
        return (v as { toDate: () => Date }).toDate().toISOString();
      } catch {
        return null;
      }
    }
    if (typeof v === "string" && v.trim()) return v.trim();
    return null;
  };
  return {
    id,
    name: typeof data.name === "string" ? data.name.trim() : "",
    role: typeof data.role === "string" ? data.role.trim() : "",
    createdAt: toIso(created),
    updatedAt: toIso(updated),
  };
}

export async function listTeamMembers(): Promise<TeamMemberRecord[]> {
  const db = await getAdminDb();
  const snap = await db.collection(COLLECTION).get();
  const out: TeamMemberRecord[] = [];
  for (const doc of snap.docs) {
    const data = (doc.data() ?? {}) as Record<string, unknown>;
    out.push(mapDoc(doc.id, data));
  }
  return out.sort((a, b) => a.name.localeCompare(b.name, "he"));
}

export async function getTeamMemberById(id: string): Promise<TeamMemberRecord | null> {
  const db = await getAdminDb();
  const ref = db.collection(COLLECTION).doc(id.trim());
  const snap = await ref.get();
  if (!snap.exists) return null;
  return mapDoc(snap.id, (snap.data() ?? {}) as Record<string, unknown>);
}

export async function createTeamMember(input: {
  name: string;
  role: string;
}): Promise<TeamMemberRecord> {
  const name = String(input.name ?? "").trim();
  const role = String(input.role ?? "").trim();
  if (!name) throw new Error("יש להזין שם מלא");
  const db = await getAdminDb();
  const ref = db.collection(COLLECTION).doc();
  await ref.set({
    name,
    role,
    createdAt: FieldValue.serverTimestamp(),
    updatedAt: FieldValue.serverTimestamp(),
  });
  const snap = await ref.get();
  return mapDoc(snap.id, (snap.data() ?? {}) as Record<string, unknown>);
}

export async function updateTeamMember(
  id: string,
  input: { name?: string; role?: string }
): Promise<TeamMemberRecord> {
  const db = await getAdminDb();
  const ref = db.collection(COLLECTION).doc(id.trim());
  const snap = await ref.get();
  if (!snap.exists) throw new Error("איש צוות לא נמצא");
  const payload: Record<string, unknown> = {
    updatedAt: FieldValue.serverTimestamp(),
  };
  if (input.name !== undefined) {
    const n = input.name.trim();
    if (!n) throw new Error("שם לא יכול להיות ריק");
    payload.name = n;
  }
  if (input.role !== undefined) payload.role = input.role.trim();
  await ref.set(payload, { merge: true });
  const after = await ref.get();
  return mapDoc(after.id, (after.data() ?? {}) as Record<string, unknown>);
}

export async function deleteTeamMember(id: string): Promise<void> {
  const db = await getAdminDb();
  await db.collection(COLLECTION).doc(id.trim()).delete();
}
