"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useState, type CSSProperties } from "react";
import { mutate as swrMutate } from "swr";
import { columnIntegrationKind, InlineFieldShell, WhatsAppIconLink } from "@/app/components/InlineFieldShell";
import { TableCellClamp } from "@/app/components/TableCellClamp";
import { formatIsraelDateTime } from "@/lib/datetime/formatIsrael";
import type {
  MovingOrderRecord,
  MovingOrderStatus,
  OrderMatchedOpportunitySummary,
} from "@/lib/movingOrders/types";

type Pipeline = { id: string; name: string; stages: string[] };
type ViewMode = "board" | "list";
type SortDir = "asc" | "desc";
type SortState = { col: string; dir: SortDir } | null;
type EditingCell = { id: string; col: string; value: string };
type AdvLogic = "and" | "or";
type AdvFieldKind = "text" | "number" | "date" | "select";
type AdvOp =
  | "contains"
  | "equals"
  | "startsWith"
  | "endsWith"
  | "notEquals"
  | "isEmpty"
  | "notEmpty"
  | "numEq"
  | "numGt"
  | "numGte"
  | "numLt"
  | "numLte"
  | "dateOn"
  | "dateBefore"
  | "dateAfter";
type AdvFilter = { id: string; field: string; op: AdvOp; value: string };

const ADV_OPS_BY_KIND: Record<AdvFieldKind, AdvOp[]> = {
  text: ["contains", "equals", "startsWith", "endsWith", "notEquals", "isEmpty", "notEmpty"],
  number: ["numEq", "numGt", "numGte", "numLt", "numLte", "isEmpty", "notEmpty"],
  date: ["dateOn", "dateBefore", "dateAfter", "isEmpty", "notEmpty"],
  select: ["equals", "notEquals", "isEmpty", "notEmpty"],
};

const ADV_OP_LABEL: Record<AdvOp, string> = {
  contains: "כולל",
  equals: "שווה בדיוק",
  startsWith: "מתחיל ב...",
  endsWith: "מסתיים ב...",
  notEquals: "שונה מ...",
  isEmpty: "ריק",
  notEmpty: "לא ריק",
  numEq: "שווה ל...",
  numGt: "גדול מ...",
  numGte: "גדול/שווה ל...",
  numLt: "קטן מ...",
  numLte: "קטן/שווה ל...",
  dateOn: "בתאריך",
  dateBefore: "לפני תאריך",
  dateAfter: "מאוחר יותר מ...",
};

/** עמודת מערכת: הזדמנויות מובילים לפי טאב התאמה (לקריאה בלבד) */
const ORDER_MATCHED_OPPS_COL = "matchedOpportunities";

const BASE_ORDER_COLS = [
  "orderId",
  "name",
  "phone",
  "pickup",
  "dropoff",
  "date",
  "pipelineId",
  "stage",
  "status",
  ORDER_MATCHED_OPPS_COL,
  "createdAt",
  "updatedAt",
];

function insertMatchedOpportunitiesAfterStatus(cols: string[]): string[] {
  if (!cols.includes(ORDER_MATCHED_OPPS_COL) || !cols.includes("status")) return cols;
  const rest = cols.filter((c) => c !== ORDER_MATCHED_OPPS_COL);
  const si = rest.indexOf("status");
  if (si < 0) return cols;
  return [...rest.slice(0, si + 1), ORDER_MATCHED_OPPS_COL, ...rest.slice(si + 1)];
}

const OPP_CHIP_STYLE: CSSProperties = {
  display: "inline-block",
  padding: "3px 10px",
  borderRadius: 999,
  background: "#f5f3ff",
  border: "1px solid #e9d5ff",
  fontSize: 12,
  fontWeight: 700,
  color: "#5b21b6",
  maxWidth: "100%",
  wordBreak: "break-word",
  lineHeight: 1.35,
};

function MatchedOpportunitiesCell({
  orderId,
  items,
  onReload,
}: {
  orderId: string;
  items: OrderMatchedOpportunitySummary[];
  onReload: () => void | Promise<void>;
}) {
  const [open, setOpen] = useState(false);
  const [removingContactId, setRemovingContactId] = useState<string | null>(null);

  async function removeChip(opp: OrderMatchedOpportunitySummary) {
    const cid = opp.contactId?.trim();
    if (!cid) return;
    if (
      !window.confirm(
        `להסיר את «${opp.name}» מרשימת ההזדמנות שנשלחו?\n\nההזמנה תוסר גם מלשונית «הזמנות לפי מובילים», ובשדה «מספר פניות (לידים)» של ההזדמנות יופחת 1.`
      )
    ) {
      return;
    }
    setRemovingContactId(cid);
    try {
      const res = await fetch(`/api/moving-orders/${encodeURIComponent(orderId)}`, {
        method: "PATCH",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ removeSentMatchDriverIds: [cid] }),
      });
      const j = (await res.json()) as { ok?: boolean; error?: string };
      if (!res.ok || !j.ok) throw new Error(j.error ?? "הסרה נכשלה");
      await Promise.resolve(onReload());
      void swrMutate("crm-moving-orders-by-opportunities");
      void swrMutate("crm-moving-orders");
    } catch (e) {
      window.alert(e instanceof Error ? e.message : "הסרה נכשלה");
    } finally {
      setRemovingContactId(null);
    }
  }

  if (!items.length) {
    return <span style={{ color: "#9ca3af", fontWeight: 600 }}>—</span>;
  }

  const links = (
    <div style={{ display: "flex", flexWrap: "wrap", gap: 6, justifyContent: "flex-end" }}>
      {items.map((opp) => {
        const cid = opp.contactId?.trim() ?? "";
        const href = opp.linkToContact
          ? `/contacts?openContactId=${encodeURIComponent(opp.id)}`
          : `/pipeline?openOpportunityId=${encodeURIComponent(opp.id)}`;
        return (
          <span
            key={cid || (opp.linkToContact ? `c-${opp.id}` : opp.id)}
            style={{
              display: "inline-flex",
              alignItems: "center",
              gap: 2,
              maxWidth: "100%",
              borderRadius: 999,
              background: "#f5f3ff",
              border: "1px solid #e9d5ff",
              padding: "2px 2px 2px 6px",
              boxSizing: "border-box",
            }}
          >
            <Link
              href={href}
              style={{
                fontSize: 12,
                fontWeight: 700,
                color: "#5b21b6",
                textDecoration: "none",
                wordBreak: "break-word",
                lineHeight: 1.35,
                padding: "2px 4px",
                minWidth: 0,
              }}
              title={opp.linkToContact ? "פתח איש קשר" : "פתח בניהול הזדמנויות"}
              onClick={(e) => e.stopPropagation()}
            >
              {opp.name}
            </Link>
            {cid ? (
              <button
                type="button"
                aria-label={`הסר שליחה ל־${opp.name}`}
                title="הסר מהרשימה"
                disabled={removingContactId === cid}
                onClick={(e) => {
                  e.preventDefault();
                  e.stopPropagation();
                  void removeChip(opp);
                }}
                style={{
                  flexShrink: 0,
                  width: 22,
                  height: 22,
                  border: "none",
                  borderRadius: 999,
                  background: removingContactId === cid ? "#ede9fe" : "transparent",
                  color: "#6d28d9",
                  fontSize: 16,
                  fontWeight: 800,
                  lineHeight: 1,
                  cursor: removingContactId === cid ? "wait" : "pointer",
                  display: "inline-flex",
                  alignItems: "center",
                  justifyContent: "center",
                  padding: 0,
                }}
              >
                ×
              </button>
            ) : null}
          </span>
        );
      })}
    </div>
  );

  if (items.length <= 2) {
    return (
      <div
        style={{
          display: "flex",
          alignItems: "center",
          gap: 8,
          width: "100%",
          minHeight: 34,
          padding: "4px 6px",
          borderRadius: 8,
          border: "2px solid transparent",
          boxSizing: "border-box",
          direction: "rtl",
        }}
      >
        {links}
      </div>
    );
  }

  return (
    <div
      style={{
        width: "100%",
        borderRadius: 8,
        border: "2px solid transparent",
        boxSizing: "border-box",
        direction: "rtl",
      }}
    >
      <button
        type="button"
        onClick={(e) => {
          e.stopPropagation();
          setOpen((v) => !v);
        }}
        style={{
          display: "inline-flex",
          alignItems: "center",
          gap: 6,
          flexWrap: "wrap",
          cursor: "pointer",
          border: "none",
          background: "transparent",
          padding: "6px 4px",
          font: "inherit",
          textAlign: "right",
        }}
      >
        <span
          style={{
            ...OPP_CHIP_STYLE,
            background: "#ede9fe",
            borderColor: "#ddd6fe",
          }}
        >
          {open ? "▴" : "▾"} {items.length} הזדמנויות
        </span>
        <span style={{ color: "#7c3aed", fontSize: 11, fontWeight: 700 }}>הצג שמות</span>
      </button>
      {open ? <div style={{ padding: "4px 4px 8px" }}>{links}</div> : null}
    </div>
  );
}

