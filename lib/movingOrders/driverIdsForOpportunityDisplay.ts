import type { MovingOrderRecord } from "@/lib/movingOrders/types";

function matchDriverSortRank(order: MovingOrderRecord, driverId: string): number {
  const f = order.driverMatchFlags?.[driverId] ?? "ok";
  if (f === "red") return 2;
  if (f === "orange") return 1;
  return 0;
}

/** סדר תצוגה כמו בטאב התאמה */
function sortedSuggestedDriverIds(order: MovingOrderRecord): string[] {
  const ids = [
    ...new Set([...order.matchedDriverIds, ...order.optionalDriverIds, ...order.manualDriverIds]),
  ];
  return ids.sort(
    (a, b) => matchDriverSortRank(order, a) - matchDriverSortRank(order, b) || a.localeCompare(b)
  );
}

/** מובילים שהיו מסומנים לשליחה (כמו בלקוח לפני POST) — ל־fallback הזמנות ישנות */
function effectiveSelectedDriverIds(order: MovingOrderRecord): string[] {
  const all = [
    ...new Set([...order.matchedDriverIds, ...order.optionalDriverIds, ...order.manualDriverIds]),
  ];
  return all.filter((id) => {
    if (order.excludedDriverIds.includes(id)) return false;
    const issues = order.driverMatchIssues?.[id] ?? [];
    if (issues.some((x) => x.includes("זמינות"))) return false;
    return true;
  });
}

/**
 * מזהי מוביל (איש קשר) שאליהם נשלחה ההזמנה בפועל — כמו עמודת ההזדמנות בטבלת הזמנות.
 * לא כולל מובילים שרק הוצעו בהתאמה ולא נשלחו.
 */
export function driverIdsForOpportunitiesColumn(order: MovingOrderRecord): string[] {
  const sent = order.sentMatchDriverIds ?? [];
  if (sent.length > 0) return sent;
  if (!order.dispatchedAt?.trim()) return [];
  const selected = effectiveSelectedDriverIds(order);
  const rank = new Map(sortedSuggestedDriverIds(order).map((id, i) => [id, i]));
  return [...selected].sort((a, b) => (rank.get(a) ?? 999) - (rank.get(b) ?? 999));
}
