"use client";

import { useState } from "react";
import useSWR from "swr";
import type { OpportunityOrdersGroup, OrderByOpportunityRow } from "@/lib/movingOrders/opportunityOrdersView";
import type { MovingOrderStatus } from "@/lib/movingOrders/types";

type ApiOk = { ok: true; items: OpportunityOrdersGroup[] };
type ApiErr = { ok: false; error?: string };
type ApiResponse = ApiOk | ApiErr;

function statusLabel(s: MovingOrderStatus): string {
  switch (s) {
    case "pending":
      return "ממתינה לביצוע";
    case "dispatched":
      return "נשלחה למובילים";
    case "completed":
      return "בוצעה";
    case "cancelled":
      return "בוטלה";
    case "rejected":
      return "לא אושרה";
    default:
      return s;
  }
}

export default function OrdersByMoversTab() {
  const [openId, setOpenId] = useState<string | null>(null);

  const {
    data: items = [],
    error: swrError,
    isLoading,
  } = useSWR(
    "crm-moving-orders-by-opportunities",
    async (): Promise<OpportunityOrdersGroup[]> => {
      const res = await fetch("/api/moving-orders/by-opportunities", {
        credentials: "include",
        cache: "no-store",
      });
      const j = (await res.json()) as ApiResponse;
      if (!res.ok || !j.ok) throw new Error(!j.ok ? j.error ?? "שגיאה" : "שגיאה");
      return j.items;
    },
    { revalidateOnFocus: true, dedupingInterval: 5000 }
  );

  const loading = isLoading && items.length === 0;
  const err = swrError ? swrError.message : null;

  if (loading) {
    return <div style={{ padding: 24 }}>טוען…</div>;
  }

  if (err) {
    return (
      <div style={{ marginTop: 16, padding: 12, borderRadius: 10, background: "#fef2f2", color: "#991b1b" }}>{err}</div>
    );
  }

  if (items.length === 0) {
    return (
      <div style={{ padding: 20, background: "#fff", borderRadius: 14, border: "1px solid #e5e7eb", marginTop: 8 }}>
        אין לקוחות בפייפליין «לקוחות משלמים».
      </div>
    );
  }

  return (
    <div style={{ display: "grid", gap: 10, marginTop: 16 }}>
      {items.map((row) => (
        <OpportunityAccordion
          key={row.opportunityId}
          row={row}
          expanded={openId === row.opportunityId}
          onToggle={() => setOpenId((cur) => (cur === row.opportunityId ? null : row.opportunityId))}
        />
      ))}
    </div>
  );
}

function OpportunityAccordion({
  row,
  expanded,
  onToggle,
}: {
  row: OpportunityOrdersGroup;
  expanded: boolean;
  onToggle: () => void;
}) {
  const count = row.orders.length;
  const summary =
    count === 0 ? "אין הזמנות משויכות" : count === 1 ? "הזמנה אחת משויכת" : `${count} הזמנות משויכות`;

  return (
    <div
      style={{
        background: "#fff",
        borderRadius: 14,
        border: "1px solid #e5e7eb",
        overflow: "hidden",
      }}
    >
      <button
        type="button"
        onClick={onToggle}
        aria-expanded={expanded}
        aria-controls={`opp-orders-${row.opportunityId}`}
        id={`opp-head-${row.opportunityId}`}
        style={{
          width: "100%",
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          gap: 12,
          padding: "14px 16px",
          border: "none",
          background: expanded ? "#faf5ff" : "#fff",
          cursor: "pointer",
          textAlign: "right",
          fontFamily: "inherit",
        }}
      >
        <span style={{ fontSize: 18, fontWeight: 800, color: "#111827" }}>{row.opportunityName}</span>
        <span style={{ display: "flex", alignItems: "center", gap: 10, flexShrink: 0 }}>
          <span style={{ fontSize: 13, color: "#6b7280", fontWeight: 600 }}>{summary}</span>
          <span style={{ fontSize: 12, color: "#9ca3af" }} aria-hidden>
            {expanded ? "▾" : "▸"}
          </span>
        </span>
      </button>
      {expanded ? (
        <div
          id={`opp-orders-${row.opportunityId}`}
          role="region"
          aria-labelledby={`opp-head-${row.opportunityId}`}
          style={{ borderTop: "1px solid #e5e7eb", padding: "12px 16px 16px", background: "#fafafa" }}
        >
          {row.orders.length === 0 ? (
            <p style={{ margin: 0, color: "#6b7280", fontSize: 14 }}>אין הזמנות שמופיעות בהתאמת הזמנות עבור מוביל זה.</p>
          ) : (
            <ul style={{ margin: 0, padding: 0, listStyle: "none", display: "grid", gap: 8 }}>
              {row.orders.map((o) => (
                <OrderLine key={o.id} o={o} />
              ))}
            </ul>
          )}
        </div>
      ) : null}
    </div>
  );
}

function OrderLine({ o }: { o: OrderByOpportunityRow }) {
  return (
    <li
      style={{
        padding: "10px 12px",
        borderRadius: 10,
        background: "#fff",
        border: "1px solid #e5e7eb",
        display: "grid",
        gap: 4,
      }}
    >
      <span style={{ fontWeight: 700, color: "#1f2937" }}>{o.displayName}</span>
      <span style={{ fontSize: 13, color: "#6b7280" }}>
        {statusLabel(o.status)}
        {o.orderId ? ` · מס׳ ${o.orderId}` : ""}
      </span>
    </li>
  );
}
