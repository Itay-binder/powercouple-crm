"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import useSWR from "swr";
import OrdersBoardTab from "@/app/orders/OrdersBoardTab";
import { MatchOrderCard } from "@/app/orders/MatchOrderCard";
import OrdersPipelinesTab from "@/app/orders/OrdersPipelinesTab";
import OrdersByMoversTab from "@/app/orders/OrdersByMoversTab";
import type {
  DriverSummary,
  MoverMatchEnrichment,
  MovingOrderRecord,
  MovingOrderStatus,
  OrderMatchUiHints,
} from "@/lib/movingOrders/types";

type TabId = "orders" | "pipelines" | "match" | "byMovers";
type ApiListOk = {
  ok: true;
  orders: MovingOrderRecord[];
  drivers: Record<string, DriverSummary>;
  moverEnrichment?: Record<string, MoverMatchEnrichment>;
  orderMatchUi?: Record<string, OrderMatchUiHints>;
};
type ApiListErr = { ok: false; error?: string };
type ApiListResponse = ApiListOk | ApiListErr;

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

export default function OrdersClient() {
  const [tab, setTab] = useState<TabId>("match");
  const [err, setErr] = useState<string | null>(null);
  const [orders, setOrders] = useState<MovingOrderRecord[]>([]);
  const [drivers, setDrivers] = useState<Record<string, DriverSummary>>({});
  const [moverEnrichment, setMoverEnrichment] = useState<Record<string, MoverMatchEnrichment>>({});
  const [orderMatchUi, setOrderMatchUi] = useState<Record<string, OrderMatchUiHints>>({});
  const [dispatching, setDispatching] = useState<string | null>(null);
  const [sentSuccessOrderId, setSentSuccessOrderId] = useState<string | null>(null);
  const [deletingOrderId, setDeletingOrderId] = useState<string | null>(null);
  const [notifyCustomerByOrderId, setNotifyCustomerByOrderId] = useState<Record<string, boolean>>({});
  /** `orderId:driverId` בזמן שליחת ליד בודד */
  const [sendingLeadKey, setSendingLeadKey] = useState<string | null>(null);
  const autoRematchedOnceRef = useRef(false);

  const {
    data: ordersSwrData,
    error: ordersSwrError,
    isLoading: ordersSwrLoading,
    mutate: mutateOrders,
  } = useSWR(
    "crm-moving-orders",
    async (): Promise<ApiListOk> => {
      const res = await fetch("/api/moving-orders", { credentials: "include", cache: "no-store" });
      const j = (await res.json()) as ApiListResponse;
      if (!res.ok || !j.ok) throw new Error(!j.ok ? j.error ?? "שגיאה" : "שגיאה");
      return j;
    },
    { revalidateOnFocus: true, dedupingInterval: 5000 }
  );

  const loading = ordersSwrLoading && !ordersSwrData;

  useEffect(() => {
    if (ordersSwrError) setErr(ordersSwrError.message);
    else setErr(null);
  }, [ordersSwrError]);

  useEffect(() => {
    if (!ordersSwrData) return;
    setOrders(ordersSwrData.orders);
    setDrivers(ordersSwrData.drivers);
    setMoverEnrichment(ordersSwrData.moverEnrichment ?? {});
    setOrderMatchUi(ordersSwrData.orderMatchUi ?? {});
  }, [ordersSwrData]);

  useEffect(() => {
    if (!ordersSwrData) return;
    const needAutoRematch =
      !autoRematchedOnceRef.current &&
      ordersSwrData.orders.some((o) => !o.driverMatchFlags || Object.keys(o.driverMatchFlags).length === 0);
    if (!needAutoRematch) return;
    autoRematchedOnceRef.current = true;
    void (async () => {
      await Promise.all(
        ordersSwrData.orders
          .filter((o) => !o.driverMatchFlags || Object.keys(o.driverMatchFlags).length === 0)
          .map((o) =>
            fetch(`/api/moving-orders/${encodeURIComponent(o.id)}`, {
              method: "PATCH",
              credentials: "include",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({ rematch: true }),
            }).catch(() => null)
          )
      );
      await mutateOrders();
    })();
  }, [ordersSwrData, mutateOrders]);

  const setTabPersist = useCallback((next: TabId) => {
    setTab(next);
  }, []);

  async function setExcluded(orderId: string, leadId: string, checked: boolean) {
    let payload: string[] | undefined;
    setOrders((prev) =>
      prev.map((o) => {
        if (o.id !== orderId) return o;
        const ex = new Set(o.excludedDriverIds);
        const currentlySelected = !ex.has(leadId);
        if (checked === currentlySelected) return o;
        if (checked) ex.delete(leadId);
        else ex.add(leadId);
        payload = [...ex];
        return { ...o, excludedDriverIds: payload };
      })
    );
    if (payload === undefined) return;
    try {
      const res = await fetch(`/api/moving-orders/${encodeURIComponent(orderId)}`, {
        method: "PATCH",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ excludedDriverIds: payload }),
      });
      const j = (await res.json()) as { ok?: boolean; order?: MovingOrderRecord };
      if (res.ok && j.ok && j.order) {
        setOrders((prev) => prev.map((o) => (o.id === orderId ? j.order! : o)));
      }
    } catch {
      void mutateOrders();
    }
  }

  async function sendMatch(order: MovingOrderRecord) {
    const all = [
      ...new Set([...order.matchedDriverIds, ...order.optionalDriverIds, ...order.manualDriverIds]),
    ];
    const driverIds = all.filter((id) => {
      if (order.excludedDriverIds.includes(id)) return false;
      const issues = order.driverMatchIssues?.[id] ?? [];
      if (issues.some((x) => x.includes("זמינות"))) return false;
      return true;
    });
    setDispatching(order.id);
    try {
      const notifyCustomer = notifyCustomerByOrderId[order.id] ?? true;
      const res = await fetch(`/api/moving-orders/${encodeURIComponent(order.id)}/match-send`, {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ driverIds, notifyCustomer }),
      });
      const j = (await res.json()) as { ok?: boolean; order?: MovingOrderRecord; error?: string };
      if (!res.ok || !j.ok) {
        alert(j.error ?? "שליחה נכשלה");
        return;
      }
      if (j.order) {
        setOrders((prev) => prev.map((o) => (o.id === order.id ? j.order! : o)));
      }
      setSentSuccessOrderId(order.id);
      setTimeout(() => setSentSuccessOrderId((cur) => (cur === order.id ? null : cur)), 6000);
      void mutateOrders();
    } catch {
      alert("שגיאת רשת");
    } finally {
      setDispatching(null);
    }
  }

  async function deleteOrder(order: MovingOrderRecord) {
    const cv = order.customValues ?? {};
    const title =
      (typeof cv.moving_order_name === "string" && cv.moving_order_name.trim()
        ? cv.moving_order_name.trim()
        : null) ||
      order.payload.name?.trim() ||
      order.orderId ||
      order.id;
    if (!window.confirm(`למחוק לצמיתות את ההזמנה «${title}»? הפעולה אינה הפיכה.`)) return;
    setDeletingOrderId(order.id);
    try {
      const res = await fetch(`/api/moving-orders/${encodeURIComponent(order.id)}`, {
        method: "DELETE",
        credentials: "include",
      });
      const j = (await res.json()) as { ok?: boolean; error?: string };
      if (!res.ok || !j.ok) {
        alert(j.error ?? "מחיקה נכשלה");
        return;
      }
      void mutateOrders();
    } catch {
      alert("שגיאת רשת");
    } finally {
      setDeletingOrderId(null);
    }
  }

  async function sendLeadToDriver(order: MovingOrderRecord, driverId: string) {
    const key = `${order.id}:${driverId}`;
    setSendingLeadKey(key);
    try {
      const res = await fetch(`/api/moving-orders/${encodeURIComponent(order.id)}/match-send-lead`, {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ driverId }),
      });
      const j = (await res.json()) as { ok?: boolean; error?: string };
      if (!res.ok || !j.ok) {
        alert(j.error ?? "שליחת הליד נכשלה");
        return;
      }
      void mutateOrders();
    } catch {
      alert("שגיאת רשת");
    } finally {
      setSendingLeadKey((cur) => (cur === key ? null : cur));
    }
  }

  async function cancelMatch(order: MovingOrderRecord, reason: string) {
    try {
      const res = await fetch(`/api/moving-orders/${encodeURIComponent(order.id)}/match-cancel`, {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ reason }),
      });
      const j = (await res.json()) as { ok?: boolean; order?: MovingOrderRecord; error?: string };
      if (!res.ok || !j.ok) {
        alert(j.error ?? "ביטול נכשל");
        return;
      }
      if (j.order) {
        setOrders((prev) => prev.map((o) => (o.id === order.id ? j.order! : o)));
      }
    } catch {
      alert("שגיאת רשת");
    }
  }

  const sorted = useMemo(
    () =>
      [...orders].sort((a, b) => {
        const ta = a.createdAt ? new Date(a.createdAt).getTime() : 0;
        const tb = b.createdAt ? new Date(b.createdAt).getTime() : 0;
        return tb - ta;
      }),
    [orders]
  );

  function isChecked(order: MovingOrderRecord, leadId: string): boolean {
    return !order.excludedDriverIds.includes(leadId);
  }

  return (
    <div style={{ width: "100%", maxWidth: "100%", minWidth: 0 }}>
      <div style={{ display: "flex", alignItems: "center", gap: 12, flexWrap: "wrap", marginBottom: 12 }}>
        <h1 style={{ margin: 0, fontSize: 24, fontWeight: 900 }}>ניהול הזמנות</h1>
        <div style={{ display: "inline-flex", background: "#fff", border: "1px solid #e5e7eb", borderRadius: 12, padding: 4 }}>
          <button
            type="button"
            onClick={() => setTabPersist("orders")}
            style={{
              padding: "8px 12px",
              border: "none",
              borderRadius: 8,
              background: tab === "orders" ? "#e9d5ff" : "transparent",
              fontWeight: 800,
              cursor: "pointer",
            }}
          >
            הזמנות
          </button>
          <button
            type="button"
            onClick={() => setTabPersist("pipelines")}
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
            onClick={() => setTabPersist("match")}
            style={{
              padding: "8px 12px",
              border: "none",
              borderRadius: 8,
              background: tab === "match" ? "#e9d5ff" : "transparent",
              fontWeight: 800,
              cursor: "pointer",
            }}
          >
            התאמת הזמנות
          </button>
          <button
            type="button"
            onClick={() => setTabPersist("byMovers")}
            style={{
              padding: "8px 12px",
              border: "none",
              borderRadius: 8,
              background: tab === "byMovers" ? "#e9d5ff" : "transparent",
              fontWeight: 800,
              cursor: "pointer",
            }}
          >
            הזמנות לפי מובילים
          </button>
        </div>
      </div>
      <p style={{ margin: "0 0 16px", color: "#4b5563", fontSize: 14, lineHeight: 1.5 }}>
        קליטה חיצונית דרך{" "}
        <code style={{ background: "#f3f4f6", padding: "2px 6px", borderRadius: 6 }}>/api/ingest/moving-order</code>
        {" או "}
        <code style={{ background: "#f3f4f6", padding: "2px 6px", borderRadius: 6 }}>/api/ingest/order</code>
        {" — מפתח API וכותרת "}
        <code style={{ background: "#f3f4f6", padding: "2px 6px", borderRadius: 6 }}>x-crm-tenant</code>.
      </p>

      {err ? (
        <div style={{ marginTop: 16, padding: 12, borderRadius: 10, background: "#fef2f2", color: "#991b1b" }}>{err}</div>
      ) : null}

      {tab === "pipelines" ? <OrdersPipelinesTab /> : null}
      {tab === "orders" ? <OrdersBoardTab /> : null}
      {tab === "byMovers" ? <OrdersByMoversTab /> : null}

      {tab === "match" ? (
        loading ? (
          <div style={{ padding: 24 }}>טוען…</div>
        ) : (
          <div style={{ display: "grid", gap: 16, marginTop: 22 }}>
            {sorted.length === 0 ? (
              <div style={{ padding: 20, background: "#fff", borderRadius: 14, border: "1px solid #e5e7eb" }}>
                אין הזמנות עדיין.
              </div>
            ) : null}
            {sorted.map((order) => (
              <MatchOrderCard
                key={order.id}
                order={order}
                matchUi={orderMatchUi[order.id] ?? null}
                drivers={drivers}
                enrichment={moverEnrichment}
                dispatching={dispatching === order.id}
                deleting={deletingOrderId === order.id}
                isChecked={(id) => isChecked(order, id)}
                onToggleCheck={(id, c) => void setExcluded(order.id, id, c)}
                onSendMatch={() => void sendMatch(order)}
                onCancelMatch={(reason) => void cancelMatch(order, reason)}
                onDelete={() => void deleteOrder(order)}
                statusLabel={statusLabel}
                sentNow={sentSuccessOrderId === order.id}
                notifyCustomer={notifyCustomerByOrderId[order.id] ?? true}
                onNotifyCustomerChange={(checked) =>
                  setNotifyCustomerByOrderId((prev) => ({ ...prev, [order.id]: checked }))
                }
                sendingLeadDriverId={
                  sendingLeadKey?.startsWith(`${order.id}:`)
                    ? sendingLeadKey.slice(order.id.length + 1)
                    : null
                }
                onConfirmSendLead={(driverId) => void sendLeadToDriver(order, driverId)}
              />
            ))}
          </div>
        )
      ) : null}
    </div>
  );
}
