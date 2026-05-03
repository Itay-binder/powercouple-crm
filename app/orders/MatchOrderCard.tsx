"use client";

import { useEffect, useState, type CSSProperties } from "react";
import { WhatsAppIconLink } from "@/app/components/InlineFieldShell";
import { formatIsraelDateTime } from "@/lib/datetime/formatIsrael";
import { moverExcludedAsInactiveForWork } from "@/lib/movingOrders/matchInactiveWork";
import { resolveOrderMoveKind } from "@/lib/movingOrders/orderMoveKindResolve";
import type {
  DriverSummary,
  MoverMatchEnrichment,
  MovingOrderRecord,
  MovingOrderStatus,
  OrderMatchUiHints,
} from "@/lib/movingOrders/types";

function cardTitle(order: MovingOrderRecord): string {
  const cv = order.customValues ?? {};
  const fromCv = cv.moving_order_name ?? cv.moving_order_items_text;
  if (typeof fromCv === "string" && fromCv.trim()) return fromCv.trim().slice(0, 80);
  const pl = order.payload;
  const parts = [pl.items_text?.trim(), pl.move_type?.trim(), pl.name?.trim()].filter(Boolean);
  if (parts.length) return parts[0] as string;
  return pl.order_id || order.id;
}

function orderDisplayName(order: MovingOrderRecord): string {
  const cv = order.customValues ?? {};
  const n = cv.moving_order_name;
  if (typeof n === "string" && n.trim()) return n.trim();
  return order.payload.name?.trim() || cardTitle(order);
}

function moveDateRaw(order: MovingOrderRecord): string {
  const cv = order.customValues ?? {};
  const d = cv.moving_order_date;
  if (typeof d === "string" && d.trim()) return d.trim();
  if (typeof d === "number" && Number.isFinite(d)) return String(d);
  return order.payload.date?.trim() || "";
}

function moveDateLabel(order: MovingOrderRecord, matchUi: OrderMatchUiHints | null | undefined): string {
  const raw = moveDateRaw(order);
  const base = raw || "—";
  const wd = matchUi?.moveWeekdayHe?.trim();
  if (!wd || base === "—") return wd && base === "—" ? `— · ${wd}` : base;
  if (base.includes(wd)) return base;
  return `${base} · ${wd}`;
}

function moveWhenLabel(order: MovingOrderRecord, matchUi: OrderMatchUiHints | null | undefined): string {
  const cv = order.customValues ?? {};
  const raw = cv.moving_order_moving_timing ?? order.payload.moving_timing;
  if (typeof raw === "string" && raw.trim()) return raw.trim();
  if (typeof raw === "number" && Number.isFinite(raw)) return String(raw);
  return moveDateLabel(order, matchUi);
}

function sortDriverIdsForMatch(order: MovingOrderRecord, ids: string[]): string[] {
  const rank = (id: string) => {
    const f = order.driverMatchFlags?.[id] ?? "ok";
    if (f === "red") return 2;
    if (f === "orange") return 1;
    return 0;
  };
  return [...ids].sort((a, b) => rank(a) - rank(b) || a.localeCompare(b));
}

function allMatchDriverIdsRaw(order: MovingOrderRecord): string[] {
  return sortDriverIdsForMatch(
    order,
    [...new Set([...order.matchedDriverIds, ...order.optionalDriverIds, ...order.manualDriverIds])]
  );
}

/** מובילים לטבלת התאמה — בלי «לא פעיל» בזמינות לעבודה (לא אפשרות שליחה) */
function matchTabVisibleDriverIds(order: MovingOrderRecord): string[] {
  return allMatchDriverIdsRaw(order).filter(
    (id) => !moverExcludedAsInactiveForWork(order.driverMatchIssues?.[id])
  );
}

function matchRowAccent(flag: "ok" | "orange" | "red" | undefined): string {
  if (flag === "red") return "#fecaca";
  if (flag === "orange") return "#fdba74";
  return "transparent";
}

