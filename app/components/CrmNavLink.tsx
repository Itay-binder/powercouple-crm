"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

export default function CrmNavLink({
  href,
  label,
  exact,
}: {
  href: string;
  label: string;
  /** אם true — רק התאמה מלאה (למשל /seo בלי /seo/dashboard) */
  exact?: boolean;
}) {
  const pathname = usePathname();
  const active = exact
    ? pathname === href
    : pathname === href || pathname.startsWith(`${href}/`);
  return (
    <Link
      href={href}
      className="crm-nav-link"
      style={{
        display: "block",
        padding: "10px 12px",
        borderRadius: 12,
        color: active ? "#1d4ed8" : "#111827",
        textDecoration: "none",
        fontWeight: 600,
        background: active ? "#eff6ff" : "transparent",
      }}
    >
      {label}
    </Link>
  );
}
