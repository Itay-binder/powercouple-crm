"use client";

import { useEffect, useState } from "react";
import useSWR from "swr";
import DealsBoardTab, { type BoardDeal } from "@/app/deals/DealsBoardTab";
import DealsMatchTab from "@/app/deals/DealsMatchTab";
import DealsPipelinesTab from "@/app/deals/DealsPipelinesTab";

type TabId = "deals" | "pipelines" | "match";

type ApiOk = { ok: true; deals: BoardDeal[] };

export default function DealsClient() {
  const [tab, setTab] = useState<TabId>("deals");

  const {
    data,
    error,
    isLoading,
    mutate,
  } = useSWR(
    "crm-property-deals",
    async (): Promise<BoardDeal[]> => {
      const res = await fetch("/api/deals", { credentials: "include", cache: "no-store" });
      const j = (await res.json()) as ApiOk | { ok: false; error?: string };
      if (!res.ok || !j.ok || !("deals" in j)) throw new Error("ok" in j && !j.ok ? j.error ?? "שגיאה" : "שגיאה");
      return j.deals;
    },
    { revalidateOnFocus: true, dedupingInterval: 5000 }
  );

  const deals = data ?? [];
  const loading = isLoading && !data;
  const [err, setErr] = useState<string | null>(null);

  useEffect(() => {
    if (error) setErr(error.message);
    else setErr(null);
  }, [error]);

  return (
    <div style={{ width: "100%", maxWidth: "100%", minWidth: 0 }}>
      <div style={{ display: "flex", alignItems: "center", gap: 12, flexWrap: "wrap", marginBottom: 12 }}>
        <h1 style={{ margin: 0, fontSize: 24, fontWeight: 900 }}>עסקאות נדל״ן</h1>
        <div style={{ display: "inline-flex", background: "#fff", border: "1px solid #e5e7eb", borderRadius: 12, padding: 4 }}>
          <button
            type="button"
            onClick={() => setTab("deals")}
            style={{
              padding: "8px 12px",
              border: "none",
              borderRadius: 8,
              background: tab === "deals" ? "#e9d5ff" : "transparent",
              fontWeight: 800,
              cursor: "pointer",
            }}
          >
            עסקאות
          </button>
          <button
            type="button"
            onClick={() => setTab("pipelines")}
            style={{
              padding: "8px 12px",
              border: "none",
              borderRadius: 8,
              background: tab === "pipelines" ? "#e9d5ff" : "transparent",
              fontWeight: 800,
              cursor: "pointer",
            }}
          >
            פייפליינים
          </button>
          <button
            type="button"
            onClick={() => setTab("match")}
            style={{
              padding: "8px 12px",
              border: "none",
              borderRadius: 8,
              background: tab === "match" ? "#e9d5ff" : "transparent",
              fontWeight: 800,
              cursor: "pointer",
            }}
          >
            התאמת עסקאות
          </button>
        </div>
      </div>

      <p style={{ margin: "0 0 16px", color: "#4b5563", fontSize: 14, lineHeight: 1.55 }}>
        ניהול לפי פייפליינים (כמו מודול ההזמנות): טבלת עסקאות לפי פייפליין, הגדרת פייפליינים, והתאמת לקוחות לעסקה.
      </p>

      {err ? (
        <div style={{ marginBottom: 14, padding: 12, borderRadius: 10, background: "#fef2f2", color: "#991b1b" }}>{err}</div>
      ) : null}

      {tab === "pipelines" ? <DealsPipelinesTab /> : null}
      {tab === "deals" ? (
        <DealsBoardTab deals={deals} loading={loading} onRefresh={() => void mutate()} />
      ) : null}
      {tab === "match" ? <DealsMatchTab deals={deals} dealsLoading={loading} /> : null}
    </div>
  );
}