function orderItemsBlock(order: MovingOrderRecord): string {
  const p = order.payload;
  const cv = order.customValues ?? {};
  const chunks: string[] = [];
  const fromCv = cv.moving_order_items_text;
  if (typeof fromCv === "string" && fromCv.trim()) chunks.push(fromCv.trim());
  const txt = p.items_text?.trim();
  if (txt) chunks.push(txt);
  const what = p.what_moving?.trim();
  if (what) chunks.push(what);
  const rawListCv =
    typeof cv.moving_order_items_list === "string" && cv.moving_order_items_list.trim()
      ? cv.moving_order_items_list.trim()
      : "";
  const rawList = (p.items_list?.trim() || rawListCv) || "";
  if (rawList) {
    try {
      const parsed = JSON.parse(rawList) as unknown;
      if (Array.isArray(parsed)) {
        chunks.push(
          parsed
            .map((x) => String(x).trim())
            .filter(Boolean)
            .join("\n")
        );
      } else {
        chunks.push(rawList);
      }
    } catch {
      chunks.push(rawList);
    }
  }
  return [...new Set(chunks)].join("\n\n").trim();
}

function truncateToMaxChars(input: string, maxChars: number): string {
  const t = input.trim();
  if (t.length <= maxChars) return t;
  return `${t.slice(0, Math.max(0, maxChars - 1)).trimEnd()}…`;
}

/** שורה אחת לתצוגה מקוצרת — פריטים / מה מובילים (ללא שבירת שורות ארוכות) */
function orderItemsSummaryOneLine(order: MovingOrderRecord, maxChars: number): string {
  const block = orderItemsBlock(order);
  const t = block.trim();
  if (!t) return "";
  const oneLine = t.replace(/\s*\n\s*/g, " · ").replace(/\s+/g, " ").trim();
  return truncateToMaxChars(oneLine, maxChars);
}

function orderRoomsText(order: MovingOrderRecord): string {
  const cv = order.customValues ?? {};
  const raw = cv.moving_order_rooms ?? cv.apartment_rooms;
  if (raw === undefined || raw === null) return "";
  const rooms = String(raw).trim();
  if (!rooms) return "";
  return `חדרים: ${rooms}`;
}

function orderShortSummary(order: MovingOrderRecord): string {
  const cv = order.customValues ?? {};
  const moveKind = resolveOrderMoveKind(order.payload, cv);
  const moveType = String(cv.moving_order_move_type ?? order.payload.move_type ?? "").trim();
  const parts: string[] = [];
  if (moveType) parts.push(moveType);
  if (moveKind === "small") {
    const itemsLine = orderItemsSummaryOneLine(order, 72);
    if (itemsLine) parts.push(itemsLine);
  } else {
    const rooms = orderRoomsText(order);
    if (rooms) parts.push(rooms);
  }
  return truncateToMaxChars(parts.join(" | "), 100);
}

function flagLabelHe(flag: "ok" | "orange" | "red" | undefined): string {
  if (flag === "red") return "לא מתאים (אדום)";
  if (flag === "orange") return "התאמה חלקית (כתום)";
  return "מתאים (ירוק)";
}

function rowBackground(
  flag: "ok" | "orange" | "red" | undefined,
  issuesLen: number
): string {
  if (flag === "red") return "#fef2f2";
  if (flag === "orange") return "#fffbeb";
  if (issuesLen > 0) return "#fff7ed";
  return "#ffffff";
}

/** רקע כרטיס בלשונית התאמה: אדום לביטול/דחייה, ירוק עדין אחרי שליחה (מלאה או ליד בודד) */
function matchOrderCardShellStyle(order: MovingOrderRecord): { background: string; borderColor: string } {
  const st = order.status;
  if (st === "cancelled" || st === "rejected") {
    return { background: "#fef2f2", borderColor: "#fecaca" };
  }
  const sent = order.sentMatchDriverIds?.length ?? 0;
  if (st === "dispatched" || st === "completed" || sent > 0) {
    return { background: "#f0fdf4", borderColor: "#bbf7d0" };
  }
  return { background: "#ffffff", borderColor: "#e5e7eb" };
}

function hoursCell(en: MoverMatchEnrichment | undefined): string {
  if (!en) return "—";
  const parts = [
    en.flexibleHours?.trim(),
    en.hourStart?.trim() && en.hourEnd?.trim() ? `${en.hourStart}–${en.hourEnd}` : en.hourStart?.trim() || en.hourEnd?.trim(),
  ].filter(Boolean);
  return parts.length ? parts.join(" · ") : "—";
}

