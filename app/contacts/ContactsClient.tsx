"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import useSWR from "swr";
import { useRouter, useSearchParams } from "next/navigation";
import { formatIsraelDateTime } from "@/lib/datetime/formatIsrael";
import {
  columnIntegrationKind,
  InlineFieldShell,
  WhatsAppIconLink,
} from "@/app/components/InlineFieldShell";
import { TableCellClamp } from "@/app/components/TableCellClamp";

type LeadsOk = {
  ok: true;
  headers: string[];
  count: number;
  rows: Record<string, string>[];
};
type LeadsErr = { ok: false; error: string };

type SortDir = "asc" | "desc";
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
type AdvLogic = "and" | "or";
type FieldKind = "text" | "number" | "date" | "select";
type AdvFilter = { id: string; field: string; op: AdvOp; value: string };
const BASE_COLS = ["contactCode", "name", "phone", "email", "status", "assignedRep", "createdAt"];

function formatContactTableCell(header: string, value: string): string {
  const k = header.trim().toLowerCase();
  if ((k === "createdat" || k === "updatedat") && value.trim()) return formatIsraelDateTime(value);
  return value;
}

function normalize(v: unknown) {
  return String(v ?? "").trim().toLowerCase();
}

function csvEscape(v: unknown): string {
  const s = String(v ?? "");
  if (s.includes(",") || s.includes('"') || s.includes("\n")) {
    return `"${s.replace(/"/g, '""')}"`;
  }
  return s;
}

function parseCsv(text: string): string[][] {
  const lines = text.replace(/\r/g, "").split("\n").filter((l) => l.trim());
  return lines.map((l) => l.split(",").map((x) => x.trim()));
}

const ADV_OPS_BY_KIND: Record<FieldKind, AdvOp[]> = {
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
  dateBefore: "מוקדם יותר מ...",
  dateAfter: "מאוחר יותר מ...",
};

function asDateKey(raw: string): string | null {
  const s = raw.trim();
  if (!s) return null;
  if (/^\d{4}-\d{2}-\d{2}$/.test(s)) return s;
  const t = Date.parse(s);
  if (Number.isNaN(t)) return null;
  return new Date(t).toISOString().slice(0, 10);
}

export type ContactsClientProps = {
  initialAssigneeScope?: "all" | "mine";
  canToggleAssigneeScope?: boolean;
};