/** אותו ערך כמו עמודות ה-baseline למעלה — מוצג רק שם, לא כעמודת moving_order_* כפולה */
const MOVING_ORDER_FIELD_IDS_REDUNDANT_WITH_BASE = new Set([
  "moving_order_order_id",
  "moving_order_name",
  "moving_order_phone",
  "moving_order_pickup",
  "moving_order_dropoff",
  "moving_order_date",
]);

function orderTitle(o: MovingOrderRecord): string {
  const cv = o.customValues ?? {};
  const n = cv.moving_order_name ?? cv.moving_order_order_id;
  if (typeof n === "string" && n.trim()) return n.trim();
  return o.payload.name?.trim() || o.payload.order_id || o.id;
}

function orderColDefaultWidth(col: string): number {
  if (
    col === "phone" ||
    col === "moving_order_phone" ||
    columnIntegrationKind(col) === "phone"
  ) {
    return 220;
  }
  return 180;
}

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

export default function OrdersBoardTab() {
  const [pipelines, setPipelines] = useState<Pipeline[]>([]);
  const [selectedPipelineId, setSelectedPipelineId] = useState("");
  const [orders, setOrders] = useState<MovingOrderRecord[]>([]);
  const [orderMatchedOpportunities, setOrderMatchedOpportunities] = useState<
    Record<string, OrderMatchedOpportunitySummary[]>
  >({});
  const [customFieldLabelById, setCustomFieldLabelById] = useState<Record<string, string>>({});
  const [customFieldIds, setCustomFieldIds] = useState<string[]>([]);
  const [viewMode, setViewMode] = useState<ViewMode>("list");
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState<string | null>(null);

  const [orderColumnOrder, setOrderColumnOrder] = useState<string[]>([]);
  const [orderVisibleCols, setOrderVisibleCols] = useState<string[]>([]);
  const [manageColsOpen, setManageColsOpen] = useState(false);
  const [colDragIndex, setColDragIndex] = useState<number | null>(null);
  const [colWidths, setColWidths] = useState<Record<string, number>>({});
  const [sort, setSort] = useState<SortState>(null);
  const [colFilters, setColFilters] = useState<Record<string, string>>({});
  const [advOpen, setAdvOpen] = useState(false);
  const [advLogic, setAdvLogic] = useState<AdvLogic>("and");
  const [advFilters, setAdvFilters] = useState<AdvFilter[]>([]);
  const [draftAdvLogic, setDraftAdvLogic] = useState<AdvLogic>("and");
  const [draftAdvFilters, setDraftAdvFilters] = useState<AdvFilter[]>([]);
  const [editingCell, setEditingCell] = useState<EditingCell | null>(null);
  const [boardPreviewFields, setBoardPreviewFields] = useState<string[]>([]);

  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [createOpen, setCreateOpen] = useState(false);
  const [newName, setNewName] = useState("");
  const [newPhone, setNewPhone] = useState("");
  const [newPickup, setNewPickup] = useState("");
  const [newDropoff, setNewDropoff] = useState("");
  const [newDate, setNewDate] = useState("");
  const [newOrderId, setNewOrderId] = useState("");
  const [newStage, setNewStage] = useState("");

  const selectedPipeline = useMemo(
    () => pipelines.find((p) => p.id === selectedPipelineId) ?? null,
    [pipelines, selectedPipelineId]
  );

  useEffect(() => {
    const saved = typeof window !== "undefined" ? window.sessionStorage.getItem("crm:selectedMovingOrderPipelineId") : null;
    if (saved && !selectedPipelineId) setSelectedPipelineId(saved);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    if (selectedPipelineId) window.sessionStorage.setItem("crm:selectedMovingOrderPipelineId", selectedPipelineId);
  }, [selectedPipelineId]);

  const loadPipelines = useCallback(async () => {
    const res = await fetch("/api/opportunities/pipelines?scope=moving_order", {
      credentials: "include",
      cache: "no-store",
    });
    const j = (await res.json()) as { ok?: boolean; pipelines?: Pipeline[] };
    if (res.ok && j.ok && j.pipelines?.length) {
      setPipelines(j.pipelines);
      setSelectedPipelineId((prev) => (prev && j.pipelines!.some((p) => p.id === prev) ? prev : j.pipelines![0]!.id));
    } else {
      setPipelines([]);
    }
  }, []);

  const loadAll = useCallback(async () => {
    if (!selectedPipelineId) return;
    setLoading(true);
    setErr(null);
    try {
      const u = new URL("/api/moving-orders", window.location.origin);
      u.searchParams.set("pipelineId", selectedPipelineId);
      const [oRes, fRes] = await Promise.all([
        fetch(u.toString(), { credentials: "include", cache: "no-store" }),
        fetch(
          `/api/custom-fields?entityType=moving_order&pipelineId=${encodeURIComponent(selectedPipelineId)}`,
          { credentials: "include", cache: "no-store" }
        ),
      ]);
      const oJson = (await oRes.json()) as {
        ok?: boolean;
        orders?: MovingOrderRecord[];
        orderMatchedOpportunities?: Record<string, OrderMatchedOpportunitySummary[]>;
        error?: string;
      };
      const fJson = (await fRes.json()) as { ok?: boolean; fields?: Array<{ fieldId: string; label?: string }> };
      if (!oRes.ok || !oJson.ok) throw new Error(oJson.error ?? "טעינת הזמנות נכשלה");
      const list = oJson.orders ?? [];
      setOrders(list);
      setOrderMatchedOpportunities(oJson.orderMatchedOpportunities ?? {});

      const labelMap: Record<string, string> = {};
      const fIds: string[] = [];
      if (fRes.ok && fJson.ok && Array.isArray(fJson.fields)) {
        for (const f of fJson.fields) {
          if (!f.fieldId) continue;
          fIds.push(f.fieldId);
          labelMap[f.fieldId] = (f.label?.trim() || f.fieldId).trim();
        }
      }
      setCustomFieldLabelById(labelMap);
      setCustomFieldIds(fIds);

      const fromData = Array.from(new Set(list.flatMap((o) => Object.keys(o.customValues ?? {}))));
      const fIdsNoDup = fIds.filter((id) => !MOVING_ORDER_FIELD_IDS_REDUNDANT_WITH_BASE.has(id));
      const fromDataNoDup = fromData.filter((id) => !MOVING_ORDER_FIELD_IDS_REDUNDANT_WITH_BASE.has(id));
      const allCols = insertMatchedOpportunitiesAfterStatus(
        Array.from(new Set([...BASE_ORDER_COLS, ...fIdsNoDup, ...fromDataNoDup]))
      );
      setOrderColumnOrder((prev) => {
        if (!prev.length) {
          return insertMatchedOpportunitiesAfterStatus([
            ...BASE_ORDER_COLS,
            ...fIdsNoDup,
            ...fromDataNoDup.filter((x) => !BASE_ORDER_COLS.includes(x)),
          ]);
        }
        const next = insertMatchedOpportunitiesAfterStatus(
          [...prev].filter((c) => !MOVING_ORDER_FIELD_IDS_REDUNDANT_WITH_BASE.has(c))
        );
        for (const c of allCols) if (!next.includes(c)) next.push(c);
        return insertMatchedOpportunitiesAfterStatus(next);
      });
      setOrderVisibleCols((prev) => {
        if (!prev.length) return allCols;
        const next = [...prev.filter((c) => !MOVING_ORDER_FIELD_IDS_REDUNDANT_WITH_BASE.has(c))];
        for (const c of allCols) if (!next.includes(c)) next.push(c);
        return insertMatchedOpportunitiesAfterStatus(next);
      });
      setBoardPreviewFields((prev) => {
        if (prev.length) return prev;
        const defaults = ["name", "phone", "stage", "status", "pickup"];
        return defaults.filter((x) => allCols.includes(x)).slice(0, 5);
      });
    } catch (e) {
      setErr(e instanceof Error ? e.message : "שגיאה");
    } finally {
      setLoading(false);
    }
  }, [selectedPipelineId]);

  useEffect(() => {
    void loadPipelines();
  }, [loadPipelines]);

  useEffect(() => {
    void loadAll();
  }, [loadAll]);

  function fieldLabel(col: string): string {
    const labels: Record<string, string> = {
      orderId: "מספר הזמנה",
      name: "שם לקוח",
      phone: "פלאפון",
      pickup: "איסוף",
      dropoff: "פריקה",
      date: "תאריך נסיעה",
      pipelineId: "פייפליין",
      stage: "שלב",
      status: "סטטוס",
      [ORDER_MATCHED_OPPS_COL]: "הזדמנויות (נשלחו)",
      createdAt: "נוצר",
      updatedAt: "עודכן",
    };
    return labels[col] ?? customFieldLabelById[col] ?? col;
  }

  function asDateKey(raw: string): string | null {
    const s = raw.trim();
    if (!s) return null;
    if (/^\d{4}-\d{2}-\d{2}$/.test(s)) return s;
    const t = Date.parse(s);
    if (Number.isNaN(t)) return null;
    return new Date(t).toISOString().slice(0, 10);
  }

  function orderCell(o: MovingOrderRecord, col: string): string {
    const p = o.payload;
    const cv = o.customValues ?? {};
    if (col === ORDER_MATCHED_OPPS_COL) {
      const items = orderMatchedOpportunities[o.id] ?? [];
      return items.map((x) => x.name).join(", ");
    }
    if (col === "orderId") return o.orderId || p.order_id || o.id;
    if (col === "name") return String(p.name ?? cv.moving_order_name ?? "");
    if (col === "phone") return String(p.phone ?? cv.moving_order_phone ?? "");
    if (col === "pickup") return String(p.pickup ?? cv.moving_order_pickup ?? "");
    if (col === "dropoff") return String(p.dropoff ?? cv.moving_order_dropoff ?? "");
    if (col === "date") return String(p.date ?? cv.moving_order_date ?? "");
    if (col === "pipelineId") return pipelines.find((x) => x.id === o.pipelineId)?.name || o.pipelineId;
    if (col === "stage") return String(o.stage ?? "");
    if (col === "status") return String(o.status ?? "");
    if (col === "createdAt") return o.createdAt ? formatIsraelDateTime(o.createdAt) : "";
    if (col === "updatedAt") return o.updatedAt ? formatIsraelDateTime(o.updatedAt) : "";
    return String((o.customValues ?? {})[col] ?? "");
  }

  const displayCols = useMemo(() => {
    const order = orderColumnOrder.length ? orderColumnOrder : BASE_ORDER_COLS;
    const visible = orderVisibleCols.length ? orderVisibleCols : order;
    return order.filter((h) => visible.includes(h));
  }, [orderColumnOrder, orderVisibleCols]);

  const advFieldKinds = useMemo(() => {
    const out: Record<string, AdvFieldKind> = {};
    const sample = orders.slice(0, 120);
    for (const col of displayCols) {
      const key = col.trim().toLowerCase();
      if (key === "status" || key === "stage" || key === "pipelineid") {
        out[col] = "select";
        continue;
      }
      if (key === "createdat" || key === "updatedat" || key === "date") {
        out[col] = "date";
        continue;
      }
      const values = sample.map((o) => orderCell(o, col).trim()).filter(Boolean);
      if (values.length > 0 && values.every((v) => !Number.isNaN(Number(v)))) {
        out[col] = "number";
        continue;
      }
      if (values.length > 0 && values.every((v) => asDateKey(v) !== null)) {
        out[col] = "date";
        continue;
      }
      out[col] = "text";
    }
    return out;
  }, [displayCols, orders, pipelines, orderMatchedOpportunities]);

  const advSelectValues = useMemo(() => {
    const out: Record<string, string[]> = {};
    for (const col of displayCols) {
      if (advFieldKinds[col] !== "select") continue;
      const uniq = Array.from(new Set(orders.map((o) => orderCell(o, col).trim()).filter(Boolean)));
      out[col] = uniq.sort((a, b) => a.localeCompare(b, "he"));
    }
    return out;
  }, [displayCols, advFieldKinds, orders]);

  function defaultOpForField(field: string): AdvOp {
    const kind = advFieldKinds[field] ?? "text";
    return ADV_OPS_BY_KIND[kind][0] ?? "contains";
  }

  function evaluateAdvFilter(o: MovingOrderRecord, f: AdvFilter): boolean {
    let raw = orderCell(o, f.field);
    if (f.field === "status") raw = String(o.status ?? "");
    const v = raw.trim();
    const val = f.value.trim();
    const vN = v.toLowerCase();
    const cN = val.toLowerCase();
    if (f.op === "isEmpty") return v === "";
    if (f.op === "notEmpty") return v !== "";
    if (f.op === "contains") return vN.includes(cN);
    if (f.op === "equals") return vN === cN;
    if (f.op === "startsWith") return vN.startsWith(cN);
    if (f.op === "endsWith") return vN.endsWith(cN);
    if (f.op === "notEquals") return vN !== cN;
    if (["numEq", "numGt", "numGte", "numLt", "numLte"].includes(f.op)) {
      const n1 = Number(v);
      const n2 = Number(val);
      if (Number.isNaN(n1) || Number.isNaN(n2)) return false;
      if (f.op === "numEq") return n1 === n2;
      if (f.op === "numGt") return n1 > n2;
      if (f.op === "numGte") return n1 >= n2;
      if (f.op === "numLt") return n1 < n2;
      if (f.op === "numLte") return n1 <= n2;
    }
    if (["dateOn", "dateBefore", "dateAfter"].includes(f.op)) {
      const d1 = asDateKey(v);
      const d2 = asDateKey(val);
      if (!d1 || !d2) return false;
      if (f.op === "dateOn") return d1 === d2;
      if (f.op === "dateBefore") return d1 < d2;
      if (f.op === "dateAfter") return d1 > d2;
    }
    return true;
  }

  const filteredSortedOrders = useMemo(() => {
    let filtered = orders.filter((o) =>
      displayCols.every((col) => {
        const q = (colFilters[col] ?? "").trim().toLowerCase();
        if (!q) return true;
        return orderCell(o, col).toLowerCase().includes(q);
      })
    );
    if (advFilters.length) {
      filtered = filtered.filter((o) => {
        const checks = advFilters.map((f) => evaluateAdvFilter(o, f));
        return advLogic === "and" ? checks.every(Boolean) : checks.some(Boolean);
      });
    }
    if (!sort) return filtered;
    const sorted = [...filtered];
    sorted.sort((a, b) => {
      const av = orderCell(a, sort.col).toLowerCase();
      const bv = orderCell(b, sort.col).toLowerCase();
      if (av < bv) return sort.dir === "asc" ? -1 : 1;
      if (av > bv) return sort.dir === "asc" ? 1 : -1;
      return 0;
    });
    return sorted;
  }, [orders, displayCols, colFilters, advFilters, advLogic, sort, pipelines, orderMatchedOpportunities]);

  const grouped = useMemo(() => {
    const map: Record<string, MovingOrderRecord[]> = {};
    for (const s of selectedPipeline?.stages ?? []) map[s] = [];
    for (const o of filteredSortedOrders) {
      const key = o.stage || "—";
      map[key] ||= [];
      map[key]!.push(o);
    }
    return map;
  }, [filteredSortedOrders, selectedPipeline?.stages]);

  function toggleSort(col: string) {
    setSort((prev) => {
      if (!prev || prev.col !== col) return { col, dir: "asc" };
      return { col, dir: prev.dir === "asc" ? "desc" : "asc" };
    });
  }

  function openAdvancedFilters() {
    setDraftAdvLogic(advLogic);
    setDraftAdvFilters(advFilters.length ? [...advFilters] : []);
    setAdvOpen(true);
  }

  function applyAdvancedFilters() {
    setAdvLogic(draftAdvLogic);
    setAdvFilters(draftAdvFilters);
    setAdvOpen(false);
  }

  function moveColumn(from: number, to: number) {
    if (from === to || from < 0 || to < 0) return;
    setOrderColumnOrder((arr) => {
      if (to >= arr.length || from >= arr.length) return arr;
      const next = [...arr];
      const [moved] = next.splice(from, 1);
      next.splice(to, 0, moved);
      return next;
    });
  }

  function onResizeColumnStart(col: string, startX: number) {
    const base = colWidths[col] ?? orderColDefaultWidth(col);
    const onMove = (ev: MouseEvent) => {
      const next = Math.max(120, base + (ev.clientX - startX));
      setColWidths((prev) => ({ ...prev, [col]: next }));
    };
    const onUp = () => {
      window.removeEventListener("mousemove", onMove);
      window.removeEventListener("mouseup", onUp);
    };
    window.addEventListener("mousemove", onMove);
    window.addEventListener("mouseup", onUp);
  }

  const INLINE_READONLY = new Set(["orderId", "createdAt", "updatedAt", ORDER_MATCHED_OPPS_COL]);

  async function patchOrderApi(id: string, body: Record<string, unknown>) {
    const res = await fetch(`/api/moving-orders/${encodeURIComponent(id)}`, {
      method: "PATCH",
      credentials: "include",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
    const j = (await res.json()) as { ok?: boolean; order?: MovingOrderRecord; error?: string };
    if (!res.ok || !j.ok || !j.order) throw new Error(j.error ?? "עדכון נכשל");
    return j.order;
  }

  async function commitInlineEdit(o: MovingOrderRecord, col: string, rawValue: string) {
    const value = rawValue.trim();
    if (col === "stage") {
      await patchOrderApi(o.id, { stage: value || o.stage });
    } else if (col === "status") {
      if (["pending", "dispatched", "completed", "cancelled", "rejected"].includes(value)) {
        await patchOrderApi(o.id, { status: value });
      }
    } else if (col === "pipelineId") {
      await patchOrderApi(o.id, { pipelineId: value });
    } else if (["name", "phone", "pickup", "dropoff", "date"].includes(col)) {
      await patchOrderApi(o.id, { payload: { [col]: value } });
    } else {
      await patchOrderApi(o.id, {
        customValues: { ...(o.customValues ?? {}), [col]: value },
      });
    }
    await loadAll();
  }

  function startInlineEdit(o: MovingOrderRecord, col: string) {
    if (INLINE_READONLY.has(col)) return;
    const value = col === "pipelineId" ? o.pipelineId : orderCell(o, col);
    setEditingCell({ id: o.id, col, value });
  }

  async function onDropOrder(oppId: string, stage: string) {
    const o = orders.find((x) => x.id === oppId);
    if (!o || o.stage === stage) return;
    try {
      const updated = await patchOrderApi(o.id, { stage });
      setOrders((prev) => prev.map((x) => (x.id === o.id ? updated : x)));
    } catch {
      void loadAll();
    }
  }

  async function deleteOrder(o: MovingOrderRecord) {
    const title = orderTitle(o);
    if (
      !window.confirm(`למחוק לצמיתות את ההזמנה «${title}»? הפעולה אינה הפיכה.`)
    ) {
      return;
    }
    setDeletingId(o.id);
    setErr(null);
    try {
      const res = await fetch(`/api/moving-orders/${encodeURIComponent(o.id)}`, {
        method: "DELETE",
        credentials: "include",
      });
      const j = (await res.json()) as { ok?: boolean; error?: string };
      if (!res.ok || !j.ok) throw new Error(j.error ?? "מחיקה נכשלה");
      await loadAll();
    } catch (e) {
      setErr(e instanceof Error ? e.message : "מחיקה נכשלה");
    } finally {
      setDeletingId(null);
    }
  }

  async function createOrder() {
    if (!selectedPipelineId || !newStage) return;
    try {
      const res = await fetch("/api/moving-orders", {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          pipelineId: selectedPipelineId,
          stage: newStage,
          name: newName.trim() || undefined,
          phone: newPhone.trim() || undefined,
          pickup: newPickup.trim() || undefined,
          dropoff: newDropoff.trim() || undefined,
          date: newDate.trim() || undefined,
          order_id: newOrderId.trim() || undefined,
        }),
      });
      const j = (await res.json()) as { ok?: boolean; error?: string };
      if (!res.ok || !j.ok) throw new Error(j.error ?? "יצירה נכשלה");
      setCreateOpen(false);
      setNewName("");
      setNewPhone("");
      setNewPickup("");
      setNewDropoff("");
      setNewDate("");
      setNewOrderId("");
      await loadAll();
    } catch (e) {
      setErr(e instanceof Error ? e.message : "יצירה נכשלה");
    }
  }

  useEffect(() => {
    if (createOpen && selectedPipeline?.stages?.length) {
      setNewStage((s) => s || selectedPipeline.stages[0] || "");
    }
  }, [createOpen, selectedPipeline]);

  function boardPreviewCell(o: MovingOrderRecord, f: string) {
    const text = orderCell(o, f) || "—";
    const raw = orderCell(o, f);
    if (columnIntegrationKind(f) === "phone" && raw.trim()) {
      return (
        <span style={{ display: "inline-flex", alignItems: "center", gap: 6, flexWrap: "nowrap", whiteSpace: "nowrap" }}>
          <span style={{ color: "#6b7280" }}>{text}</span>
          <WhatsAppIconLink phone={raw} size={16} />
        </span>
      );
    }
    if (f === "status") {
      return <span style={{ color: "#6b7280", wordBreak: "break-word" }}>{statusLabel(o.status)}</span>;
    }
    if (f === ORDER_MATCHED_OPPS_COL) {
      const opps = orderMatchedOpportunities[o.id] ?? [];
      if (!opps.length) return <span style={{ color: "#9ca3af" }}>—</span>;
      return (
        <span style={{ color: "#6b7280", wordBreak: "break-word" }}>
          {opps.length <= 2
            ? opps.map((x) => x.name).join(", ")
            : `${opps.length} הזדמנויות`}
        </span>
      );
    }
    return <span style={{ color: "#6b7280", wordBreak: "break-word" }}>{text}</span>;
  }

  const columnOrderFull = orderColumnOrder.length
    ? orderColumnOrder
    : [
        ...BASE_ORDER_COLS,
        ...customFieldIds.filter((id) => !MOVING_ORDER_FIELD_IDS_REDUNDANT_WITH_BASE.has(id)),
      ];

  return (
    <div style={{ width: "100%", maxWidth: "100%", minWidth: 0 }}>
      <div style={{ display: "flex", alignItems: "center", gap: 12, flexWrap: "wrap", marginBottom: 12 }}>
        <span style={{ fontWeight: 800, color: "#0c4a6e", background: "#e0f2fe", borderRadius: 999, padding: "4px 10px", fontSize: 12 }}>
          {orders.length} orders
        </span>
        <select
          value={selectedPipelineId}
          onChange={(e) => setSelectedPipelineId(e.target.value)}
          style={{ padding: "10px 12px", borderRadius: 12, border: "1px solid #e5e7eb", minWidth: 220 }}
        >
          {pipelines.map((p) => (
            <option key={p.id} value={p.id}>
              {p.name}
            </option>
          ))}
        </select>
        <div style={{ display: "inline-flex", borderRadius: 10, border: "1px solid #e5e7eb", overflow: "hidden", background: "#fff" }}>
          <button
            type="button"
            onClick={() => setViewMode("board")}
            style={{ border: "none", background: viewMode === "board" ? "#e0f2fe" : "transparent", padding: "8px 10px", cursor: "pointer", fontWeight: 800 }}
            title="תצוגת לוח"
          >
            ◫
          </button>
          <button
            type="button"
            onClick={() => setViewMode("list")}
            style={{ border: "none", background: viewMode === "list" ? "#e0f2fe" : "transparent", padding: "8px 10px", cursor: "pointer", fontWeight: 800 }}
            title="תצוגת רשימה"
          >
            ≣
          </button>
        </div>
        <button
          type="button"
          onClick={() => setCreateOpen(true)}
          style={{
            padding: "10px 12px",
            borderRadius: 12,
            border: "none",
            background: "linear-gradient(180deg, #a78bfa 0%, #6d28d9 100%)",
            color: "#fff",
            cursor: "pointer",
            fontWeight: 800,
          }}
        >
          + הוסף הזמנה
        </button>
        <button
          type="button"
          onClick={() => setManageColsOpen(true)}
          style={{ padding: "10px 12px", borderRadius: 12, border: "1px solid #e5e7eb", background: "#fff", cursor: "pointer", fontWeight: 800 }}
        >
          {viewMode === "board" ? "ניהול שדות" : "ניהול עמודות"}
        </button>
        {viewMode === "list" && (
          <button
            type="button"
            onClick={openAdvancedFilters}
            style={{ padding: "10px 12px", borderRadius: 12, border: "1px solid #e5e7eb", background: "#fff", cursor: "pointer", fontWeight: 800 }}
          >
            פילטר מתקדם
          </button>
        )}
      </div>

      {err ? (
        <div style={{ marginBottom: 12, padding: 12, borderRadius: 10, background: "#fef2f2", color: "#991b1b" }}>{err}</div>
      ) : null}
      {loading && <div style={{ color: "#6b7280", fontWeight: 700, marginBottom: 8 }}>טוען…</div>}

      {viewMode === "list" ? (
        <div
          style={{
            marginTop: 4,
            background: "#fff",
            border: "1px solid #e5e7eb",
            borderRadius: 16,
            width: "100%",
            overflowX: "auto",
          }}
        >
          <table style={{ width: "100%", borderCollapse: "collapse", minWidth: 980 }}>
            <thead>
              <tr>
                {displayCols.map((h) => (
                  <th
                    key={h}
                    style={{
                      textAlign: "right",
                      padding: "8px 10px",
                      borderBottom: "2px solid #e5e7eb",
                      background: "#f8fafc",
                      fontSize: 12,
                      fontWeight: 900,
                      whiteSpace: "nowrap",
                      minWidth: colWidths[h] ?? orderColDefaultWidth(h),
                      width: colWidths[h] ?? orderColDefaultWidth(h),
                      position: "relative",
                      verticalAlign: "top",
                    }}
                  >
                    <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                      <span>{fieldLabel(h)}</span>
                      <button
                        type="button"
                        onClick={() => toggleSort(h)}
                        style={{ border: "1px solid #e5e7eb", background: "#fff", borderRadius: 6, padding: "0 6px", cursor: "pointer", fontSize: 11, fontWeight: 800 }}
                        title="מיון"
                      >
                        {sort?.col === h ? (sort.dir === "asc" ? "↑" : "↓") : "↕"}
                      </button>
                    </div>
                    <input
                      value={colFilters[h] ?? ""}
                      onChange={(e) => setColFilters((prev) => ({ ...prev, [h]: e.target.value }))}
                      placeholder="חיפוש בעמודה..."
                      style={{ marginTop: 6, width: "100%", padding: "6px 8px", borderRadius: 8, border: "1px solid #e5e7eb", fontSize: 11 }}
                    />
                    <div
                      onMouseDown={(e) => {
                        e.preventDefault();
                        onResizeColumnStart(h, e.clientX);
                      }}
                      style={{ position: "absolute", left: 0, top: 0, bottom: 0, width: 8, cursor: "col-resize" }}
                      title="גרור לשינוי רוחב"
                    />
                  </th>
                ))}
                <th
                  style={{
                    textAlign: "right",
                    padding: "8px 10px",
                    borderBottom: "2px solid #e5e7eb",
                    background: "#f8fafc",
                    fontSize: 12,
                    fontWeight: 900,
                    whiteSpace: "nowrap",
                    minWidth: 88,
                    width: 88,
                    verticalAlign: "top",
                  }}
                >
                  פעולות
                </th>
              </tr>
            </thead>
            <tbody>
              {filteredSortedOrders.map((o) => (
                <tr key={o.id}>
                  {displayCols.map((col) => (
                    <td
                      key={col}
                      style={{
                        padding: "10px 12px",
                        borderBottom: "1px solid #f3f4f6",
                        minWidth: colWidths[col] ?? orderColDefaultWidth(col),
                        width: colWidths[col] ?? orderColDefaultWidth(col),
                        whiteSpace: columnIntegrationKind(col) === "phone" ? "nowrap" : undefined,
                      }}
                    >
                      {editingCell?.id === o.id && editingCell.col === col ? (
                        col === "stage" ? (
                          <select
                            autoFocus
                            value={editingCell.value}
                            onChange={(e) => setEditingCell((x) => (x ? { ...x, value: e.target.value } : x))}
                            onBlur={() => {
                              void commitInlineEdit(o, col, editingCell.value);
                              setEditingCell(null);
                            }}
                            style={{ width: "100%", padding: "7px 8px", borderRadius: 8, border: "1px solid #e5e7eb" }}
                          >
                            {(pipelines.find((p) => p.id === o.pipelineId)?.stages ?? selectedPipeline?.stages ?? []).map((s) => (
                              <option key={s} value={s}>
                                {s}
                              </option>
                            ))}
                          </select>
                        ) : col === "status" ? (
                          <select
                            autoFocus
                            value={editingCell.value}
                            onChange={(e) => setEditingCell((x) => (x ? { ...x, value: e.target.value } : x))}
                            onBlur={() => {
                              void commitInlineEdit(o, col, editingCell.value);
                              setEditingCell(null);
                            }}
                            style={{ width: "100%", padding: "7px 8px", borderRadius: 8, border: "1px solid #e5e7eb" }}
                          >
                            {(["pending", "dispatched", "completed", "cancelled", "rejected"] as const).map((s) => (
                              <option key={s} value={s}>
                                {statusLabel(s)}
                              </option>
                            ))}
                          </select>
                        ) : col === "pipelineId" ? (
                          <select
                            autoFocus
                            value={editingCell.value}
                            onChange={(e) => setEditingCell((x) => (x ? { ...x, value: e.target.value } : x))}
                            onBlur={() => {
                              void commitInlineEdit(o, col, editingCell.value);
                              setEditingCell(null);
                            }}
                            style={{ width: "100%", padding: "7px 8px", borderRadius: 8, border: "1px solid #e5e7eb" }}
                          >
                            {pipelines.map((p) => (
                              <option key={p.id} value={p.id}>
                                {p.name}
                              </option>
                            ))}
                          </select>
                        ) : (
                          <input
                            autoFocus
                            value={editingCell.value}
                            onChange={(e) => setEditingCell((x) => (x ? { ...x, value: e.target.value } : x))}
                            onBlur={() => {
                              void commitInlineEdit(o, col, editingCell.value);
                              setEditingCell(null);
                            }}
                            onKeyDown={(e) => {
                              if (e.key === "Enter") {
                                void commitInlineEdit(o, col, editingCell.value);
                                setEditingCell(null);
                              }
                              if (e.key === "Escape") setEditingCell(null);
                            }}
                            style={{ width: "100%", padding: "7px 8px", borderRadius: 8, border: "1px solid #e5e7eb" }}
                          />
                        )
                      ) : (
                        <TableCellClamp noClamp={columnIntegrationKind(col) === "phone"}>
                          {col === ORDER_MATCHED_OPPS_COL ? (
                            <MatchedOpportunitiesCell
                              orderId={o.id}
                              items={orderMatchedOpportunities[o.id] ?? []}
                              onReload={() => void loadAll()}
                            />
                          ) : INLINE_READONLY.has(col) ? (
                            <span style={{ wordBreak: "break-word", color: "#374151" }}>{orderCell(o, col)}</span>
                          ) : col === "phone" && orderCell(o, col).trim() ? (
                            <span style={{ display: "inline-flex", alignItems: "center", gap: 8, flexWrap: "nowrap", whiteSpace: "nowrap" }}>
                              <InlineFieldShell
                                integration="phone"
                                rawValue={orderCell(o, col)}
                                label={orderCell(o, col)}
                                onEdit={() => startInlineEdit(o, col)}
                              />
                            </span>
                          ) : (
                            <InlineFieldShell
                              integration={columnIntegrationKind(col)}
                              rawValue={orderCell(o, col)}
                              label={col === "status" ? statusLabel(o.status) : orderCell(o, col)}
                              onEdit={() => startInlineEdit(o, col)}
                            />
                          )}
                        </TableCellClamp>
                      )}
                    </td>
                  ))}
                  <td
                    style={{
                      padding: "10px 12px",
                      borderBottom: "1px solid #f3f4f6",
                      whiteSpace: "nowrap",
                      verticalAlign: "top",
                    }}
                  >
                    <button
                      type="button"
                      disabled={deletingId === o.id}
                      onClick={() => void deleteOrder(o)}
                      style={{
                        padding: "6px 10px",
                        borderRadius: 8,
                        border: "1px solid #fecaca",
                        background: "#fff1f2",
                        color: "#9f1239",
                        fontWeight: 700,
                        fontSize: 12,
                        cursor: deletingId === o.id ? "wait" : "pointer",
                        opacity: deletingId === o.id ? 0.7 : 1,
                      }}
                    >
                      {deletingId === o.id ? "מוחק…" : "מחק"}
                    </button>
                  </td>
                </tr>
              ))}
              {!loading && filteredSortedOrders.length === 0 && (
                <tr>
                  <td colSpan={Math.max(displayCols.length + 1, 1)} style={{ padding: 16, color: "#6b7280", fontWeight: 700 }}>
                    אין הזמנות בפייפליין הנבחר.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      ) : (
        <div
          style={{
            marginTop: 4,
            background: "#fff",
            border: "1px solid #e5e7eb",
            borderRadius: 16,
            width: "100%",
            padding: 10,
          }}
        >
          <div style={{ overflowX: "auto", paddingBottom: 6 }}>
            <div style={{ display: "flex", gap: 12, minWidth: 980 }}>
              {(selectedPipeline?.stages ?? []).map((stage) => {
                const list = grouped[stage] ?? [];
                return (
                  <div key={stage} style={{ flex: "0 0 360px", minWidth: 360, maxWidth: 360, background: "#fff", border: "1px solid #e5e7eb", borderRadius: 16, padding: 12 }}>
                    <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 10 }}>
                      <div style={{ fontWeight: 900 }}>{stage}</div>
                      <div style={{ background: "#f5f3ff", border: "1px solid #e9d5ff", padding: "4px 8px", borderRadius: 999, fontWeight: 900, color: "#6d28d9" }}>{list.length}</div>
                    </div>
                    <div
                      style={{ marginTop: 10, display: "grid", gap: 8, minHeight: 90 }}
                      onDragOver={(e) => e.preventDefault()}
                      onDrop={(e) => {
                        const id = e.dataTransfer.getData("text/moving-order-id");
                        if (id) void onDropOrder(id, stage);
                      }}
                    >
                      {list.length === 0 ? (
                        <div style={{ color: "#9ca3af", fontWeight: 700, fontSize: 12 }}>אין הזמנות כאן</div>
                      ) : (
                        list.map((o) => (
                          <div
                            key={o.id}
                            draggable
                            onDragStart={(e) => e.dataTransfer.setData("text/moving-order-id", o.id)}
                            style={{ border: "1px solid #f3f4f6", borderRadius: 12, padding: 10, background: "#fafafa", cursor: "grab" }}
                          >
                            <div style={{ fontWeight: 900, fontSize: 13, wordBreak: "break-word" }}>{orderTitle(o)}</div>
                            <div style={{ marginTop: 6, display: "grid", gap: 4 }}>
                              {boardPreviewFields.slice(0, 5).map((f) => (
                                <div key={`${o.id}-${f}`} style={{ fontSize: 12, color: "#4b5563", display: "flex", gap: 6, alignItems: "center", flexWrap: "wrap" }}>
                                  <span style={{ fontWeight: 800 }}>{fieldLabel(f)}:</span>
                                  {boardPreviewCell(o, f)}
                                </div>
                              ))}
                            </div>
                            <label style={{ fontSize: 11, color: "#6b7280", display: "block", marginTop: 8 }}>שלב</label>
                            <select
                              value={o.stage}
                              onChange={(e) => void onDropOrder(o.id, e.target.value)}
                              style={{ width: "100%", padding: 6, borderRadius: 8, border: "1px solid #d1d5db", fontSize: 12, marginTop: 4 }}
                            >
                              {(selectedPipeline?.stages ?? []).map((s) => (
                                <option key={s} value={s}>
                                  {s}
                                </option>
                              ))}
                            </select>
                            <button
                              type="button"
                              onMouseDown={(e) => e.stopPropagation()}
                              onClick={(e) => {
                                e.stopPropagation();
                                void deleteOrder(o);
                              }}
                              disabled={deletingId === o.id}
                              style={{
                                marginTop: 10,
                                width: "100%",
                                padding: "7px 8px",
                                borderRadius: 8,
                                border: "1px solid #fecaca",
                                background: "#fff1f2",
                                color: "#9f1239",
                                fontWeight: 800,
                                fontSize: 12,
                                cursor: deletingId === o.id ? "wait" : "pointer",
                              }}
                            >
                              {deletingId === o.id ? "מוחק…" : "מחק הזמנה"}
                            </button>
                          </div>
                        ))
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        </div>
      )}

      {createOpen && (
        <div style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.2)", display: "grid", placeItems: "center", zIndex: 80 }} onMouseDown={() => setCreateOpen(false)}>
          <div style={{ width: "min(520px, 94vw)", background: "#fff", borderRadius: 16, border: "1px solid #e5e7eb", padding: 16 }} onMouseDown={(e) => e.stopPropagation()}>
            <h3 style={{ margin: "0 0 10px" }}>הזמנה חדשה</h3>
            <div style={{ display: "grid", gap: 8 }}>
              <input value={newName} onChange={(e) => setNewName(e.target.value)} placeholder="שם לקוח" style={{ padding: "10px 12px", borderRadius: 12, border: "1px solid #e5e7eb" }} />
              <input value={newPhone} onChange={(e) => setNewPhone(e.target.value)} placeholder="טלפון" style={{ padding: "10px 12px", borderRadius: 12, border: "1px solid #e5e7eb" }} />
              <input value={newPickup} onChange={(e) => setNewPickup(e.target.value)} placeholder="כתובת איסוף" style={{ padding: "10px 12px", borderRadius: 12, border: "1px solid #e5e7eb" }} />
              <input value={newDropoff} onChange={(e) => setNewDropoff(e.target.value)} placeholder="כתובת פריקה" style={{ padding: "10px 12px", borderRadius: 12, border: "1px solid #e5e7eb" }} />
              <input value={newDate} onChange={(e) => setNewDate(e.target.value)} placeholder="תאריך (YYYY-MM-DD)" style={{ padding: "10px 12px", borderRadius: 12, border: "1px solid #e5e7eb" }} />
              <input value={newOrderId} onChange={(e) => setNewOrderId(e.target.value)} placeholder="מזהה הזמנה (אופציונלי)" style={{ padding: "10px 12px", borderRadius: 12, border: "1px solid #e5e7eb" }} />
              <select value={newStage} onChange={(e) => setNewStage(e.target.value)} style={{ padding: "10px 12px", borderRadius: 12, border: "1px solid #e5e7eb" }}>
                {(selectedPipeline?.stages ?? []).map((s) => (
                  <option key={s} value={s}>
                    {s}
                  </option>
                ))}
              </select>
            </div>
            <div style={{ marginTop: 12, display: "flex", gap: 8 }}>
              <button type="button" onClick={() => void createOrder()} style={{ padding: "10px 12px", borderRadius: 12, border: "none", background: "linear-gradient(180deg, #a78bfa 0%, #6d28d9 100%)", color: "#fff", cursor: "pointer", fontWeight: 800 }}>
                צור
              </button>
              <button type="button" onClick={() => setCreateOpen(false)} style={{ padding: "10px 12px", borderRadius: 12, border: "1px solid #e5e7eb", background: "#fff", cursor: "pointer" }}>
                ביטול
              </button>
            </div>
          </div>
        </div>
      )}

      {manageColsOpen && (
        <div style={{ position: "fixed", inset: 0, zIndex: 90 }}>
          <div style={{ position: "absolute", inset: 0, background: "rgba(0,0,0,0.2)" }} onMouseDown={() => setManageColsOpen(false)} />
          <div style={{ position: "absolute", top: 0, right: 0, height: "100%", width: "min(420px, 94vw)", overflow: "auto", background: "#fff", borderLeft: "1px solid #e5e7eb", padding: 16 }} onMouseDown={(e) => e.stopPropagation()}>
            <h3 style={{ margin: "0 0 10px" }}>{viewMode === "board" ? "ניהול שדות (תצוגת פייפליין)" : "ניהול עמודות (הזמנות)"}</h3>
            {viewMode === "board" ? (
              <div style={{ display: "grid", gap: 8 }}>
                <div style={{ fontSize: 12, color: "#6b7280" }}>עד 5 שדות בכרטיס.</div>
                {columnOrderFull
                  .filter((h) => h !== "orderId")
                  .map((h) => {
                    const selected = boardPreviewFields.includes(h);
                    const maxReached = boardPreviewFields.length >= 5 && !selected;
                    return (
                      <label key={h} style={{ display: "flex", alignItems: "center", gap: 8, border: "1px solid #f3f4f6", borderRadius: 10, padding: "8px 10px", opacity: maxReached ? 0.6 : 1 }}>
                        <input
                          type="checkbox"
                          checked={selected}
                          disabled={maxReached}
                          onChange={(e) =>
                            setBoardPreviewFields((arr) => (e.target.checked ? [...arr, h].slice(0, 5) : arr.filter((x) => x !== h)))
                          }
                        />
                        <span>{fieldLabel(h)}</span>
                      </label>
                    );
                  })}
              </div>
            ) : (
              <div style={{ display: "grid", gap: 8 }}>
                {columnOrderFull.map((h, idx, arr) => (
                  <div
                    key={h}
                    draggable
                    onDragStart={() => setColDragIndex(idx)}
                    onDragOver={(e) => e.preventDefault()}
                    onDrop={() => {
                      if (colDragIndex != null) moveColumn(colDragIndex, idx);
                      setColDragIndex(null);
                    }}
                    style={{ display: "grid", gridTemplateColumns: "auto 1fr auto auto", alignItems: "center", gap: 8, border: "1px solid #f3f4f6", borderRadius: 10, padding: "6px 8px" }}
                  >
                    <span style={{ cursor: "grab", opacity: 0.7 }}>⋮⋮</span>
                    <label style={{ display: "flex", alignItems: "center", gap: 8 }}>
                      <input
                        type="checkbox"
                        checked={orderVisibleCols.includes(h)}
                        onChange={(e) =>
                          setOrderVisibleCols((vis) => (e.target.checked ? Array.from(new Set([...vis, h])) : vis.filter((x) => x !== h)))
                        }
                      />
                      <span>{fieldLabel(h)}</span>
                    </label>
                    <button type="button" onClick={() => moveColumn(idx, idx - 1)} disabled={idx === 0} style={{ border: "1px solid #e5e7eb", background: "#fff", borderRadius: 8, padding: "4px 7px", cursor: idx === 0 ? "default" : "pointer", opacity: idx === 0 ? 0.5 : 1 }}>
                      ↑
                    </button>
                    <button
                      type="button"
                      onClick={() => moveColumn(idx, idx + 1)}
                      disabled={idx === arr.length - 1}
                      style={{ border: "1px solid #e5e7eb", background: "#fff", borderRadius: 8, padding: "4px 7px", cursor: idx === arr.length - 1 ? "default" : "pointer", opacity: idx === arr.length - 1 ? 0.5 : 1 }}
                    >
                      ↓
                    </button>
                  </div>
                ))}
              </div>
            )}
            <div style={{ marginTop: 12 }}>
              <button type="button" onClick={() => setManageColsOpen(false)} style={{ padding: "8px 10px", borderRadius: 10, border: "1px solid #e5e7eb", background: "#fff", cursor: "pointer" }}>
                סגור
              </button>
            </div>
          </div>
        </div>
      )}

      {advOpen && (
        <div style={{ position: "fixed", inset: 0, zIndex: 90 }}>
          <div style={{ position: "absolute", inset: 0, background: "rgba(0,0,0,0.2)" }} onMouseDown={() => setAdvOpen(false)} />
          <div
            style={{
              position: "absolute",
              top: 0,
              right: 0,
              height: "100%",
              width: "min(430px, 94vw)",
              overflow: "auto",
              background: "#fff",
              borderLeft: "1px solid #e5e7eb",
              padding: 16,
              boxShadow: "-12px 0 30px rgba(0,0,0,0.08)",
            }}
            onMouseDown={(e) => e.stopPropagation()}
          >
            <h3 style={{ margin: "0 0 10px" }}>פילטר מתקדם (הזמנות)</h3>
            <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 10 }}>
              <span style={{ fontSize: 12, fontWeight: 800, color: "#6b7280" }}>לוגיקה</span>
              <select value={draftAdvLogic} onChange={(e) => setDraftAdvLogic(e.target.value as AdvLogic)} style={{ padding: "8px 10px", borderRadius: 10, border: "1px solid #e5e7eb" }}>
                <option value="and">וגם (AND)</option>
                <option value="or">או (OR)</option>
              </select>
            </div>
            <div style={{ display: "grid", gap: 8 }}>
              {draftAdvFilters.map((f) => (
                <div key={f.id} style={{ display: "grid", gridTemplateColumns: "1.4fr 1fr 1.4fr auto", gap: 8 }}>
                  <select
                    value={f.field}
                    onChange={(e) =>
                      setDraftAdvFilters((arr) =>
                        arr.map((x) => (x.id === f.id ? { ...x, field: e.target.value, op: defaultOpForField(e.target.value), value: "" } : x))
                      )
                    }
                    style={{ padding: "8px 10px", borderRadius: 10, border: "1px solid #e5e7eb" }}
                  >
                    {displayCols.map((h) => (
                      <option key={h} value={h}>
                        {fieldLabel(h)}
                      </option>
                    ))}
                  </select>
                  <select
                    value={f.op}
                    onChange={(e) => setDraftAdvFilters((arr) => arr.map((x) => (x.id === f.id ? { ...x, op: e.target.value as AdvOp } : x)))}
                    style={{ padding: "8px 10px", borderRadius: 10, border: "1px solid #e5e7eb" }}
                  >
                    {(ADV_OPS_BY_KIND[advFieldKinds[f.field] ?? "text"] ?? ADV_OPS_BY_KIND.text).map((op) => (
                      <option key={op} value={op}>
                        {ADV_OP_LABEL[op]}
                      </option>
                    ))}
                  </select>
                  {advFieldKinds[f.field] === "select" && (f.op === "equals" || f.op === "notEquals") ? (
                    <select
                      value={f.value}
                      onChange={(e) => setDraftAdvFilters((arr) => arr.map((x) => (x.id === f.id ? { ...x, value: e.target.value } : x)))}
                      style={{ padding: "8px 10px", borderRadius: 10, border: "1px solid #e5e7eb" }}
                    >
                      <option value="">בחר ערך</option>
                      {(advSelectValues[f.field] ?? []).map((v) => (
                        <option key={v} value={v}>
                          {f.field === "status" ? statusLabel(v as MovingOrderStatus) : v}
                        </option>
                      ))}
                    </select>
                  ) : (
                    <input
                      type={["dateOn", "dateBefore", "dateAfter"].includes(f.op) ? "date" : "text"}
                      value={f.value}
                      onChange={(e) => setDraftAdvFilters((arr) => arr.map((x) => (x.id === f.id ? { ...x, value: e.target.value } : x)))}
                      disabled={f.op === "isEmpty" || f.op === "notEmpty"}
                      style={{ padding: "8px 10px", borderRadius: 10, border: "1px solid #e5e7eb" }}
                    />
                  )}
                  <button type="button" onClick={() => setDraftAdvFilters((arr) => arr.filter((x) => x.id !== f.id))} style={{ padding: "8px 10px", borderRadius: 10, border: "1px solid #e5e7eb", background: "#fff", cursor: "pointer" }}>
                    מחק
                  </button>
                </div>
              ))}
            </div>
            <div style={{ marginTop: 10, display: "flex", gap: 8, flexWrap: "wrap" }}>
              <button
                type="button"
                onClick={() =>
                  setDraftAdvFilters((arr) => [
                    ...arr,
                    { id: crypto.randomUUID(), field: displayCols[0] ?? "name", op: defaultOpForField(displayCols[0] ?? "name"), value: "" },
                  ])
                }
                style={{ padding: "8px 10px", borderRadius: 10, border: "1px solid #e5e7eb", background: "#fff", cursor: "pointer" }}
              >
                הוסף תנאי
              </button>
              <button type="button" onClick={() => setDraftAdvFilters([])} style={{ padding: "8px 10px", borderRadius: 10, border: "1px solid #e5e7eb", background: "#fff", cursor: "pointer" }}>
                נקה הכל
              </button>
              <button type="button" onClick={() => setAdvOpen(false)} style={{ padding: "8px 10px", borderRadius: 10, border: "1px solid #e5e7eb", background: "#fff", cursor: "pointer" }}>
                ביטול
              </button>
              <button type="button" onClick={applyAdvancedFilters} style={{ padding: "8px 10px", borderRadius: 10, border: "1px solid #e5e7eb", background: "#fff", cursor: "pointer" }}>
                החל
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