type MoverMatchTableProps = {
  order: MovingOrderRecord;
  driverIds: string[];
  /** כשאין שורות אחרי סינון אבל היו מובילים — הודעה חלופית */
  emptyMessage?: string;
  drivers: Record<string, DriverSummary>;
  enrichment: Record<string, MoverMatchEnrichment>;
  canAct: boolean;
  isChecked: (id: string) => boolean;
  onToggleCheck: (id: string, checked: boolean) => void;
  rowLabel: (id: string) => string;
  issueList: (id: string) => string[];
  availabilityBlocked: (id: string) => boolean;
  showOpportunityLinks?: boolean;
  compact?: boolean;
  sendingLeadDriverId: string | null;
  onSendLeadClick: (driverId: string) => void;
};

function MoverMatchTable({
  order,
  driverIds,
  emptyMessage,
  drivers,
  enrichment,
  canAct,
  isChecked,
  onToggleCheck,
  rowLabel,
  issueList,
  availabilityBlocked,
  showOpportunityLinks,
  compact,
  sendingLeadDriverId,
  onSendLeadClick,
}: MoverMatchTableProps) {
  const thStyle: CSSProperties = {
    textAlign: "right",
    padding: "8px 10px",
    fontSize: 11,
    fontWeight: 800,
    color: "#374151",
    borderBottom: "2px solid #e5e7eb",
    background: "#f8fafc",
    whiteSpace: "nowrap",
  };
  const tdStyle: CSSProperties = {
    textAlign: "right",
    padding: "8px 10px",
    fontSize: 12,
    color: "#374151",
    borderBottom: "1px solid #f3f4f6",
    verticalAlign: "top",
    lineHeight: 1.4,
    maxWidth: 220,
    wordBreak: "break-word",
  };

  if (driverIds.length === 0) {
    return (
      <div style={{ color: "#6b7280", fontSize: 14 }}>
        {emptyMessage ?? "אין מובילים מהפייפליין «לקוחות»."}
      </div>
    );
  }

  return (
    <div
      style={{
        width: "100%",
        maxWidth: "100%",
        overflowX: "auto",
        WebkitOverflowScrolling: "touch",
        borderRadius: 10,
        border: "1px solid #e5e7eb",
      }}
    >
      <table
        style={{
          width: "100%",
          minWidth: compact ? 1020 : showOpportunityLinks ? 1360 : 1220,
          borderCollapse: "collapse",
          background: "#fff",
        }}
      >
        <thead>
          <tr>
            <th style={{ ...thStyle, width: 36 }} aria-label="בחירה" />
            <th style={{ ...thStyle, width: 96, whiteSpace: "normal" }}>שליחת ליד</th>
            <th style={thStyle}>מוביל</th>
            <th style={thStyle}>התאמה</th>
            <th style={{ ...thStyle, minWidth: 160, whiteSpace: "normal" }}>הערות התאמה</th>
            <th style={{ ...thStyle, minWidth: 220 }}>הערות מוביל</th>
            <th style={thStyle}>אזורי פעילות</th>
            <th style={thStyle}>זמינות לעבודה</th>
            <th style={thStyle}>ימי פעילות</th>
            <th style={thStyle}>דירות</th>
            <th style={thStyle}>קטן</th>
            <th style={thStyle}>חירום</th>
            <th style={thStyle}>מנוף</th>
            <th style={thStyle}>פניות</th>
            <th style={thStyle}>ליד אחרון שקיבל (תאריך)</th>
            <th style={thStyle}>שעות / גמישות</th>
            <th style={{ ...thStyle, minWidth: 130, whiteSpace: "nowrap" }}>וואטסאפ</th>
            {showOpportunityLinks ? <th style={thStyle}>הזדמנות</th> : null}
          </tr>
        </thead>
        <tbody>
          {driverIds.map((id) => {
            const flag = order.driverMatchFlags?.[id];
            const issues = issueList(id);
            const blocked = availabilityBlocked(id);
            const en = enrichment[id];
            const driverPhone = drivers[id]?.phone?.trim();
            const oppId = en?.opportunityId?.trim();
            const bg = rowBackground(flag, issues.length);
            const accent = matchRowAccent(flag);
            return (
              <tr key={id} style={{ background: bg, borderRight: `4px solid ${accent}` }}>
                <td style={{ ...tdStyle, width: 36 }}>
                  <input
                    type="checkbox"
                    checked={isChecked(id)}
                    disabled={!canAct}
                    onChange={(e) => {
                      e.stopPropagation();
                      onToggleCheck(id, e.target.checked);
                    }}
                    style={{ marginTop: 4 }}
                  />
                </td>
                <td style={{ ...tdStyle, width: 96, verticalAlign: "middle" }}>
                  <button
                    type="button"
                    disabled={!canAct || Boolean(sendingLeadDriverId)}
                    onClick={() => onSendLeadClick(id)}
                    style={{
                      padding: "6px 8px",
                      borderRadius: 8,
                      border: "1px solid #c4b5fd",
                      background: canAct && !sendingLeadDriverId ? "#f5f3ff" : "#f3f4f6",
                      color: "#5b21b6",
                      fontSize: 11,
                      fontWeight: 700,
                      cursor: canAct && !sendingLeadDriverId ? "pointer" : "not-allowed",
                      whiteSpace: "nowrap",
                    }}
                  >
                    {sendingLeadDriverId === id ? "שולח…" : "שלח ליד"}
                  </button>
                </td>
                <td style={{ ...tdStyle, fontWeight: 700 }}>{rowLabel(id)}</td>
                <td style={tdStyle}>{flagLabelHe(flag)}</td>
                <td style={{ ...tdStyle, color: issues.length ? "#9a3412" : "#6b7280", fontSize: 11, whiteSpace: "pre-wrap" }}>
                  {issues.length ? issues.join(" · ") : "—"}
                </td>
                <td style={{ ...tdStyle, fontSize: 11, whiteSpace: "pre-wrap" }}>
                  {en?.opportunityNotes?.trim() || "—"}
                </td>
                <td style={tdStyle}>{en?.regions?.trim() || "—"}</td>
                <td style={tdStyle}>{en?.workAvailability?.trim() || "—"}</td>
                <td style={tdStyle}>{en?.activityDays?.trim() || "—"}</td>
                <td style={tdStyle}>{en?.apartmentMover?.trim() || "—"}</td>
                <td style={tdStyle}>{en?.smallMover?.trim() || "—"}</td>
                <td style={tdStyle}>{en?.sos?.trim() || "—"}</td>
                <td style={tdStyle}>{en?.crane?.trim() || "—"}</td>
                <td style={tdStyle}>{en?.leadCount?.trim() || "—"}</td>
                <td style={{ ...tdStyle, fontSize: 11 }}>
                  {en?.lastLeadAt ? formatIsraelDateTime(en.lastLeadAt) : "—"}
                </td>
                <td style={{ ...tdStyle, fontSize: 11 }}>{hoursCell(en)}</td>
                <td style={{ ...tdStyle, whiteSpace: "nowrap", minWidth: 130, maxWidth: "none", wordBreak: "normal" }}>
                  {driverPhone ? <WhatsAppIconLink phone={driverPhone} size={18} /> : "—"}
                </td>
                {showOpportunityLinks ? (
                  <td style={tdStyle}>
                    {oppId ? (
                      <a
                        href={`/pipeline?openOpportunityId=${encodeURIComponent(oppId)}`}
                        style={{ fontSize: 12, fontWeight: 700, color: "#6d28d9", textDecoration: "underline" }}
                      >
                        פתח
                      </a>
                    ) : (
                      "—"
                    )}
                  </td>
                ) : null}
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

export function MatchOrderCard({
  order,
  matchUi,
  drivers,
  enrichment,
  dispatching,
  isChecked,
  onToggleCheck,
  onSendMatch,
  onCancelMatch,
  onDelete,
  deleting,
  statusLabel,
  sentNow,
  notifyCustomer,
  onNotifyCustomerChange,
  sendingLeadDriverId,
  onConfirmSendLead,
}: {
  order: MovingOrderRecord;
  matchUi?: OrderMatchUiHints | null;
  drivers: Record<string, DriverSummary>;
  enrichment: Record<string, MoverMatchEnrichment>;
  dispatching: boolean;
  deleting?: boolean;
  isChecked: (id: string) => boolean;
  onToggleCheck: (id: string, checked: boolean) => void;
  onSendMatch: () => void;
  onCancelMatch: (reason: string) => void;
  onDelete?: () => void;
  statusLabel: (s: MovingOrderStatus) => string;
  sentNow?: boolean;
  notifyCustomer: boolean;
  onNotifyCustomerChange: (checked: boolean) => void;
  sendingLeadDriverId: string | null;
  onConfirmSendLead: (driverId: string) => void;
}) {
  const [detailOpen, setDetailOpen] = useState(false);
  const [cancelOpen, setCancelOpen] = useState(false);
  const [cancelReason, setCancelReason] = useState("");
  const [sendLeadConfirmId, setSendLeadConfirmId] = useState<string | null>(null);
  const [compact, setCompact] = useState(false);

  useEffect(() => {
    const mq = window.matchMedia("(max-width: 900px)");
    const apply = () => setCompact(mq.matches);
    apply();
    mq.addEventListener("change", apply);
    return () => mq.removeEventListener("change", apply);
  }, []);

  const p = order.payload;
  const driverIdsRaw = allMatchDriverIdsRaw(order);
  const driverIds = matchTabVisibleDriverIds(order);
  const matchTableEmptyMessage =
    driverIds.length === 0 && driverIdsRaw.length > 0
      ? "אין מובילים זמינים לשליחה — כל המובילים מסומנים כלא פעילים בזמינות לעבודה."
      : undefined;
  const canAct = order.status !== "cancelled" && order.status !== "completed" && order.status !== "rejected";
  const createdShort = order.createdAt ? formatIsraelDateTime(order.createdAt) : "—";

  function rowLabel(id: string): string {
    const d = drivers[id];
    const name = d?.name?.trim() || id;
    const phone = d?.phone?.trim();
    return phone ? `${name} · ${phone}` : name;
  }

  function issueList(id: string): string[] {
    return order.driverMatchIssues?.[id] ?? [];
  }

  function availabilityBlocked(id: string): boolean {
    return issueList(id).some((x) => x.includes("זמינות"));
  }

  const shell = matchOrderCardShellStyle(order);

  return (
    <>
      <article
        style={{
          padding: 18,
          maxWidth: "100%",
          overflow: "hidden",
          borderRadius: 16,
          border: `1px solid ${shell.borderColor}`,
          background: shell.background,
          boxShadow: "0 1px 2px rgba(0,0,0,0.04)",
        }}
      >
        <button
          type="button"
          onClick={() => setDetailOpen(true)}
          style={{
            display: "block",
            padding: 0,
            marginBottom: 8,
            border: "none",
            background: "none",
            cursor: "pointer",
            fontWeight: 800,
            fontSize: 18,
            color: "#6d28d9",
            textAlign: "right",
            textDecoration: "underline",
          }}
        >
          {orderDisplayName(order)}
        </button>
        <div style={{ fontSize: 14, color: "#374151", marginBottom: 4 }}>
          <strong>תאריך יצירת ההזמנה:</strong> {createdShort}
        </div>
        <div style={{ fontSize: 14, color: "#374151", marginBottom: 4 }}>
          <strong>למתי ההובלה:</strong> {moveWhenLabel(order, matchUi)}
        </div>
        {orderShortSummary(order) ? (
          <div style={{ fontSize: 13, color: "#374151", marginBottom: 4, lineHeight: 1.45 }}>
            <strong>פירוט הובלה:</strong> {orderShortSummary(order)}
          </div>
        ) : null}
        {matchUi?.transportRegionsLine ? (
          <div style={{ fontSize: 13, color: "#374151", marginBottom: 4, lineHeight: 1.45 }}>
            <strong>אזורי פעילות להובלה:</strong> {matchUi.transportRegionsLine}
          </div>
        ) : null}
        <div style={{ fontSize: 14, color: "#374151", marginBottom: 4 }}>
          <strong>סטטוס:</strong> {statusLabel(order.status)}
          {order.dispatchedAt ? (
            <span style={{ color: "#6b7280", fontWeight: 400 }}>
              {" "}
              · נשלח ב־{formatIsraelDateTime(order.dispatchedAt)}
            </span>
          ) : null}
        </div>
        {sentNow ? (
          <div
            style={{
              margin: "6px 0 10px",
              display: "inline-block",
              background: "#ecfdf5",
              color: "#065f46",
              border: "1px solid #a7f3d0",
              borderRadius: 8,
              padding: "4px 10px",
              fontSize: 12,
              fontWeight: 700,
            }}
          >
            ההזמנה נשלחה בהצלחה
          </div>
        ) : null}

        <label
          style={{
            display: "flex",
            alignItems: "center",
            gap: 8,
            margin: "10px 0 4px",
            fontSize: 14,
            color: "#374151",
            cursor: canAct ? "pointer" : "not-allowed",
            opacity: canAct ? 1 : 0.6,
          }}
        >
          <input
            type="checkbox"
            checked={notifyCustomer}
            disabled={!canAct}
            onChange={(e) => onNotifyCustomerChange(e.target.checked)}
            style={{ width: 18, height: 18, margin: 0 }}
          />
          <span style={{ fontWeight: 600 }}>שלח הודעה למזמין</span>
        </label>

        <div style={{ fontWeight: 700, fontSize: 14, margin: "14px 0 8px" }}>מובילים — בחירה וקריטריוני התאמה</div>
        <MoverMatchTable
          order={order}
          driverIds={driverIds}
          emptyMessage={matchTableEmptyMessage}
          drivers={drivers}
          enrichment={enrichment}
          canAct={canAct}
          isChecked={isChecked}
          onToggleCheck={onToggleCheck}
          rowLabel={rowLabel}
          issueList={issueList}
          availabilityBlocked={availabilityBlocked}
          compact={compact}
          sendingLeadDriverId={sendingLeadDriverId}
          onSendLeadClick={(id) => setSendLeadConfirmId(id)}
        />

        <div style={{ display: "flex", flexWrap: "wrap", gap: 10, marginTop: 12 }}>
          <button
            type="button"
            disabled={!canAct || dispatching}
            onClick={onSendMatch}
            style={{
              padding: "10px 16px",
              borderRadius: 10,
              border: "none",
              background: canAct ? "#059669" : "#9ca3af",
              color: "#fff",
              fontWeight: 700,
              cursor: canAct && !dispatching ? "pointer" : "not-allowed",
            }}
          >
            {dispatching ? "שולח…" : "שלח הזמנה"}
          </button>
          <button
            type="button"
            disabled={!canAct}
            onClick={() => {
              setCancelReason("");
              setCancelOpen(true);
            }}
            style={{
              padding: "10px 16px",
              borderRadius: 10,
              border: "1px solid #fecaca",
              background: "#fff1f2",
              color: "#9f1239",
              fontWeight: 600,
              cursor: canAct ? "pointer" : "not-allowed",
            }}
          >
            בטל הזמנה
          </button>
          {onDelete ? (
            <button
              type="button"
              disabled={Boolean(deleting)}
              onClick={onDelete}
              style={{
                padding: "10px 16px",
                borderRadius: 10,
                border: "1px solid #e5e7eb",
                background: "#f9fafb",
                color: "#374151",
                fontWeight: 600,
                cursor: deleting ? "wait" : "pointer",
                opacity: deleting ? 0.75 : 1,
              }}
            >
              {deleting ? "מוחק…" : "מחק מהמערכת"}
            </button>
          ) : null}
        </div>
      </article>

      {detailOpen ? (
        <div
          role="presentation"
          style={{
            position: "fixed",
            inset: 0,
            background: "rgba(0,0,0,0.35)",
            zIndex: 50,
            display: "flex",
            alignItems: "flex-start",
            justifyContent: "center",
            padding: "24px 12px",
            overflow: "auto",
          }}
          onClick={() => setDetailOpen(false)}
        >
          <div
            role="dialog"
            aria-modal="true"
            style={{
              width: "min(920px, 100%)",
              maxHeight: "90vh",
              overflow: "auto",
              background: "#fff",
              borderRadius: 16,
              padding: 20,
              marginTop: 12,
              boxShadow: "0 20px 40px rgba(0,0,0,0.15)",
            }}
            onClick={(e) => e.stopPropagation()}
          >
            <h2 style={{ margin: "0 0 8px", fontSize: 20 }}>{orderDisplayName(order)}</h2>
            <div style={{ fontSize: 14, color: "#4b5563", lineHeight: 1.6 }}>
              <div><strong>תאריך יצירה:</strong> {createdShort}</div>
              <div><strong>למתי ההובלה:</strong> {moveWhenLabel(order, matchUi)}</div>
            </div>
            <h3 style={{ fontSize: 15, margin: "18px 0 6px" }}>ערים ואזורי פעילות (לפי מפת הערים)</h3>
            <div
              style={{
                fontSize: 14,
                display: "grid",
                gap: 6,
                background: "#f0fdf4",
                padding: 12,
                borderRadius: 10,
                border: "1px solid #bbf7d0",
              }}
            >
              {matchUi?.pickupCity ? (
                <div>
                  <strong>עיר איסוף (מזוהה):</strong> {matchUi.pickupCity}
                </div>
              ) : p.pickup_city ? (
                <div>
                  <strong>עיר איסוף:</strong> {p.pickup_city}
                </div>
              ) : null}
              {matchUi?.dropCity ? (
                <div>
                  <strong>עיר פריקה (מזוהה):</strong> {matchUi.dropCity}
                </div>
              ) : p.dropoff_city ? (
                <div>
                  <strong>עיר פריקה:</strong> {p.dropoff_city}
                </div>
              ) : null}
              {matchUi?.transportRegionsLine ? (
                <div>
                  <strong>אזורי פעילות במפה להובלה זו:</strong> {matchUi.transportRegionsLine}
                </div>
              ) : (
                <div style={{ color: "#6b7280" }}>לא זוהו אזורים — הוזן כתובת חופשית בלבד.</div>
              )}
            </div>
            <h3 style={{ fontSize: 15, margin: "18px 0 6px" }}>מה מובילים (רשימת פריטים / תכולה)</h3>
            <div
              style={{
                fontSize: 14,
                whiteSpace: "pre-wrap",
                lineHeight: 1.55,
                background: "#fafafa",
                padding: 12,
                borderRadius: 10,
                border: "1px solid #e5e7eb",
              }}
            >
              {orderItemsBlock(order) || "—"}
            </div>
            <h3 style={{ fontSize: 15, margin: "18px 0 8px" }}>פרטי הזמנה</h3>
            <div style={{ fontSize: 14, display: "grid", gap: 6, background: "#fafafa", padding: 12, borderRadius: 10 }}>
              {p.pickup ? <div><strong>איסוף:</strong> {p.pickup}</div> : null}
              {p.dropoff ? <div><strong>פריקה:</strong> {p.dropoff}</div> : null}
              {p.move_type ? <div><strong>סוג הובלה:</strong> {p.move_type}</div> : null}
              {p.phone ? <div><strong>טלפון לקוח:</strong> {p.phone}</div> : null}
            </div>
            <label
              style={{
                display: "flex",
                alignItems: "center",
                gap: 8,
                margin: "12px 0 10px",
                fontSize: 14,
                color: "#374151",
                cursor: canAct ? "pointer" : "not-allowed",
                opacity: canAct ? 1 : 0.6,
              }}
            >
              <input
                type="checkbox"
                checked={notifyCustomer}
                disabled={!canAct}
                onChange={(e) => onNotifyCustomerChange(e.target.checked)}
                style={{ width: 18, height: 18, margin: 0 }}
              />
              <span style={{ fontWeight: 600 }}>שלח הודעה למזמין</span>
            </label>
            <h3 style={{ fontSize: 15, margin: "18px 0 8px" }}>מובילים — טבלה ואישור משלוח</h3>
            <p style={{ margin: "0 0 10px", fontSize: 13, color: "#6b7280" }}>
              שורות אדומות/כתומות לפי דגל התאמה; רקע בהיר כשיש הערות התאמה.
            </p>
            <MoverMatchTable
              order={order}
              driverIds={driverIds}
              emptyMessage={matchTableEmptyMessage}
              drivers={drivers}
              enrichment={enrichment}
              canAct={canAct}
              isChecked={isChecked}
              onToggleCheck={onToggleCheck}
              rowLabel={rowLabel}
              issueList={issueList}
              availabilityBlocked={availabilityBlocked}
              showOpportunityLinks
              compact={compact}
              sendingLeadDriverId={sendingLeadDriverId}
              onSendLeadClick={(id) => setSendLeadConfirmId(id)}
            />
            <div style={{ marginTop: 16, textAlign: "left" }}>
              <button
                type="button"
                onClick={() => setDetailOpen(false)}
                style={{ padding: "8px 14px", borderRadius: 8, border: "1px solid #d1d5db", background: "#fff" }}
              >
                סגור
              </button>
            </div>
          </div>
        </div>
      ) : null}

      {sendLeadConfirmId ? (
        <div
          style={{
            position: "fixed",
            inset: 0,
            background: "rgba(0,0,0,0.45)",
            zIndex: 70,
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            padding: 16,
          }}
          role="presentation"
          onClick={() => setSendLeadConfirmId(null)}
        >
          <div
            role="dialog"
            aria-modal="true"
            style={{ background: "#fff", borderRadius: 14, padding: 20, maxWidth: 440, width: "100%" }}
            onClick={(e) => e.stopPropagation()}
          >
            <h3 style={{ margin: "0 0 10px" }}>אישור שליחת ליד</h3>
            <p style={{ margin: "0 0 16px", fontSize: 14, color: "#4b5563", lineHeight: 1.55 }}>
              לשלוח ליד למוביל <strong>{rowLabel(sendLeadConfirmId)}</strong>? יישלח וובהוק עם פרטי מוביל זה בלבד, ושדה{' '}
              <strong>שליחת הודעה למזמין</strong> יסומן כ־<strong>לא</strong>.
            </p>
            <div style={{ display: "flex", gap: 10, justifyContent: "flex-end", flexWrap: "wrap" }}>
              <button
                type="button"
                onClick={() => setSendLeadConfirmId(null)}
                style={{ padding: "8px 14px", borderRadius: 8, border: "1px solid #d1d5db", background: "#fff" }}
              >
                ביטול
              </button>
              <button
                type="button"
                disabled={Boolean(sendingLeadDriverId)}
                onClick={() => {
                  const id = sendLeadConfirmId;
                  if (!id) return;
                  onConfirmSendLead(id);
                  setSendLeadConfirmId(null);
                }}
                style={{
                  padding: "8px 14px",
                  borderRadius: 8,
                  border: "none",
                  background: sendingLeadDriverId ? "#9ca3af" : "#5b21b6",
                  color: "#fff",
                  fontWeight: 700,
                  cursor: sendingLeadDriverId ? "not-allowed" : "pointer",
                }}
              >
                {sendingLeadDriverId ? "שולח…" : "אשר שליחה"}
              </button>
            </div>
          </div>
        </div>
      ) : null}

      {cancelOpen ? (
        <div
          style={{
            position: "fixed",
            inset: 0,
            background: "rgba(0,0,0,0.4)",
            zIndex: 60,
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            padding: 16,
          }}
          role="presentation"
          onClick={() => setCancelOpen(false)}
        >
          <div
            role="dialog"
            style={{ background: "#fff", borderRadius: 14, padding: 20, maxWidth: 420, width: "100%" }}
            onClick={(e) => e.stopPropagation()}
          >
            <h3 style={{ margin: "0 0 12px" }}>ביטול הזמנה</h3>
            <textarea
              value={cancelReason}
              onChange={(e) => setCancelReason(e.target.value)}
              rows={4}
              style={{ width: "100%", padding: 10, borderRadius: 8, border: "1px solid #d1d5db", marginBottom: 12 }}
            />
            <div style={{ display: "flex", gap: 10, justifyContent: "flex-end" }}>
              <button type="button" onClick={() => setCancelOpen(false)} style={{ padding: "8px 14px" }}>סגור</button>
              <button
                type="button"
                onClick={() => {
                  if (!cancelReason.trim()) return;
                  onCancelMatch(cancelReason.trim());
                  setCancelOpen(false);
                  setCancelReason("");
                }}
                style={{ padding: "8px 14px", background: "#be123c", color: "#fff", border: "none", borderRadius: 8 }}
              >
                אשר ביטול
              </button>
            </div>
          </div>
        </div>
      ) : null}
    </>
  );
}
