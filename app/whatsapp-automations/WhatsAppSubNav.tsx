"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

const items = [
  { href: "/whatsapp-automations", label: "ברודקאסטים", match: (p: string) => p === "/whatsapp-automations" || p.startsWith("/whatsapp-automations/broadcasts") },
  { href: "/whatsapp-automations/audiences", label: "קהלים", match: (p: string) => p.startsWith("/whatsapp-automations/audiences") },
  { href: "/whatsapp-automations/chats", label: "צ׳אטים", match: (p: string) => p.startsWith("/whatsapp-automations/chats") },
  { href: "/whatsapp-automations/marketing-status", label: "סטטוס דיוור", match: (p: string) => p.startsWith("/whatsapp-automations/marketing-status") },
  { href: "/whatsapp-automations/templates", label: "תבניות הודעה", match: (p: string) => p.startsWith("/whatsapp-automations/templates") },
  { href: "/whatsapp-automations/account", label: "חשבון WhatsApp", match: (p: string) => p.startsWith("/whatsapp-automations/account") },
  { href: "/whatsapp-automations/greenapi", label: "GREENAPI", match: (p: string) => p.startsWith("/whatsapp-automations/greenapi") },
];

export default function WhatsAppSubNav() {
  const pathname = usePathname() || "";
  return (
    <div
      className="wa-subnav"
      style={{
        display: "flex",
        gap: 8,
        marginBottom: 20,
        flexWrap: "nowrap",
        overflowX: "auto",
        WebkitOverflowScrolling: "touch",
        borderBottom: "1px solid #e5e7eb",
        paddingBottom: 12,
        scrollbarWidth: "thin",
      }}
    >
      {items.map((item) => {
        const active = item.match(pathname);
        return (
          <Link
            key={item.href}
            href={item.href}
            style={{
              padding: "8px 14px",
              borderRadius: 10,
              fontWeight: 800,
              fontSize: 14,
              textDecoration: "none",
              background: active ? "#ede9fe" : "transparent",
              color: active ? "#4c1d95" : "#374151",
              border: active ? "1px solid #ddd6fe" : "1px solid transparent",
              whiteSpace: "nowrap",
              flexShrink: 0,
            }}
          >
            {item.label}
          </Link>
        );
      })}
    </div>
  );
}
