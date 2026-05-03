import { getTenantConfigs } from "@/lib/tenant/config";

/**
 * טננטים שבהם מוצג תפריט "ניהול הזמנות" (הובלות).
 * ברירת מחדל: powercouple-customers. ניתן להרחיב ב-CRM_MOVING_ORDERS_TENANT_IDS (מופריד בפסיק).
 */
export function getMovingOrdersTenantIds(): string[] {
  const raw = process.env.CRM_MOVING_ORDERS_TENANT_IDS?.trim();
  if (raw) {
    const parts = raw
      .split(",")
      .map((s) => s.trim())
      .filter(Boolean);
    if (parts.length) return Array.from(new Set(parts));
  }
  return ["powercouple-customers"];
}

export function isMovingOrdersTenant(tenantId: string | null | undefined): boolean {
  if (!tenantId?.trim()) return false;
  const allowed = new Set(getMovingOrdersTenantIds());
  if (allowed.has(tenantId.trim())) return true;
  const configs = getTenantConfigs();
  const t = configs.find((c) => c.id === tenantId.trim());
  if (!t) return false;
  return allowed.has(t.id);
}
