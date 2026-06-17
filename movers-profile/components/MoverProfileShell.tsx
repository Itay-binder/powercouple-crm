"use client";

import { useCallback, useEffect, useState } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import MoverProfileView from "./MoverProfileView";
import ManagePageClient from "./ManagePageClient";
import SmsLoginClient from "./SmsLoginClient";
import CreativeShowcaseManagePreview from "./CreativeShowcaseManagePreview";
import type { PublicMoverData } from "../types";

type AdminProfileRef = { id: string; slug: string; name: string; profileImageUrl: string };

type Tab = "card" | "manage";

type Props = {
  slug: string;
  data: PublicMoverData;
  /** כרטיס ההדגמה liftygo-card — ניהול סטטי לקריאייטיב */
  isShowcase: boolean;
  /** מוביל מאומת SMS או אדמין CRM */
  manageAuthorized: boolean;
  isAdmin: boolean;
  allProfiles: AdminProfileRef[] | null;
};

export default function MoverProfileShell({
  slug,
  data,
  isShowcase,
  manageAuthorized,
  isAdmin,
  allProfiles,
}: Props) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();

  const initialTab: Tab =
    searchParams.get("tab") === "manage" ? "manage" : "card";
  const [tab, setTab] = useState<Tab>(initialTab);

  useEffect(() => {
    const t = searchParams.get("tab") === "manage" ? "manage" : "card";
    setTab(t);
  }, [searchParams]);

  const syncUrl = useCallback(
    (t: Tab) => {
      const q = t === "manage" ? "?tab=manage" : "";
      router.replace(`${pathname}${q}`, { scroll: false });
    },
    [pathname, router]
  );

  function selectTab(t: Tab) {
    setTab(t);
    syncUrl(t);
  }

  const tabBtn = (t: Tab, label: string) => {
    const active = tab === t;
    return (
      <button
        type="button"
        onClick={() => selectTab(t)}
        style={{
          padding: "10px 18px",
          borderRadius: 999,
          border: active ? "1px solid rgba(124,58,237,0.8)" : "1px solid rgba(255,255,255,0.12)",
          background: active ? "rgba(124,58,237,0.35)" : "rgba(0,0,0,0.25)",
          color: "#f9fafb",
          fontSize: 13,
          fontWeight: 800,
          cursor: "pointer",
          fontFamily: "inherit",
        }}
      >
        {label}
      </button>
    );
  };

  return (
    <div
      style={{
        minHeight: "100vh",
        background:
          tab === "manage" && !isShowcase
            ? "linear-gradient(135deg, #0d0d1a 0%, #130d2b 100%)"
            : tab === "manage" && isShowcase
              ? "linear-gradient(135deg, #0d0d1a 0%, #130d2b 100%)"
              : "transparent",
      }}
    >
      {/* סרגל לשוניות — מוצג מעל התוכן */}
      <div
        style={{
          position: "sticky",
          top: 0,
          zIndex: 40,
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          gap: 12,
          flexWrap: "wrap",
          padding: "12px 16px",
          borderBottom:
            tab === "card"
              ? "1px solid rgba(255,255,255,0.08)"
              : "1px solid rgba(139,92,246,0.2)",
          background:
            tab === "card"
              ? "rgba(15,12,35,0.92)"
              : "rgba(0,0,0,0.45)",
          backdropFilter: "blur(12px)",
          fontFamily: "var(--font-rubik), Rubik, sans-serif",
          direction: "rtl",
        }}
      >
        <div style={{ display: "flex", alignItems: "baseline", gap: 10, flexWrap: "wrap" }}>
          <span style={{ fontSize: 20, fontWeight: 900, color: "#a78bfa" }}>✦</span>
          <span style={{ fontWeight: 900, fontSize: 15, color: "#f9fafb" }}>LiftyGo</span>
          <span style={{ fontSize: 12, color: "#9ca3af", fontWeight: 600 }}>
            כרטיס המוביל
          </span>
        </div>
        <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
          {tabBtn("card", "כרטיס מוביל")}
          {tabBtn("manage", "ניהול")}
        </div>
      </div>

      {tab === "card" ? (
        <MoverProfileView
          data={data}
          embedInShell
          creativeCampaignRibbon={isShowcase}
          disablePublicActions={isShowcase}
        />
      ) : isShowcase ? (
        <CreativeShowcaseManagePreview />
      ) : manageAuthorized ? (
        <ManagePageClient
          data={data}
          isAdmin={isAdmin}
          allProfiles={allProfiles}
          embedded
        />
      ) : (
        <SmsLoginClient slug={slug} embedded />
      )}
    </div>
  );
}
