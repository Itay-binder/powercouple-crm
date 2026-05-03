import Link from "next/link";

type Section = "fields" | "api" | "triggers" | "cityRegions" | "notifications";

export default function SettingsSectionNav({
  active,
  showMovingOrders,
}: {
  active: Section;
  /** לשונית מיפוי ערים — רק לטננט עם ניהול הזמנות */
  showMovingOrders?: boolean;
}) {
  const base = {
    padding: "10px 14px",
    borderRadius: 10,
    textDecoration: "none",
    fontWeight: 600 as const,
    fontSize: 14,
  };
  const activeStyle = {
    ...base,
    background: "linear-gradient(180deg, #a78bfa 0%, #6d28d9 100%)",
    color: "#fff",
  };
  const idleStyle = {
    ...base,
    background: "#f3f4f6",
    color: "#111827",
  };
  return (
    <nav
      aria-label="הגדרות משנה"
      style={{
        display: "flex",
        flexWrap: "wrap",
        gap: 8,
        marginBottom: 20,
      }}
    >
      <Link href="/settings/fields" style={active === "fields" ? activeStyle : idleStyle}>
        ניהול שדות
      </Link>
      <Link href="/settings/api" style={active === "api" ? activeStyle : idleStyle}>
        API
      </Link>
      <Link href="/settings/triggers" style={active === "triggers" ? activeStyle : idleStyle}>
        טריגרים
      </Link>
      <Link
        href="/settings/notifications"
        style={active === "notifications" ? activeStyle : idleStyle}
      >
        התראות
      </Link>
      {showMovingOrders ? (
        <Link
          href="/settings/city-regions"
          style={active === "cityRegions" ? activeStyle : idleStyle}
        >
          אזורי פעילות — ערים
        </Link>
      ) : null}
    </nav>
  );
}
