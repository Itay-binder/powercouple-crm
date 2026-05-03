"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

const tabs: { href: string; label: string; match: (p: string) => boolean }[] = [
  { href: "/seo", label: "יצירת מאמר", match: (p) => p === "/seo" },
  { href: "/seo/dashboard", label: "דשבורד", match: (p) => p.startsWith("/seo/dashboard") },
  { href: "/seo/settings", label: "הגדרות", match: (p) => p.startsWith("/seo/settings") },
];

export default function SeoHubTabs() {
  const pathname = usePathname() ?? "";
  const articleTabActive =
    (pathname === "/seo" || pathname.startsWith("/seo/articles/")) &&
    !pathname.startsWith("/seo/dashboard") &&
    !pathname.startsWith("/seo/settings");

  return (
    <div
      style={{
        marginBottom: 20,
        padding: "4px 4px 0",
        borderBottom: "1px solid #e5e7eb",
        background: "#fff",
        borderRadius: "14px 14px 0 0",
      }}
    >
      <div style={{ fontSize: 12, fontWeight: 800, color: "#9ca3af", margin: "10px 12px 6px" }}>סוכן SEO</div>
      <nav style={{ display: "flex", flexWrap: "wrap", gap: 4, padding: "0 8px 8px" }}>
        {tabs.map((t) => {
          const active = t.href === "/seo" ? articleTabActive : t.match(pathname);
          return (
            <Link
              key={t.href}
              href={t.href}
              style={{
                padding: "10px 16px",
                borderRadius: 10,
                textDecoration: "none",
                fontWeight: 700,
                fontSize: 14,
                color: active ? "#1d4ed8" : "#374151",
                background: active ? "#eff6ff" : "transparent",
                border: active ? "1px solid #bfdbfe" : "1px solid transparent",
              }}
            >
              {t.label}
            </Link>
          );
        })}
      </nav>
    </div>
  );
}
