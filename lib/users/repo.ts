import { getAdminDb } from "@/lib/firebase/admin";
import { FieldValue } from "firebase-admin/firestore";

export type AdminUserOption = {
  id: string;
  email: string;
  name?: string;
};

export async function listAdminUsers(): Promise<AdminUserOption[]> {
  const db = await getAdminDb();
  const snap = await db
    .collection("users")
    .where("role", "==", "admin")
    .get();

  const out = snap.docs
    .map((doc) => {
      const d = (doc.data() ?? {}) as Record<string, unknown>;
      const email = String(d.email ?? doc.id).trim().toLowerCase();
      if (!email) return null;
      const nameRaw =
        typeof d.name === "string"
          ? d.name
          : typeof d.displayName === "string"
          ? d.displayName
          : typeof d.fullName === "string"
          ? d.fullName
          : "";
      const name = nameRaw.trim() || undefined;
      return { id: doc.id, email, name } as AdminUserOption;
    })
    .filter(Boolean) as AdminUserOption[];

  return out.sort((a, b) =>
    (a.name || a.email).localeCompare(b.name || b.email, "he")
  );
}

export type TeamUserRow = {
  id: string;
  email: string;
  name?: string;
  role: "admin" | "user";
  approved: boolean;
};

export async function listTeamUsers(): Promise<TeamUserRow[]> {
  const db = await getAdminDb();
  const snap = await db.collection("users").limit(500).get();
  return snap.docs
    .map((doc) => {
      const d = (doc.data() ?? {}) as Record<string, unknown>;
      const email = String(d.email ?? doc.id).trim().toLowerCase();
      if (!email) return null;
      const nameRaw =
        typeof d.name === "string"
          ? d.name
          : typeof d.displayName === "string"
          ? d.displayName
          : typeof d.fullName === "string"
          ? d.fullName
          : "";
      const name = nameRaw.trim() || undefined;
      const role = d.role === "admin" ? "admin" : "user";
      const approved = Boolean(d.approved);
      return { id: doc.id, email, name, role, approved } satisfies TeamUserRow;
    })
    .filter(Boolean)
    .sort((a, b) => {
      const aa = a as TeamUserRow;
      const bb = b as TeamUserRow;
      return (aa.name || aa.email).localeCompare(bb.name || bb.email, "he");
    }) as TeamUserRow[];
}

export async function upsertTeamUser(input: {
  email: string;
  name?: string;
  role: "admin" | "user";
  approved: boolean;
}): Promise<void> {
  const email = input.email.trim().toLowerCase();
  if (!email || !email.includes("@")) throw new Error("כתובת אימייל לא תקינה");
  const db = await getAdminDb();
  await db.collection("users").doc(email).set(
    {
      email,
      ...(input.name?.trim() ? { name: input.name.trim() } : {}),
      role: input.role,
      approved: input.approved,
      updatedAt: FieldValue.serverTimestamp(),
      createdAt: FieldValue.serverTimestamp(),
    },
    { merge: true }
  );
}

