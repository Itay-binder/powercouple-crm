import { redirect } from "next/navigation";
import { authDisabled } from "@/lib/auth/session";
import { getSessionUser } from "@/lib/auth/cookiesSession";
import { getAdminDb, getRequestTenantDatabaseId } from "@/lib/firebase/admin";
import { getTenantByDatabaseId } from "@/lib/tenant/config";
import { canAccessTenant } from "@/lib/tenant/access";
import { getUserProfile } from "@/lib/auth/profile";
import PendingLogoutButton from "@/app/pending/PendingLogoutButton";

export const dynamic = "force-dynamic";

export default async function PendingPage() {
  if (authDisabled()) redirect("/login");
  const user = await getSessionUser();
  if (!user) redirect("/login?returnTo=/pending");

  const dbId = await getRequestTenantDatabaseId();
  const tenant = getTenantByDatabaseId(dbId);
  if (!tenant || !(await canAccessTenant(user.email, user.uid, tenant))) {
    redirect("/login?returnTo=/pending");
  }

  const db = await getAdminDb();
  const profile = await getUserProfile(user.uid, user.email, db);
  if (!profile) redirect("/login?returnTo=/pending");

  if (profile.approved) {
    redirect("/dashboard");
  }

  return (
    <main style={{ minHeight: "100vh", display: "grid", placeItems: "center" }}>
      <div
        style={{
          width: "min(520px, 92vw)",
          border: "1px solid #e5e7eb",
          borderRadius: 16,
          padding: 22,
          background: "#fff",
          boxShadow: "0 12px 40px rgba(0,0,0,0.06)",
          textAlign: "center",
        }}
      >
        <h1 style={{ margin: 0, fontSize: 22 }}>ממתין לאישור</h1>
        <p style={{ marginTop: 12, color: "#4b5563" }}>
          החשבון <strong dir="ltr">{profile.email}</strong> ממתין לאישור מנהל
          לפני גישה ל-CRM.
        </p>
        <PendingLogoutButton />
      </div>
    </main>
  );
}