export default function ContactsClient({
  initialAssigneeScope = "all",
  canToggleAssigneeScope = false,
}: ContactsClientProps) {
  const searchParams = useSearchParams();
  const [assigneeScope, setAssigneeScope] = useState<"all" | "mine">(initialAssigneeScope);
  const [err, setErr] = useState<string | null>(null);
  const [headers, setHeaders] = useState<string[]>([]);
  const [rows, setRows] = useState<Record<string, string>[]>([]);
  const [count, setCount] = useState(0);
  const [search, setSearch] = useState("");
  const [sortField, setSortField] = useState("createdAt");
  const [sortDir, setSortDir] = useState<SortDir>("desc");

  const [columnFilters, setColumnFilters] = useState<Record<string, string>>({});
  const [contactColWidths, setContactColWidths] = useState<Record<string, number>>({});
  const [editingCell, setEditingCell] = useState<{ id: string; col: string; value: string } | null>(null);

  const [visibleCols, setVisibleCols] = useState<string[]>([]);
  const [columnOrder, setColumnOrder] = useState<string[]>([]);
  const [manageColsOpen, setManageColsOpen] = useState(false);
  const [dragIndex, setDragIndex] = useState<number | null>(null);

  const [advOpen, setAdvOpen] = useState(false);
  const [advLogic, setAdvLogic] = useState<AdvLogic>("and");
  const [advFilters, setAdvFilters] = useState<AdvFilter[]>([]);
  const [draftAdvLogic, setDraftAdvLogic] = useState<AdvLogic>("and");
  const [draftAdvFilters, setDraftAdvFilters] = useState<AdvFilter[]>([]);

  const [createOpen, setCreateOpen] = useState(false);
  const [createName, setCreateName] = useState("");
  const [createPhone, setCreatePhone] = useState("");
  const [createEmail, setCreateEmail] = useState("");
  const [createStatus, setCreateStatus] = useState<"פתוח" | "זכיה" | "הפסד">("פתוח");
  const [createAssignedRep, setCreateAssignedRep] = useState("");
  const [savingCreate, setSavingCreate] = useState(false);

  const [importing, setImporting] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);
  const [importResult, setImportResult] = useState<string | null>(null);

  const [dateFrom, setDateFrom] = useState("");
  const [dateTo, setDateTo] = useState("");
  const router = useRouter();
  const [adminUsers, setAdminUsers] = useState<Array<{ email: string; name?: string }>>([]);

  const query = useMemo(() => {
    const params = new URLSearchParams();
    if (dateFrom.trim()) params.set("date_from", dateFrom.trim());
    if (dateTo.trim()) params.set("date_to", dateTo.trim());
    if (assigneeScope === "mine") params.set("mine", "1");
    const q = params.toString();
    return q ? `?${q}` : "";
  }, [dateFrom, dateTo, assigneeScope]);

  const contactsKey = `/api/contacts${query}`;

  const {
    data: contactsPayload,
    error: contactsSwrError,
    isLoading: contactsLoading,
    mutate: mutateContacts,
  } = useSWR(
    contactsKey,
    async (url: string): Promise<LeadsOk> => {
      const res = await fetch(url, { credentials: "include", cache: "no-store" });
      if (res.status === 401) {
        window.location.href = `/login?returnTo=${encodeURIComponent("/contacts")}`;
        throw new Error("CRM_AUTH_REDIRECT");
      }
      if (res.status === 403) {
        window.location.href = `/pending?returnTo=${encodeURIComponent("/contacts")}`;
        throw new Error("CRM_AUTH_REDIRECT");
      }
      const json = (await res.json().catch(() => ({}))) as LeadsOk | LeadsErr;
      if (!json || json.ok !== true) {
        throw new Error("שגיאה בטעינת contacts");
      }
      return json;
    },
    { revalidateOnFocus: true, dedupingInterval: 5000, keepPreviousData: true }
  );

  const loading = contactsLoading && !contactsPayload;

  useEffect(() => {
    if (contactsSwrError && contactsSwrError.message !== "CRM_AUTH_REDIRECT") {
      setErr(contactsSwrError.message);
    } else {
      setErr(null);
    }
  }, [contactsSwrError]);

  useEffect(() => {
    if (!contactsPayload) return;
    setHeaders(contactsPayload.headers ?? []);
    setRows(contactsPayload.rows ?? []);
    setCount(contactsPayload.count ?? 0);
    setVisibleCols((prev) => {
      if (prev.length) return prev;
      const hs = contactsPayload.headers ?? [];
      const initial = BASE_COLS.filter((c) => hs.includes(c));
      const rest = hs.filter((h) => !initial.includes(h)).slice(0, 3);
      return [...initial, ...rest];
    });
    setColumnOrder((prev) => {
      if (prev.length) return prev;
      const hs = contactsPayload.headers ?? [];
      const initial = BASE_COLS.filter((c) => hs.includes(c));
      const rest = hs.filter((h) => !initial.includes(h));
      return [...initial, ...rest];
    });
  }, [contactsPayload]);

  useEffect(() => {
    const openContactId = searchParams.get("openContactId")?.trim();
    if (!openContactId) return;
    router.replace(`/contacts/${encodeURIComponent(openContactId)}`);
  }, [searchParams, router]);

  useEffect(() => {
    void (async () => {
      try {
        const res = await fetch("/api/admin-users", {
          credentials: "include",
          cache: "no-store",
        });
        const j = (await res.json().catch(() => ({}))) as {
          ok?: boolean;
          users?: Array<{ email: string; name?: string }>;
        };
        if (res.ok && j.ok) setAdminUsers(j.users ?? []);
      } catch {}
    })();
  }, []);

  const adminLabelByEmail = useMemo(() => {
    const map = new Map<string, string>();
    for (const u of adminUsers) {
      map.set(u.email, (u.name?.trim() || u.email).trim());
    }
    return map;
  }, [adminUsers]);

  const fieldKinds = useMemo(() => {
    const out: Record<string, FieldKind> = {};
    for (const h of headers) {
      const key = h.trim().toLowerCase();
      const values = rows
        .map((r) => String(r[h] ?? "").trim())
        .filter(Boolean)
        .slice(0, 80);
      if (key === "status" || key === "assignedrep") {
        out[h] = "select";
        continue;
      }
      if (
        key.includes("createdat") ||
        key.includes("updatedat") ||
        key.includes("lastleadat") ||
        key.endsWith("date")
      ) {
        out[h] = "date";
        continue;
      }
      if (
        values.length > 0 &&
        !key.includes("phone") &&
        values.every((v) => !Number.isNaN(Number(v)))
      ) {
        out[h] = "number";
        continue;
      }
      if (
        values.length > 0 &&
        values.every((v) => asDateKey(v) !== null)
      ) {
        out[h] = "date";
        continue;
      }
      out[h] = "text";
    }
    return out;
  }, [headers, rows]);

  const selectFieldValues = useMemo(() => {
    const out: Record<string, string[]> = {};
    for (const h of headers) {
      if (fieldKinds[h] !== "select") continue;
      const uniq = Array.from(
        new Set(
          rows
            .map((r) => String(r[h] ?? "").trim())
            .filter(Boolean)
        )
      );
      out[h] = uniq.sort((a, b) => a.localeCompare(b, "he"));
    }
    return out;
  }, [headers, rows, fieldKinds]);

  function defaultOpForField(field: string): AdvOp {
    const kind = fieldKinds[field] ?? "text";
    return ADV_OPS_BY_KIND[kind][0] ?? "contains";
  }

  function evaluateAdvFilter(row: Record<string, string>, f: AdvFilter): boolean {
    const raw = String(row[f.field] ?? "");
    const v = raw.trim();
    const val = f.value.trim();
    const vN = normalize(v);
    const cN = normalize(val);
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

  const filteredRows = useMemo(() => {
    const q = normalize(search);
    let out = rows;

    if (q) {
      out = out.filter((r) =>
        headers.some((h) => normalize(r[h]).includes(q))
      );
    }

    out = out.filter((r) => {
      for (const [h, val] of Object.entries(columnFilters)) {
        if (!val?.trim()) continue;
        if (!normalize(r[h]).includes(normalize(val))) return false;
      }
      return true;
    });

    if (advFilters.length) {
      out = out.filter((r) => {
        const checks = advFilters.map((f) => evaluateAdvFilter(r, f));
        return advLogic === "and" ? checks.every(Boolean) : checks.some(Boolean);
      });
    }

    const sf = sortField;
    out = [...out].sort((a, b) => {
      const av = String(a[sf] ?? "");
      const bv = String(b[sf] ?? "");
      const cmp = av.localeCompare(bv, "he", { numeric: true, sensitivity: "base" });
      return sortDir === "asc" ? cmp : -cmp;
    });
    return out;
  }, [rows, headers, search, columnFilters, advFilters, advLogic, sortField, sortDir]);

  const displayHeaders = useMemo(() => {
    const order = columnOrder.length ? columnOrder : headers;
    if (!visibleCols.length) return order;
    return order.filter((h) => visibleCols.includes(h));
  }, [visibleCols, headers, columnOrder]);

  function toggleSort(field: string) {
    if (sortField === field) {
      setSortDir((d) => (d === "asc" ? "desc" : "asc"));
      return;
    }
    setSortField(field);
    setSortDir("asc");
  }

  const CONTACT_INLINE_READONLY = new Set([
    "id",
    "contactCode",
    "createdAt",
    "updatedAt",
    "labelIds",
  ]);

  function contactColDefaultWidth(col: string): number {
    if (col === "phone" || columnIntegrationKind(col) === "phone") return 220;
    return 180;
  }

  function onResizeColumnStart(col: string, startX: number) {
    const base = contactColWidths[col] ?? contactColDefaultWidth(col);
    const onMove = (ev: MouseEvent) => {
      const next = Math.max(120, base + (ev.clientX - startX));
      setContactColWidths((prev) => ({ ...prev, [col]: next }));
    };
    const onUp = () => {
      window.removeEventListener("mousemove", onMove);
      window.removeEventListener("mouseup", onUp);
    };
    window.addEventListener("mousemove", onMove);
    window.addEventListener("mouseup", onUp);
  }

  async function commitInlineEdit(row: Record<string, string>, col: string, valueRaw: string) {
    const id = String(row.id ?? "").trim();
    if (!id || CONTACT_INLINE_READONLY.has(col)) return;
    const value = valueRaw.trim();
    const body: Record<string, unknown> = {};
    if (["name", "email", "phone", "assignedRep"].includes(col)) {
      body[col] = value;
    } else if (col === "status") {
      body.status = value === "זכיה" || value === "הפסד" || value === "פתוח" ? value : "פתוח";
    } else {
      setErr("עריכה מהירה נתמכת כרגע לשדות מערכת. שדות מותאמים לעריכה דרך כרטיס איש קשר.");
      return;
    }
    const res = await fetch(`/api/contacts/${encodeURIComponent(id)}`, {
      method: "PATCH",
      credentials: "include",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
    const j = (await res.json().catch(() => ({}))) as { ok?: boolean; error?: string };
    if (!res.ok || !j.ok) {
      setErr(j.error ?? "עדכון שדה נכשל");
      return;
    }
    setRows((prev) =>
      prev.map((r) => (String(r.id) === id ? { ...r, [col]: String(value) } : r))
    );
  }

  function exportCsv(onlyFiltered: boolean) {
    const rowsToExport = onlyFiltered ? filteredRows : rows;
    const cols = displayHeaders;
    const lines = [
      cols.map(csvEscape).join(","),
      ...rowsToExport.map((r) => cols.map((c) => csvEscape(r[c] ?? "")).join(",")),
    ];
    const blob = new Blob([lines.join("\n")], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `contacts-${onlyFiltered ? "filtered" : "all"}-${new Date()
      .toISOString()
      .slice(0, 10)}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  }

  async function createContact() {
    setSavingCreate(true);
    setErr(null);
    try {
      const res = await fetch("/api/contacts", {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: createName,
          phone: createPhone,
          email: createEmail,
          status: createStatus,
          assignedRep: createAssignedRep,
          source: "manual",
        }),
      });
      const j = (await res.json().catch(() => ({}))) as { ok?: boolean; error?: string };
      if (!res.ok || !j.ok) {
        setErr(j.error ?? "יצירת איש קשר נכשלה");
        return;
      }
      setCreateOpen(false);
      setCreateName("");
      setCreatePhone("");
      setCreateEmail("");
      setCreateStatus("פתוח");
      setCreateAssignedRep("");
      await mutateContacts();
    } catch {
      setErr("יצירת איש קשר נכשלה");
    } finally {
      setSavingCreate(false);
    }
  }

  async function importCsv(file: File) {
    setImporting(true);
    setImportResult(null);
    setErr(null);
    try {
      const text = await file.text();
      const matrix = parseCsv(text);
      if (matrix.length < 2) {
        setErr("CSV חייב להכיל שורת כותרות לפחות ועוד שורה אחת");
        return;
      }
      const csvHeaders = matrix[0];
      const bodyRows = matrix.slice(1).map((r) => {
        const obj: Record<string, string> = {};
        csvHeaders.forEach((h, i) => (obj[h] = r[i] ?? ""));
        return {
          name: obj.name ?? obj["contact name"] ?? obj["full name"] ?? "",
          email: obj.email ?? obj.Email ?? "",
          phone: obj.phone ?? obj.Phone ?? "",
          source: "csv-import",
          customFields: Object.fromEntries(
            Object.entries(obj).filter(([k]) => !["name", "contact name", "full name", "email", "Email", "phone", "Phone"].includes(k))
          ),
        };
      });

      const res = await fetch("/api/contacts/import", {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ rows: bodyRows }),
      });
      const j = (await res.json().catch(() => ({}))) as {
        ok?: boolean;
        error?: string;
        total?: number;
        success?: number;
        failed?: number;
      };
      if (!res.ok || !j.ok) {
        setErr(j.error ?? "ייבוא נכשל");
        return;
      }
      setImportResult(`הייבוא הסתיים: ${j.success ?? 0} הצליחו, ${j.failed ?? 0} נכשלו`);
      await mutateContacts();
    } catch {
      setErr("ייבוא CSV נכשל");
    } finally {
      setImporting(false);
      if (fileRef.current) fileRef.current.value = "";
    }
  }

  function moveColumn(from: number, to: number) {
    if (from === to || from < 0 || to < 0) return;
    setColumnOrder((arr) => {
      if (to >= arr.length) return arr;
      const next = [...arr];
      const [moved] = next.splice(from, 1);
      next.splice(to, 0, moved);
      return next;
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

  return (
    <div style={{ width: "100%", maxWidth: "100%", minWidth: 0 }}>
      <div style={{ display: "flex", alignItems: "center", gap: 12, flexWrap: "wrap" }}>
        <h1 style={{ margin: 0, fontSize: 24, fontWeight: 900 }}>אנשי קשר</h1>
        <span
          style={{
            background: "#e0f2fe",
            color: "#0c4a6e",
            borderRadius: 999,
            padding: "4px 10px",
            fontWeight: 800,
            fontSize: 12,
          }}
        >
          {filteredRows.length} / {count}
        </span>

        {canToggleAssigneeScope ? (
          <div style={{ display: "flex", gap: 6, alignItems: "center", flexWrap: "wrap" }}>
            <span style={{ fontSize: 13, fontWeight: 700, color: "#6b7280" }}>תצוגה:</span>
            <button
              type="button"
              onClick={() => setAssigneeScope("all")}
              style={{
                padding: "6px 12px",
                borderRadius: 10,
                border: assigneeScope === "all" ? "2px solid #6d28d9" : "1px solid #e5e7eb",
                background: assigneeScope === "all" ? "#f5f3ff" : "#fff",
                fontWeight: 700,
                cursor: "pointer",
              }}
            >
              כל הלקוחות
            </button>
            <button
              type="button"
              onClick={() => setAssigneeScope("mine")}
              style={{
                padding: "6px 12px",
                borderRadius: 10,
                border: assigneeScope === "mine" ? "2px solid #6d28d9" : "1px solid #e5e7eb",
                background: assigneeScope === "mine" ? "#f5f3ff" : "#fff",
                fontWeight: 700,
                cursor: "pointer",
              }}
            >
              הלקוחות שלי
            </button>
          </div>
        ) : assigneeScope === "mine" ? (
          <span style={{ fontSize: 12, color: "#6b7280", fontWeight: 600 }}>הלקוחות שלי בלבד</span>
        ) : null}

        <div style={{ flex: 1 }} />

        <button
          type="button"
          onClick={() => setManageColsOpen(true)}
          style={{ padding: "10px 12px", borderRadius: 12, border: "1px solid #e5e7eb", background: "#fff", fontWeight: 700, cursor: "pointer" }}
        >
          ניהול עמודות
        </button>
        <button
          type="button"
          onClick={openAdvancedFilters}
          style={{ padding: "10px 12px", borderRadius: 12, border: "1px solid #e5e7eb", background: "#fff", fontWeight: 700, cursor: "pointer" }}
        >
          פילטר מתקדם
        </button>
        <button
          type="button"
          onClick={() => fileRef.current?.click()}
          disabled={importing}
          style={{ padding: "10px 12px", borderRadius: 12, border: "1px solid #e5e7eb", background: "#fff", fontWeight: 700, cursor: "pointer" }}
        >
          {importing ? "מייבא..." : "ייבוא אנשי קשר"}
        </button>
        <button
          type="button"
          onClick={() => exportCsv(true)}
          style={{ padding: "10px 12px", borderRadius: 12, border: "1px solid #e5e7eb", background: "#fff", fontWeight: 700, cursor: "pointer" }}
        >
          ייצוא CSV (מסונן)
        </button>
        <button
          type="button"
          onClick={() => exportCsv(false)}
          style={{ padding: "10px 12px", borderRadius: 12, border: "1px solid #e5e7eb", background: "#fff", fontWeight: 700, cursor: "pointer" }}
        >
          ייצוא הכל
        </button>
        <button
          type="button"
          onClick={() => setCreateOpen(true)}
          style={{
            padding: "10px 14px",
            borderRadius: 12,
            border: "none",
            background: "linear-gradient(180deg, #a78bfa 0%, #6d28d9 100%)",
            color: "#fff",
            fontWeight: 800,
            cursor: "pointer",
          }}
        >
          יצירת איש קשר
        </button>

        <input
          ref={fileRef}
          type="file"
          accept=".csv,text/csv"
          hidden
          onChange={(e) => {
            const f = e.target.files?.[0];
            if (f) void importCsv(f);
          }}
        />
      </div>

      <div style={{ display: "flex", alignItems: "flex-end", gap: 12, flexWrap: "wrap", marginTop: 12 }}>
        <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
          <label style={{ fontSize: 12, fontWeight: 800, color: "#6b7280" }}>מתאריך</label>
          <input
            type="date"
            value={dateFrom}
            onChange={(e) => setDateFrom(e.target.value)}
            style={{ padding: "10px 12px", borderRadius: 12, border: "1px solid #e5e7eb" }}
          />
        </div>
        <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
          <label style={{ fontSize: 12, fontWeight: 800, color: "#6b7280" }}>עד תאריך</label>
          <input
            type="date"
            value={dateTo}
            onChange={(e) => setDateTo(e.target.value)}
            style={{ padding: "10px 12px", borderRadius: 12, border: "1px solid #e5e7eb" }}
          />
        </div>
        <div style={{ display: "flex", flexDirection: "column", gap: 6, minWidth: 300 }}>
          <label style={{ fontSize: 12, fontWeight: 800, color: "#6b7280" }}>חיפוש אנשי קשר</label>
          <input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="חיפוש לפי כל שדה..."
            style={{ padding: "10px 12px", borderRadius: 12, border: "1px solid #e5e7eb" }}
          />
        </div>

        <div style={{ flex: 1 }} />

        <div style={{ fontSize: 14, fontWeight: 800, color: "#6b7280" }}>
          {loading ? "טוען…" : `${filteredRows.length} רשומות מוצגות`}
        </div>
      </div>

      <div
        style={{
          marginTop: 14,
          background: "#fff",
          border: "1px solid #e5e7eb",
          borderRadius: 16,
          overflow: "hidden",
          width: "100%",
          maxWidth: "100%",
        }}
      >
        <div style={{ padding: 14, borderBottom: "1px solid #f3f4f6" }}>
          <div style={{ fontWeight: 900, fontSize: 18 }}>טבלת אנשי קשר</div>
          <div style={{ fontSize: 12, color: "#6b7280", marginTop: 4 }}>
            קליטה וניהול מתוך ה-CRM (Firestore). אפשר למיין, לסנן, להסתיר/להציג עמודות, לייבא ולייצא.
          </div>
        </div>

        {err && (
          <div style={{ padding: 14, background: "#fef2f2", borderTop: "1px solid #fecaca", color: "#b91c1c" }}>
            {err}
          </div>
        )}

        {!loading && headers.length > 0 ? (
          <div style={{ overflowX: "auto", overflowY: "auto", maxHeight: 600, maxWidth: "100%" }}>
            <table style={{ minWidth: 980, width: "max-content", borderCollapse: "collapse" }}>
              <thead>
                <tr>
                  {displayHeaders.map((h) => (
                    <th
                      key={h}
                      style={{
                        position: "sticky",
                        top: 0,
                        background: "#f5f3ff",
                        padding: "8px 10px",
                        borderBottom: "2px solid #e9d5ff",
                        textAlign: "right",
                        fontWeight: 900,
                        fontSize: 12,
                        whiteSpace: "nowrap",
                        minWidth: contactColWidths[h] ?? contactColDefaultWidth(h),
                        width: contactColWidths[h] ?? contactColDefaultWidth(h),
                        verticalAlign: "top",
                        zIndex: 2,
                      }}
                    >
                      <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                        <span>{h}</span>
                        <button
                          type="button"
                          onClick={() => toggleSort(h)}
                          style={{ border: "1px solid #e5e7eb", background: "#fff", borderRadius: 6, padding: "0 6px", cursor: "pointer", fontSize: 11, fontWeight: 800 }}
                          title="מיון עולה/יורד"
                        >
                          {sortField === h ? (sortDir === "asc" ? "↑" : "↓") : "↕"}
                        </button>
                      </div>
                      <input
                        value={columnFilters[h] ?? ""}
                        onChange={(e) =>
                          setColumnFilters((f) => ({ ...f, [h]: e.target.value }))
                        }
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
                </tr>
              </thead>
              <tbody>
                {filteredRows.map((row, i) => (
                  <tr key={i}>
                    {displayHeaders.map((h) => (
                      <td
                        key={h}
                        style={{
                          padding: "10px 12px",
                          borderBottom: "1px solid #f3f4f6",
                          verticalAlign: "top",
                          fontSize: 12,
                          minWidth: contactColWidths[h] ?? contactColDefaultWidth(h),
                          width: contactColWidths[h] ?? contactColDefaultWidth(h),
                          maxWidth: contactColWidths[h] ?? contactColDefaultWidth(h),
                          wordBreak: columnIntegrationKind(h) === "phone" ? "normal" : "break-word",
                          whiteSpace: columnIntegrationKind(h) === "phone" ? "nowrap" : undefined,
                        }}
                      >
                        {editingCell?.id === String(row.id) &&
                        editingCell.col === h &&
                        row.id &&
                        !CONTACT_INLINE_READONLY.has(h) &&
                        !(h === "name" && row.id) ? (
                          h === "status" ? (
                            <select
                              autoFocus
                              value={editingCell.value || "פתוח"}
                              onChange={(e) =>
                                setEditingCell((x) => (x ? { ...x, value: e.target.value } : x))
                              }
                              onBlur={() => {
                                void commitInlineEdit(row, h, editingCell.value);
                                setEditingCell(null);
                              }}
                              style={{ width: "100%", padding: "7px 8px", borderRadius: 8, border: "1px solid #e5e7eb" }}
                            >
                              {["פתוח", "זכיה", "הפסד"].map((s) => (
                                <option key={s} value={s}>{s}</option>
                              ))}
                            </select>
                          ) : h === "assignedRep" ? (
                            <select
                              autoFocus
                              value={editingCell.value}
                              onChange={(e) =>
                                setEditingCell((x) => (x ? { ...x, value: e.target.value } : x))
                              }
                              onBlur={() => {
                                void commitInlineEdit(row, h, editingCell.value);
                                setEditingCell(null);
                              }}
                              style={{ width: "100%", padding: "7px 8px", borderRadius: 8, border: "1px solid #e5e7eb" }}
                            >
                              <option value="">לא משויך</option>
                              {adminUsers.map((u) => (
                                <option key={u.email} value={u.email}>{u.name?.trim() || u.email}</option>
                              ))}
                            </select>
                          ) : (
                            <input
                              autoFocus
                              value={editingCell.value}
                              onChange={(e) =>
                                setEditingCell((x) => (x ? { ...x, value: e.target.value } : x))
                              }
                              onBlur={() => {
                                void commitInlineEdit(row, h, editingCell.value);
                                setEditingCell(null);
                              }}
                              onKeyDown={(e) => {
                                if (e.key === "Enter") {
                                  void commitInlineEdit(row, h, editingCell.value);
                                  setEditingCell(null);
                                }
                                if (e.key === "Escape") setEditingCell(null);
                              }}
                              style={{ width: "100%", padding: "7px 8px", borderRadius: 8, border: "1px solid #e5e7eb" }}
                            />
                          )
                        ) : (
                          <TableCellClamp noClamp={columnIntegrationKind(h) === "phone"}>
                            {h === "name" && row.id ? (
                              <button
                                type="button"
                                onClick={() => router.push(`/contacts/${encodeURIComponent(String(row.id))}`)}
                                style={{
                                  border: "none",
                                  background: "transparent",
                                  cursor: "pointer",
                                  color: "#4c1d95",
                                  fontWeight: 800,
                                  padding: 0,
                                  textAlign: "right",
                                  width: "100%",
                                }}
                              >
                                {row[h] ?? ""}
                              </button>
                            ) : CONTACT_INLINE_READONLY.has(h) || !row.id ? (
                              <span
                                style={{
                                  display: "block",
                                  wordBreak: columnIntegrationKind(h) === "phone" ? "normal" : "break-word",
                                  whiteSpace: columnIntegrationKind(h) === "phone" ? "nowrap" : undefined,
                                }}
                              >
                                {h === "assignedRep"
                                  ? adminLabelByEmail.get(String(row[h] ?? "").trim()) ?? (row[h] ?? "")
                                  : formatContactTableCell(h, String(row[h] ?? ""))}
                              </span>
                            ) : (
                              <InlineFieldShell
                                integration={columnIntegrationKind(h)}
                                rawValue={String(row[h] ?? "")}
                                label={
                                  h === "assignedRep"
                                    ? adminLabelByEmail.get(String(row[h] ?? "").trim()) ?? (row[h] ?? "")
                                    : formatContactTableCell(h, String(row[h] ?? ""))
                                }
                                onEdit={() =>
                                  setEditingCell({
                                    id: String(row.id),
                                    col: h,
                                    value: String(row[h] ?? ""),
                                  })
                                }
                              />
                            )}
                          </TableCellClamp>
                        )}
                      </td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <div style={{ padding: 16, color: "#6b7280", fontWeight: 700 }}>
            {loading ? "טוען…" : "אין נתונים"}
          </div>
        )}
      </div>

      {importResult && (
        <div style={{ marginTop: 12, padding: 10, borderRadius: 12, background: "#ecfeff", color: "#155e75", border: "1px solid #a5f3fc", fontWeight: 700 }}>
          {importResult}
        </div>
      )}

      {manageColsOpen && (
        <div style={{ position: "fixed", inset: 0, zIndex: 90 }}>
          <div
            style={{ position: "absolute", inset: 0, background: "rgba(0,0,0,0.2)" }}
            onMouseDown={() => setManageColsOpen(false)}
          />
          <div
            style={{
              position: "absolute",
              top: 0,
              right: 0,
              height: "100%",
              width: "min(420px, 94vw)",
              overflow: "auto",
              background: "#fff",
              borderLeft: "1px solid #e5e7eb",
              padding: 16,
              boxShadow: "-12px 0 30px rgba(0,0,0,0.08)",
            }}
            onMouseDown={(e) => e.stopPropagation()}
          >
            <h3 style={{ margin: 0, marginBottom: 10 }}>ניהול עמודות (אנשי קשר)</h3>
            <div style={{ display: "grid", gap: 8 }}>
              {(columnOrder.length ? columnOrder : headers).map((h, i, arr) => {
                const checked = visibleCols.includes(h);
                return (
                  <div
                    key={h}
                    draggable
                    onDragStart={() => setDragIndex(i)}
                    onDragOver={(e) => e.preventDefault()}
                    onDrop={() => {
                      if (dragIndex != null) moveColumn(dragIndex, i);
                      setDragIndex(null);
                    }}
                    style={{
                      display: "grid",
                      gridTemplateColumns: "auto 1fr auto auto",
                      alignItems: "center",
                      gap: 8,
                      padding: "6px 8px",
                      borderRadius: 8,
                      border: "1px solid #f3f4f6",
                    }}
                  >
                    <span title="גרור" style={{ cursor: "grab", opacity: 0.7 }}>
                      ⋮⋮
                    </span>
                    <label style={{ display: "flex", alignItems: "center", gap: 8 }}>
                      <input
                        type="checkbox"
                        checked={checked}
                        onChange={(e) =>
                          setVisibleCols((cols) =>
                            e.target.checked
                              ? Array.from(new Set([...cols, h]))
                              : cols.filter((x) => x !== h)
                          )
                        }
                      />
                      <span>{h}</span>
                    </label>
                    <button
                      type="button"
                      onClick={() => moveColumn(i, i - 1)}
                      disabled={i === 0}
                      style={{
                        border: "1px solid #e5e7eb",
                        background: "#fff",
                        borderRadius: 8,
                        padding: "4px 7px",
                        cursor: i === 0 ? "default" : "pointer",
                        opacity: i === 0 ? 0.5 : 1,
                      }}
                      title="הזז למעלה"
                    >
                      ↑
                    </button>
                    <button
                      type="button"
                      onClick={() => moveColumn(i, i + 1)}
                      disabled={i === arr.length - 1}
                      style={{
                        border: "1px solid #e5e7eb",
                        background: "#fff",
                        borderRadius: 8,
                        padding: "4px 7px",
                        cursor: i === arr.length - 1 ? "default" : "pointer",
                        opacity: i === arr.length - 1 ? 0.5 : 1,
                      }}
                      title="הזז למטה"
                    >
                      ↓
                    </button>
                  </div>
                );
              })}
            </div>
            <div style={{ marginTop: 12, display: "flex", gap: 8 }}>
              <button
                type="button"
                onClick={() => setManageColsOpen(false)}
                style={{ padding: "8px 10px", borderRadius: 10, border: "1px solid #e5e7eb", background: "#fff", cursor: "pointer" }}
              >
                סגור
              </button>
            </div>
          </div>
        </div>
      )}

      {advOpen && (
        <div style={{ position: "fixed", inset: 0, zIndex: 90 }}>
          <div
            style={{ position: "absolute", inset: 0, background: "rgba(0,0,0,0.2)" }}
            onMouseDown={() => setAdvOpen(false)}
          />
          <div
            style={{
              position: "absolute",
              top: 0,
              right: 0,
              height: "100%",
              width: "min(420px, 94vw)",
              overflow: "auto",
              background: "#fff",
              borderLeft: "1px solid #e5e7eb",
              padding: 16,
              boxShadow: "-12px 0 30px rgba(0,0,0,0.08)",
            }}
            onMouseDown={(e) => e.stopPropagation()}
          >
            <h3 style={{ margin: 0, marginBottom: 10 }}>פילטר מתקדם</h3>
            <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 10 }}>
              <span style={{ fontSize: 12, fontWeight: 800, color: "#6b7280" }}>לוגיקה בין התנאים</span>
              <select
                value={draftAdvLogic}
                onChange={(e) => setDraftAdvLogic(e.target.value as AdvLogic)}
                style={{ padding: "8px 10px", borderRadius: 10, border: "1px solid #e5e7eb" }}
              >
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
                        arr.map((x) =>
                          x.id === f.id
                            ? { ...x, field: e.target.value, op: defaultOpForField(e.target.value), value: "" }
                            : x
                        )
                      )
                    }
                    style={{ padding: "8px 10px", borderRadius: 10, border: "1px solid #e5e7eb" }}
                  >
                    {headers.map((h) => (
                      <option key={h} value={h}>
                        {h}
                      </option>
                    ))}
                  </select>
                  <select value={f.op} onChange={(e) => setDraftAdvFilters((arr) => arr.map((x) => (x.id === f.id ? { ...x, op: e.target.value as AdvOp } : x)))} style={{ padding: "8px 10px", borderRadius: 10, border: "1px solid #e5e7eb" }}>
                    {(ADV_OPS_BY_KIND[fieldKinds[f.field] ?? "text"] ?? ADV_OPS_BY_KIND.text).map((op) => (
                      <option key={op} value={op}>
                        {ADV_OP_LABEL[op]}
                      </option>
                    ))}
                  </select>
                  {fieldKinds[f.field] === "select" && (f.op === "equals" || f.op === "notEquals") ? (
                    <select
                      value={f.value}
                      onChange={(e) =>
                        setDraftAdvFilters((arr) => arr.map((x) => (x.id === f.id ? { ...x, value: e.target.value } : x)))
                      }
                      style={{ padding: "8px 10px", borderRadius: 10, border: "1px solid #e5e7eb" }}
                    >
                      <option value="">בחר ערך</option>
                      {(selectFieldValues[f.field] ?? []).map((v) => (
                        <option key={v} value={v}>
                          {v}
                        </option>
                      ))}
                    </select>
                  ) : (
                    <input
                      type={["dateOn", "dateBefore", "dateAfter"].includes(f.op) ? "date" : "text"}
                      value={f.value}
                      onChange={(e) =>
                        setDraftAdvFilters((arr) => arr.map((x) => (x.id === f.id ? { ...x, value: e.target.value } : x)))
                      }
                      disabled={f.op === "isEmpty" || f.op === "notEmpty"}
                      style={{ padding: "8px 10px", borderRadius: 10, border: "1px solid #e5e7eb" }}
                    />
                  )}
                  <button
                    type="button"
                    onClick={() => setDraftAdvFilters((arr) => arr.filter((x) => x.id !== f.id))}
                    style={{ padding: "8px 10px", borderRadius: 10, border: "1px solid #e5e7eb", background: "#fff", cursor: "pointer" }}
                  >
                    מחק
                  </button>
                </div>
              ))}
            </div>
            <div style={{ marginTop: 10, display: "flex", gap: 8 }}>
              <button
                type="button"
                onClick={() =>
                  setDraftAdvFilters((arr) => [
                    ...arr,
                    {
                      id: crypto.randomUUID(),
                      field: headers[0] ?? "name",
                      op: defaultOpForField(headers[0] ?? "name"),
                      value: "",
                    },
                  ])
                }
                style={{ padding: "8px 10px", borderRadius: 10, border: "1px solid #e5e7eb", background: "#fff", cursor: "pointer" }}
              >
                הוסף תנאי
              </button>
              <button
                type="button"
                onClick={() => setDraftAdvFilters([])}
                style={{ padding: "8px 10px", borderRadius: 10, border: "1px solid #e5e7eb", background: "#fff", cursor: "pointer" }}
              >
                נקה הכל
              </button>
              <button
                type="button"
                onClick={() => setAdvOpen(false)}
                style={{ padding: "8px 10px", borderRadius: 10, border: "1px solid #e5e7eb", background: "#fff", cursor: "pointer" }}
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={applyAdvancedFilters}
                style={{ padding: "8px 10px", borderRadius: 10, border: "1px solid #e5e7eb", background: "#fff", cursor: "pointer" }}
              >
                Apply
              </button>
            </div>
          </div>
        </div>
      )}

      {createOpen && (
        <div
          style={{
            position: "fixed",
            inset: 0,
            background: "rgba(0,0,0,0.2)",
            display: "grid",
            placeItems: "center",
            zIndex: 80,
          }}
          onMouseDown={() => setCreateOpen(false)}
        >
          <div
            style={{ width: "min(540px, 94vw)", background: "#fff", borderRadius: 16, border: "1px solid #e5e7eb", padding: 16 }}
            onMouseDown={(e) => e.stopPropagation()}
          >
            <h3 style={{ margin: 0, marginBottom: 10 }}>יצירת איש קשר</h3>
            <div style={{ display: "grid", gap: 8, gridTemplateColumns: "1fr 1fr" }}>
              <input placeholder="שם מלא" value={createName} onChange={(e) => setCreateName(e.target.value)} style={{ padding: "8px 10px", borderRadius: 10, border: "1px solid #e5e7eb" }} />
              <input placeholder="טלפון" value={createPhone} onChange={(e) => setCreatePhone(e.target.value)} style={{ padding: "8px 10px", borderRadius: 10, border: "1px solid #e5e7eb" }} />
              <input placeholder="אימייל" value={createEmail} onChange={(e) => setCreateEmail(e.target.value)} style={{ padding: "8px 10px", borderRadius: 10, border: "1px solid #e5e7eb", gridColumn: "1 / -1" }} />
              <select value={createStatus} onChange={(e) => setCreateStatus(e.target.value as "פתוח" | "זכיה" | "הפסד")} style={{ padding: "8px 10px", borderRadius: 10, border: "1px solid #e5e7eb", gridColumn: "1 / -1" }}>
                {["פתוח", "זכיה", "הפסד"].map((s) => (
                  <option key={s} value={s}>{s}</option>
                ))}
              </select>
              <select value={createAssignedRep} onChange={(e) => setCreateAssignedRep(e.target.value)} style={{ padding: "8px 10px", borderRadius: 10, border: "1px solid #e5e7eb", gridColumn: "1 / -1" }}>
                <option value="">נציג משויך</option>
                {adminUsers.map((u) => (
                  <option key={u.email} value={u.email}>{u.name?.trim() || u.email}</option>
                ))}
              </select>
            </div>
            <div style={{ marginTop: 12, display: "flex", gap: 8 }}>
              <button
                type="button"
                onClick={() => void createContact()}
                disabled={savingCreate}
                style={{
                  padding: "9px 12px",
                  borderRadius: 10,
                  border: "none",
                  background: "linear-gradient(180deg, #a78bfa 0%, #6d28d9 100%)",
                  color: "#fff",
                  fontWeight: 800,
                  cursor: "pointer",
                }}
              >
                {savingCreate ? "שומר..." : "שמור"}
              </button>
              <button
                type="button"
                onClick={() => setCreateOpen(false)}
                style={{ padding: "9px 12px", borderRadius: 10, border: "1px solid #e5e7eb", background: "#fff", cursor: "pointer" }}
              >
                ביטול
              </button>
            </div>
          </div>
        </div>
      )}

    </div>
  );
}

