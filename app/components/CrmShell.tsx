import UserMenu from "@/app/components/UserMenu";
import CrmNavLink from "@/app/components/CrmNavLink";
import CrmGlobalNotifications from "@/app/components/CrmGlobalNotifications";
import CrmGlobalSearch from "@/app/components/CrmGlobalSearch";
export type CrmTenantOption = { id: string; label: string };

type Props = {
  email: string | null;
  tenants?: CrmTenantOption[];
  currentTenantId?: string | null;
  tenantForbidden?: boolean;
  children: React.ReactNode;
};

export default function CrmShell({
  email,
  tenants = [],
  currentTenantId = null,
  tenantForbidden = false,
  children,
}: Props) {
  const isHotAfikTenant = currentTenantId === "hot-afik";

  return (
    <div
      className="crm-shell-layout"
      style={{
        display: "flex",
        minHeight: "100vh",
        background: "#f3f4f6",
      }}
    >
      <aside
        className="crm-shell-aside"
        style={{
          width: 260,
          background: "#ffffff",
          borderRight: "1px solid #e5e7eb",
          padding: 16,
        }}
      >
        <div
          className="crm-shell-aside-top"
          style={{
            display: "flex",
            flexDirection: "column",
            gap: 12,
            marginBottom: 18,
          }}
        >
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 12 }}>
            <div style={{ lineHeight: 1.1 }}>
              <div style={{ fontWeight: 800 }}>Power Couple CRM</div>
              <div style={{ fontSize: 12, color: "#6b7280" }}>קליטת לקוחות</div>
            </div>
            <UserMenu
              email={email}
              tenants={tenants}
              currentTenantId={currentTenantId}
            />
          </div>
          <CrmGlobalSearch />
        </div>

        <nav className="crm-shell-nav" style={{ display: "grid", gap: 8, marginTop: 8 }}>
          <div style={{ fontSize: 11, fontWeight: 800, color: "#9ca3af", marginTop: 4 }}>ראשי</div>
          <CrmNavLink href="/dashboard" label="דשבורד" />
          <div style={{ fontSize: 11, fontWeight: 800, color: "#9ca3af", marginTop: 12 }}>אנשי קשר</div>
          <CrmNavLink href="/contacts" label="אנשי קשר" />
          <div style={{ fontSize: 11, fontWeight: 800, color: "#9ca3af", marginTop: 12 }}>ניהול לקוחות</div>
          <CrmNavLink href="/pipeline" label="לקוחות" />
          <CrmNavLink href="/deals" label="עסקאות נדל״ן" />
          <CrmNavLink href="/inquiries" label="פניות" />
          <div style={{ fontSize: 11, fontWeight: 800, color: "#9ca3af", marginTop: 12 }}>תפעול</div>
          <CrmNavLink href="/tasks" label="משימות" />
          <CrmNavLink href="/calls" label="ניהול שיחות" />
          <CrmNavLink href="/calendar" label="לוח שנה" />
          {!isHotAfikTenant ? <CrmNavLink href="/billing" label="סליקה" /> : null}
          {!isHotAfikTenant ? (
            <CrmNavLink href="/whatsapp-automations" label="אוטומציות ווצאפ" />
          ) : null}
          {!isHotAfikTenant ? <CrmNavLink href="/meta-ads" label="חיבור למטא" /> : null}
          {!isHotAfikTenant ? <CrmNavLink href="/seo" label="סוכן SEO" /> : null}
          <CrmNavLink href="/settings" label="הגדרות" />
        </nav>
      </aside>

      <section
        className="crm-shell-main"
        style={{
          flex: 1,
          minWidth: 0,
          maxWidth: "100%",
          overflowX: "hidden",
          padding: 18,
        }}
      >
        {tenantForbidden ? (
          <div
            style={{
              maxWidth: 560,
              margin: "40px auto",
              padding: 22,
              borderRadius: 16,
              border: "1px solid #fecaca",
              background: "#fff1f2",
              color: "#881337",
            }}
          >
            <div style={{ fontWeight: 800, fontSize: 18 }}>
              אין גישה לעסק הנבחר
            </div>
            <div style={{ marginTop: 10, fontSize: 14, lineHeight: 1.5 }}>
              בחר עסק אחר מהרשימה ליד האווטאר (למעלה), או בקש מהמנהל גישה לעסק
              הזה.
            </div>
          </div>
        ) : (
          <>
            {children}
            <CrmGlobalNotifications tenantId={currentTenantId} />
          </>
        )}
      </section>
    </div>
  );
}
