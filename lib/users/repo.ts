import { getAdminDb } from "@/lib/firebase/admin";

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

