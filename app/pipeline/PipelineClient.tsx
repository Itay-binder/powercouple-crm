"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import WhatsAppChatPanel from "@/app/components/chat/WhatsAppChatPanel";
import GreenApiChatPanel from "@/app/components/chat/GreenApiChatPanel";
import { useSearchParams } from "next/navigation";
import useSWR from "swr";
import { formatIsraelDateTime } from "@/lib/datetime/formatIsrael";
import {
  naiveLocalInputToStoredIso,
  utcIsoToJerusalemDatetimeLocal,
} from "@/lib/datetime/taskTimestamps";
import { LabelPicker, LabelPills } from "@/app/components/LabelPicker";
import {
  columnIntegrationKind,
  InlineFieldShell,
  WhatsAppIconLink,
} from "@/app/components/InlineFieldShell";
import {
  MOVER_OPPORTUNITY_FIELD_IDS,
  PAYING_CUSTOMERS_PIPELINE_ID,
} from "@/lib/movingOrders/fieldIds";
import { TableCellClamp } from "@/app/components/TableCellClamp";

function pipelineOppColOrderCookieKey(pipelineId: string): string {
  const safe = pipelineId.replace(/[^\w-]/g, "_");
  return `crm_pl_opp_ord_${safe}`;
}

function pipelineOppColVisibleCookieKey(pipelineId: string): string {
  const safe = pipelineId.replace(/[^\w-]/g, "_");
  return `crm_pl_opp_vis_${safe}`;
}

function readPipelineColsCookie<T>(key: string): T | null {
  if (typeof document === "undefined") return null;
  const esc = key.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const m = document.cookie.match(new RegExp(`(?:^|; )${esc}=([^;]*)`));
  if (!m?.[1]) return null;
  try {
    return JSON.parse(decodeURIComponent(m[1])) as T;
  } catch {
    return null;
  }
}

function writePipelineColsCookie(key: string, value: unknown) {
  if (typeof document === "undefined") return;
  const enc = encodeURIComponent(JSON.stringify(value));
  document.cookie = `${key}=${enc}; path=/; max-age=${60 * 60 * 24 * 400}; SameSite=Lax`;
}

function pipelineColPrefsStorageKeys(pipelineId: string) {
  const safe = pipelineId.replace(/[^\w-]/g, "_");
  return {
    order: `crm_pl_v2_opp_ord_${safe}`,
    visible: `crm_pl_v2_opp_vis_${safe}`,
    widths: `crm_pl_v2_opp_w_${safe}`,
  };
}

function readJsonLocalStorage<T>(key: string): T | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = window.localStorage.getItem(key);
    if (raw == null) return null;
    return JSON.parse(raw) as T;
  } catch {
    return null;
  }
}

function writeJsonLocalStorage(key: string, value: unknown) {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(key, JSON.stringify(value));
  } catch {
    /* quota / private mode */
  }
}

type Pipeline = {
  id: string;
  name: string;
  stages: string[];
  updatedAt?: string | null;
};

type Opportunity = {
  id: string;
  opportunityCode?: string;
  name: string;
  contactId: string;
  contactName?: string;
  contactEmail?: string;
  contactPhone?: string;
  pipelineId: string;
  stage: string;
  status?: "פתוח" | "זכיה" | "הפסד";
  assignedRep?: string;
  email?: string;
  phone?: string;
  utmSource?: string;
  utmCampaign?: string;
  utmMedium?: string;
  utmContent?: string;
  landingpage?: string;
  labelIds?: string[];
  labels?: Array<{ id: string; name: string; color: string }>;
  tags?: string[];
  lastLeadAt?: string | null;
  /** תאריך פעילות אחרונה במסמך הליד של איש הקשר (לא lastLeadAt של ההזדמנות) */
  contactLastLeadAt?: string | null;
  customValues?: Record<string, unknown>;
  createdAt: string | null;
  updatedAt?: string | null;
};

type ContactRow = Record<string, string>;
type TabId = "opportunities" | "pipelines";
type ViewMode = "board" | "list";
type NoteItem = {
  id: string;
  text: string;
  createdAt: string;
  createdBy?: string;
  attachments?: Array<{ id: string; fileName: string; url: string }>;
};
type TaskItem = {
  id: string;
  title: string;
  dueAt: string;
  reminderAt?: string;
  done: boolean;
  status?: "todo" | "in_progress" | "done";
  comments?: Array<{ id: string; text: string; createdAt: string }>;
  createdAt: string;
  syncToGoogleCalendar?: boolean;
  googleCalendarId?: string;
};

type GCalOptOpp = { id: string; summary?: string; primary?: boolean };

function toLocalInputOppTask(iso: string): string {
  return utcIsoToJerusalemDatetimeLocal(String(iso ?? ""));
}
function fromLocalInputOppTask(v: string): string {
  return naiveLocalInputToStoredIso(v);
}
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

function normalizeCustomFieldSortKey(fieldId: string): string {
  return fieldId
    .trim()
    .toLowerCase()
    .replace(/^(contact|opportunity|moving_order)_+/g, "");
}

function payingCustomersCustomFieldRank(fieldId: string): number {
  const k = normalizeCustomFieldSortKey(fieldId);
  const ranks = new Map<string, number>([
    ["mover_welcome_activity_days_text", 1],
    ["mover_days", 1],
    ["mover_welcome_activity_flexible", 2],
    ["mover_flexible_hours", 2],
    ["mover_welcome_activity_start", 3],
    ["mover_hour_start", 3],
    ["mover_welcome_activity_end", 4],
    ["mover_hour_end", 4],
    ["mover_welcome_activity_regions", 5],
    ["mover_regions", 5],
    ["mover_nationwide", 6],
    ["mover_apartment", 7],
    ["mover_small", 8],
    ["mover_crane", 9],
    ["mover_welcome_immediate_availability", 10],
    ["mover_same_day", 10],
    ["leads_count", 11],
    ["package_current_leads_count", 12],
    ["work_availability_status", 13],
  ]);
  return ranks.get(k) ?? Number.MAX_SAFE_INTEGER;
}

function compareCustomFieldIds(
  a: string,
  b: string,
  labelMap: Record<string, string>,
  payingPipeline: boolean
): number {
  if (payingPipeline) {
    const ra = payingCustomersCustomFieldRank(a);
    const rb = payingCustomersCustomFieldRank(b);
    if (ra !== rb) return ra - rb;
  }
  const la = (labelMap[a] ?? a).trim();
  const lb = (labelMap[b] ?? b).trim();
  return la.localeCompare(lb, "he");
}

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
  dateBefore: "מוקדם יותר מ...",
  dateAfter: "מאוחר יותר מ...",
};

const BASE_OPP_COLS = [
  "opportunityCode",
  "name",
  "contactName",
  "email",
  "phone",
  "pipelineName",
  "stage",
  "status",
  "utmSource",
  "utmCampaign",
  "utmMedium",
  "utmContent",
  "landingpage",
  "tags",
  "assignedRep",
  "createdAt",
  "updatedAt",
  "contactLastLeadAt",
];

function opportunityIsLossStatus(o: Pick<Opportunity, "status">): boolean {
  return (o.status ?? "פתוח") === "הפסד";
}

/** הפסד למטה; באותה רמה — עדכון אחרון קודם */
function compareOpportunitiesLossLast(a: Opportunity, b: Opportunity): number {
  const ra = opportunityIsLossStatus(a) ? 1 : 0;
  const rb = opportunityIsLossStatus(b) ? 1 : 0;
  if (ra !== rb) return ra - rb;
  const ta = String(a.updatedAt ?? a.createdAt ?? "");
  const tb = String(b.updatedAt ?? b.createdAt ?? "");
  return tb.localeCompare(ta);
}

const PIPELINE_AUTH_REDIRECT = "CRM_AUTH_REDIRECT";

async function fetchPipelineBootstrap(selectedPipelineId: string) {
  const [pRes, oRes, cRes, lRes] = await Promise.all([
    fetch("/api/opportunities/pipelines", { credentials: "include", cache: "no-store" }),
    fetch(
      selectedPipelineId
        ? `/api/opportunities?pipelineId=${encodeURIComponent(selectedPipelineId)}`
        : "/api/opportunities",
      { credentials: "include", cache: "no-store" }
    ),
    fetch("/api/contacts", { credentials: "include", cache: "no-store" }),
    fetch("/api/labels", { credentials: "include", cache: "no-store" }),
  ]);
  const adminsRes = await fetch("/api/admin-users", {
    credentials: "include",
    cache: "no-store",
  });

  for (const r of [pRes, oRes, cRes, lRes, adminsRes]) {
    if (r.status === 401) {
      window.location.href = `/login?returnTo=${encodeURIComponent("/pipeline")}`;
      throw new Error(PIPELINE_AUTH_REDIRECT);
    }
    if (r.status === 403) {
      window.location.href = `/pending?returnTo=${encodeURIComponent("/pipeline")}`;
      throw new Error(PIPELINE_AUTH_REDIRECT);
    }
  }

  const pJson = (await pRes.json().catch(() => ({}))) as {
    ok?: boolean;
    pipelines?: Pipeline[];
    error?: string;
  };
  const oJson = (await oRes.json().catch(() => ({}))) as {
    ok?: boolean;
    opportunities?: Opportunity[];
    error?: string;
  };
  const cJson = (await cRes.json().catch(() => ({}))) as {
    ok?: boolean;
    rows?: ContactRow[];
    error?: string;
  };
  const lJson = (await lRes.json().catch(() => ({}))) as {
    ok?: boolean;
    labels?: Array<{ id: string; name: string; color: string }>;
  };
  const adminsJson = (await adminsRes.json().catch(() => ({}))) as {
    ok?: boolean;
    users?: Array<{ email: string; name?: string }>;
  };

  if (!pJson.ok) throw new Error(pJson.error ?? "שגיאה בטעינת pipelines");
  if (!oJson.ok) throw new Error(oJson.error ?? "שגיאה בטעינת opportunities");
  if (!cJson.ok) throw new Error(cJson.error ?? "שגיאה בטעינת contacts");

  const p = pJson.pipelines ?? [];
  const opp = oJson.opportunities ?? [];
  const sessionPipe =
    typeof window !== "undefined"
      ? window.sessionStorage.getItem("crm:selectedPipelineId")?.trim() || ""
      : "";
  const inPipelines = (id: string) => Boolean(id && p.some((pl) => pl.id === id));
  const resolvedPipelineId =
    (inPipelines(selectedPipelineId) ? selectedPipelineId : "") ||
    (inPipelines(sessionPipe) ? sessionPipe : "") ||
    p[0]?.id ||
    "";

  const cfRes = await fetch(
    resolvedPipelineId
      ? `/api/custom-fields?entityType=opportunity&pipelineId=${encodeURIComponent(resolvedPipelineId)}`
      : `/api/custom-fields?entityType=opportunity`,
    { credentials: "include", cache: "no-store" }
  );
  if (cfRes.status === 401) {
    window.location.href = `/login?returnTo=${encodeURIComponent("/pipeline")}`;
    throw new Error(PIPELINE_AUTH_REDIRECT);
  }
  if (cfRes.status === 403) {
    window.location.href = `/pending?returnTo=${encodeURIComponent("/pipeline")}`;
    throw new Error(PIPELINE_AUTH_REDIRECT);
  }
  const cfJson = (await cfRes.json().catch(() => ({}))) as {
    ok?: boolean;
    fields?: Array<{ fieldId: string; label?: string }>;
  };

  const catalogLabels = lJson.ok && Array.isArray(lJson.labels) ? lJson.labels : [];

  return {
    p,
    opp,
    contacts: cJson.rows ?? [],
    adminUsers: adminsJson.ok ? adminsJson.users ?? [] : [],
    catalogLabels,
    cfJson,
    resolvedPipelineId,
  };
}

/** כפילות מול «מספר פניות (לידים)» — שדה ישן/מותאם עם אותו משמעות */
const REDUNDANT_LEAD_COLUMN_LABEL_SNIPPET = "כמות לידים שקיבל";

function isRedundantPipelineLeadColumn(fieldId: string, labelById: Record<string, string>): boolean {
  const label = (labelById[fieldId] ?? "").trim();
  return label.includes(REDUNDANT_LEAD_COLUMN_LABEL_SNIPPET);
}

/**
 * עמודות גלויות לפי שמירה + רק שדות חדשים שלא היו בסדר השמור (ברירת מחדל גלוי).
 * לא מוסיפים בחזרה עמודה שהוסרה מהתצוגה אם היא עדיין מופיעה בסדר העמודות.
 */
function mergeVisibleColsWithNewKeys(
  savedVisible: string[],
  allKeys: string[],
  savedOrder: string[]
): string[] {
  const orderSet = new Set(savedOrder);
  const base = savedVisible.filter((k) => allKeys.includes(k));
  const seen = new Set(base);
  const out = [...base];
  for (const k of allKeys) {
    if (seen.has(k)) continue;
    if (!orderSet.has(k)) {
      out.push(k);
      seen.add(k);
    }
  }
  return out;
}

export default function PipelineClient() {
  const searchParams = useSearchParams();
  const [err, setErr] = useState<string | null>(null);
  const [tab, setTab] = useState<TabId>("opportunities");
  const [viewMode, setViewMode] = useState<ViewMode>("list");
  const [pipelines, setPipelines] = useState<Pipeline[]>([]);
  const [opportunities, setOpportunities] = useState<Opportunity[]>([]);
  const [contacts, setContacts] = useState<ContactRow[]>([]);
  const [selectedPipelineId, setSelectedPipelineId] = useState("");
  /** מניעת דריסת סדר/נראות עמודות בכל קריאת load() (שמירה אחרי PATCH וכו׳) */
  const pipelinePrefsLoadedForRef = useRef<string | null>(null);
  /** לזיהוי שדות חדשים ב־load חוזר בלי לאבד עמודות מוסתרות */
  const lastLoadedAllOppColKeysRef = useRef<string[] | null>(null);

  const [createPipelineOpen, setCreatePipelineOpen] = useState(false);
  const [newPipelineName, setNewPipelineName] = useState("");
  const [newPipelineStages, setNewPipelineStages] = useState([
    "New Lead",
    "Contacted",
    "Proposal Sent",
    "Closed",
  ]);

  const [createOpportunityOpen, setCreateOpportunityOpen] = useState(false);
  const [newOppName, setNewOppName] = useState("");
  const [newOppContactId, setNewOppContactId] = useState("");
  const [newOppStage, setNewOppStage] = useState("");
  const [newOppStatus, setNewOppStatus] = useState<"פתוח" | "זכיה" | "הפסד">("פתוח");
  const [newOppAssignedRep, setNewOppAssignedRep] = useState("");
  const [oppVisibleCols, setOppVisibleCols] = useState<string[]>([]);
  const [oppColumnOrder, setOppColumnOrder] = useState<string[]>([]);
  const [manageOppColsOpen, setManageOppColsOpen] = useState(false);
  const [oppDragIndex, setOppDragIndex] = useState<number | null>(null);
  const [selectedOpp, setSelectedOpp] = useState<Opportunity | null>(null);
  const [oppDetailTab, setOppDetailTab] = useState<"details" | "notes" | "tasks" | "whatsapp" | "greenapi">(
    "details"
  );
  const [oppNotes, setOppNotes] = useState<NoteItem[]>([]);
  const [oppTasks, setOppTasks] = useState<TaskItem[]>([]);
  const [oppTaskModal, setOppTaskModal] = useState<
    null | { mode: "new" } | { mode: "edit"; task: TaskItem }
  >(null);
  const [oppTfTitle, setOppTfTitle] = useState("");
  const [oppTfDue, setOppTfDue] = useState("");
  const [oppTfRem, setOppTfRem] = useState("");
  const [oppTfStatus, setOppTfStatus] = useState<"todo" | "in_progress" | "done">("todo");
  const [oppGcalLoading, setOppGcalLoading] = useState(false);
  const [oppGcalConnected, setOppGcalConnected] = useState(false);
  const [oppGcalList, setOppGcalList] = useState<GCalOptOpp[]>([]);
  const [oppSyncGcal, setOppSyncGcal] = useState(false);
  const [oppGcalCalId, setOppGcalCalId] = useState("primary");
  const [newOppNoteText, setNewOppNoteText] = useState("");
  const [newOppNoteFiles, setNewOppNoteFiles] = useState<File[]>([]);
  const [oppNoteUploading, setOppNoteUploading] = useState(false);
  const [oppCustomFieldIds, setOppCustomFieldIds] = useState<string[]>([]);
  const [oppCustomFieldLabelById, setOppCustomFieldLabelById] = useState<Record<string, string>>({});
  const [catalogLabels, setCatalogLabels] = useState<Array<{ id: string; name: string; color: string }>>([]);
  const [labelPickOppId, setLabelPickOppId] = useState<string | null>(null);
  const [labelPickDraft, setLabelPickDraft] = useState<string[]>([]);
  const [detailLabelIds, setDetailLabelIds] = useState<string[]>([]);
  const [newOppLabelIds, setNewOppLabelIds] = useState<string[]>([]);
  const [pipelineMenuOpenId, setPipelineMenuOpenId] = useState<string | null>(null);
  const [editPipelineOpen, setEditPipelineOpen] = useState(false);
  const [editPipelineId, setEditPipelineId] = useState<string | null>(null);
  const [editPipelineName, setEditPipelineName] = useState("");
  const [editStages, setEditStages] = useState<string[]>([]);
  const [editDragIndex, setEditDragIndex] = useState<number | null>(null);
  const [adminUsers, setAdminUsers] = useState<Array<{ email: string; name?: string }>>([]);
  const [oppColWidths, setOppColWidths] = useState<Record<string, number>>({});
  const [oppSort, setOppSort] = useState<SortState>(null);
  const [oppColFilters, setOppColFilters] = useState<Record<string, string>>({});
  const [advOpen, setAdvOpen] = useState(false);
  const [advLogic, setAdvLogic] = useState<AdvLogic>("and");
  const [advFilters, setAdvFilters] = useState<AdvFilter[]>([]);
  const [draftAdvLogic, setDraftAdvLogic] = useState<AdvLogic>("and");
  const [draftAdvFilters, setDraftAdvFilters] = useState<AdvFilter[]>([]);
  const [editingCell, setEditingCell] = useState<EditingCell | null>(null);
  const [openedOpportunityFromQuery, setOpenedOpportunityFromQuery] = useState(false);
  const [boardPreviewFields, setBoardPreviewFields] = useState<string[]>([]);
  const [toastMessage, setToastMessage] = useState<string | null>(null);
  const [confettiOn, setConfettiOn] = useState(false);
  const [confettiKey, setConfettiKey] = useState(0);
  const [oppDeleteOpen, setOppDeleteOpen] = useState(false);
  const [oppDeleteConfirm, setOppDeleteConfirm] = useState("");
  const [selectedOppIds, setSelectedOppIds] = useState<string[]>([]);
  const [bulkStage, setBulkStage] = useState("");
  const [bulkStatus, setBulkStatus] = useState<"" | "פתוח" | "זכיה" | "הפסד">("");
  const [bulkAssignedRep, setBulkAssignedRep] = useState("__NO_CHANGE__");
  const [bulkDeleteOpen, setBulkDeleteOpen] = useState(false);
  const [bulkDeleteConfirm, setBulkDeleteConfirm] = useState("");
  const [bulkBusy, setBulkBusy] = useState<null | "update" | "delete">(null);

  const selectedPipeline = useMemo(
    () => pipelines.find((p) => p.id === selectedPipelineId) ?? null,
    [pipelines, selectedPipelineId]
  );
  const selectedOppPipeline = useMemo(
    () => (selectedOpp ? pipelines.find((p) => p.id === selectedOpp.pipelineId) ?? null : null),
    [selectedOpp, pipelines]
  );

  const oppForSelectedPipeline = useMemo(() => {
    if (!selectedPipelineId) return opportunities;
    return opportunities.filter((o) => o.pipelineId === selectedPipelineId);
  }, [opportunities, selectedPipelineId]);

  const grouped = useMemo(() => {
    const map: Record<string, Opportunity[]> = {};
    for (const s of selectedPipeline?.stages ?? []) map[s] = [];
    for (const o of oppForSelectedPipeline) {
      const key = o.stage || "—";
      map[key] ||= [];
      map[key].push(o);
    }
    for (const k of Object.keys(map)) {
      map[k].sort(compareOpportunitiesLossLast);
    }
    return map;
  }, [oppForSelectedPipeline, selectedPipeline]);

  const {
    data: pipelineData,
    error: pipelineSwrError,
    isLoading: pipelineIsLoading,
    mutate: mutatePipeline,
  } = useSWR(
    ["crm-pipeline", selectedPipelineId],
    ([, pid]) => fetchPipelineBootstrap(pid),
    { revalidateOnFocus: true, dedupingInterval: 5000, keepPreviousData: false }
  );

  const loading = pipelineIsLoading && !pipelineData;

  useEffect(() => {
    if (pipelineSwrError && pipelineSwrError.message !== PIPELINE_AUTH_REDIRECT) {
      setErr(pipelineSwrError.message);
    }
  }, [pipelineSwrError]);

  useEffect(() => {
    if (pipelineData) setErr(null);
  }, [pipelineData]);

  useEffect(() => {
    if (!pipelineData) return;
    const {
      p,
      opp,
      contacts: cRows,
      adminUsers: admins,
      catalogLabels: catLab,
      cfJson,
      resolvedPipelineId,
    } = pipelineData;
    setPipelines(p);
    setOpportunities(opp);
    setContacts(cRows);
    setAdminUsers(admins);

    const inPipelines = (id: string) => Boolean(id && p.some((pl) => pl.id === id));
    setSelectedPipelineId((prev) => (inPipelines(prev) ? prev : resolvedPipelineId));

    const customFromSettings =
      cfJson.ok && Array.isArray(cfJson.fields) ? cfJson.fields.map((f) => f.fieldId) : [];
    const labelMap: Record<string, string> = {};
    if (cfJson.ok && Array.isArray(cfJson.fields)) {
      for (const f of cfJson.fields) {
        if (f.fieldId) labelMap[f.fieldId] = (f.label?.trim() || f.fieldId).trim();
      }
    }
    if (resolvedPipelineId === PAYING_CUSTOMERS_PIPELINE_ID) {
      const lc = MOVER_OPPORTUNITY_FIELD_IDS.leadsCount;
      labelMap[lc] = labelMap[lc] ?? "מספר פניות (לידים)";
    }
    setOppCustomFieldLabelById(labelMap);
    setCatalogLabels(catLab);
    const keysFromOpps = Array.from(
      new Set(opp.flatMap((o) => Object.keys((o.customValues ?? {}) as Record<string, unknown>)))
    );
    const leadsColExtra =
      resolvedPipelineId === PAYING_CUSTOMERS_PIPELINE_ID
        ? [MOVER_OPPORTUNITY_FIELD_IDS.leadsCount]
        : [];
    const allOppColKeysRaw = Array.from(
      new Set([...BASE_OPP_COLS, ...customFromSettings, ...keysFromOpps, ...leadsColExtra])
    );
    const allOppColKeys = allOppColKeysRaw.filter(
      (k) => !isRedundantPipelineLeadColumn(k, labelMap)
    );

    setOppCustomFieldIds(
      Array.from(new Set([...customFromSettings, ...keysFromOpps, ...leadsColExtra]))
        .filter((k) => !isRedundantPipelineLeadColumn(k, labelMap))
        .sort((a, b) =>
          compareCustomFieldIds(
            a,
            b,
            labelMap,
            resolvedPipelineId === PAYING_CUSTOMERS_PIPELINE_ID
          )
        )
    );
    const migrateKey = (k: string) => (k === "lastLeadAt" ? "contactLastLeadAt" : k);

    const prefsPid = resolvedPipelineId;
    const prefsKeys = prefsPid ? pipelineColPrefsStorageKeys(prefsPid) : null;
    const pipelinePrefsJustSwitched = Boolean(
      prefsPid && pipelinePrefsLoadedForRef.current !== prefsPid
    );
    if (prefsPid) {
      pipelinePrefsLoadedForRef.current = prefsPid;
    }

    if (pipelinePrefsJustSwitched && prefsKeys) {
      const orderFromSaved =
        readJsonLocalStorage<string[]>(prefsKeys.order) ??
        readPipelineColsCookie<string[]>(pipelineOppColOrderCookieKey(prefsPid));
      const visFromSaved =
        readJsonLocalStorage<string[]>(prefsKeys.visible) ??
        readPipelineColsCookie<string[]>(pipelineOppColVisibleCookieKey(prefsPid));
      const widthsFromLs = readJsonLocalStorage<Record<string, number>>(prefsKeys.widths);

      const orderMigrated = orderFromSaved?.length
        ? [...new Set(orderFromSaved.map(migrateKey))]
        : null;
      const mergedOrder = orderMigrated?.length ? [...orderMigrated] : [...allOppColKeys];
      for (const k of allOppColKeys) {
        if (!mergedOrder.includes(k)) mergedOrder.push(k);
      }
      const orderClean = mergedOrder.filter((k) => !isRedundantPipelineLeadColumn(k, labelMap));
      setOppColumnOrder(orderClean);

      const visMigrated = visFromSaved?.length
        ? [...new Set(visFromSaved.map(migrateKey))]
        : null;
      const mergedVisible = visMigrated?.length
        ? mergeVisibleColsWithNewKeys(visMigrated, allOppColKeys, orderClean)
        : [...allOppColKeys];
      setOppVisibleCols(
        mergedVisible.filter((k) => !isRedundantPipelineLeadColumn(k, labelMap))
      );

      if (widthsFromLs && typeof widthsFromLs === "object" && !Array.isArray(widthsFromLs)) {
        const w = { ...widthsFromLs };
        for (const k of Object.keys(w)) {
          if (isRedundantPipelineLeadColumn(k, labelMap)) delete w[k];
        }
        setOppColWidths(w);
      }
    } else {
      const prevKeysSnapshot = lastLoadedAllOppColKeysRef.current;
      setOppColumnOrder((prev) => {
        const base = prev.length ? prev : [...allOppColKeys];
        const next = [...base];
        for (const k of allOppColKeys) {
          if (!next.includes(k)) next.push(k);
        }
        return next
          .filter((k) => allOppColKeys.includes(k))
          .filter((k) => !isRedundantPipelineLeadColumn(k, labelMap));
      });
      setOppVisibleCols((prev) => {
        if (!prev.length) return [...allOppColKeys];
        let next = prev.filter((k) => allOppColKeys.includes(k));
        next = next.filter((k) => !isRedundantPipelineLeadColumn(k, labelMap));
        if (prevKeysSnapshot?.length) {
          for (const k of allOppColKeys) {
            if (!prevKeysSnapshot.includes(k) && !next.includes(k)) next.push(k);
          }
        }
        return next;
      });
    }
    lastLoadedAllOppColKeysRef.current = [...allOppColKeys];
    setBoardPreviewFields((prev) => {
      if (prev.length) return prev;
      const available = new Set(allOppColKeys);
      const defaults = ["contactName", "status", "stage", "assignedRep", "phone"];
      return defaults.filter((x) => available.has(x)).slice(0, 5);
    });
  }, [pipelineData]);

  useEffect(() => {
    if (typeof window === "undefined" || !selectedPipelineId) return;
    if (oppColumnOrder.length === 0 && oppVisibleCols.length === 0) return;
    const keys = pipelineColPrefsStorageKeys(selectedPipelineId);
    writeJsonLocalStorage(keys.order, oppColumnOrder);
    writeJsonLocalStorage(keys.visible, oppVisibleCols);
    writePipelineColsCookie(
      pipelineOppColOrderCookieKey(selectedPipelineId),
      oppColumnOrder
    );
    writePipelineColsCookie(
      pipelineOppColVisibleCookieKey(selectedPipelineId),
      oppVisibleCols
    );
  }, [selectedPipelineId, oppColumnOrder, oppVisibleCols]);

  useEffect(() => {
    if (typeof window === "undefined" || !selectedPipelineId) return;
    if (Object.keys(oppColWidths).length === 0) return;
    writeJsonLocalStorage(
      pipelineColPrefsStorageKeys(selectedPipelineId).widths,
      oppColWidths
    );
  }, [selectedPipelineId, oppColWidths]);

  useEffect(() => {
    if (!toastMessage) return;
    const t = window.setTimeout(() => setToastMessage(null), 4200);
    return () => window.clearTimeout(t);
  }, [toastMessage]);

  useEffect(() => {
    if (!oppTaskModal) return;
    if (oppTaskModal.mode === "new") {
      setOppTfTitle("");
      setOppTfDue("");
      setOppTfRem("");
      setOppTfStatus("todo");
      return;
    }
    const t = oppTaskModal.task;
    setOppTfTitle(t.title);
    setOppTfDue(toLocalInputOppTask(t.dueAt));
    setOppTfRem(toLocalInputOppTask(t.reminderAt ?? ""));
    setOppTfStatus((t.status ?? (t.done ? "done" : "todo")) as "todo" | "in_progress" | "done");
  }, [oppTaskModal]);

  useEffect(() => {
    if (!oppTaskModal) return;
    let cancelled = false;
    void (async () => {
      setOppGcalLoading(true);
      try {
        const stRes = await fetch("/api/google-calendar/status", {
          credentials: "include",
          cache: "no-store",
        });
        const st = (await stRes.json().catch(() => ({}))) as {
          ok?: boolean;
          connected?: boolean;
        };
        const connected = Boolean(stRes.ok && st.ok && st.connected);
        let cals: GCalOptOpp[] = [];
        if (connected) {
          const cRes = await fetch("/api/google-calendar/calendars", {
            credentials: "include",
            cache: "no-store",
          });
          const cj = (await cRes.json().catch(() => ({}))) as {
            ok?: boolean;
            calendars?: GCalOptOpp[];
          };
          if (cRes.ok && cj.ok) cals = cj.calendars ?? [];
        }
        if (cancelled) return;
        setOppGcalConnected(connected);
        setOppGcalList(cals);
        const defaultCal =
          cals.find((c) => c.primary)?.id ?? cals[0]?.id ?? "primary";
        if (oppTaskModal.mode === "new") {
          setOppSyncGcal(connected);
          setOppGcalCalId(defaultCal);
        } else {
          const t = oppTaskModal.task;
          setOppSyncGcal(Boolean(t.syncToGoogleCalendar));
          setOppGcalCalId(String(t.googleCalendarId ?? "").trim() || defaultCal);
        }
      } catch {
        if (!cancelled) {
          setOppGcalConnected(false);
          setOppGcalList([]);
          setOppSyncGcal(false);
        }
      } finally {
        if (!cancelled) setOppGcalLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [oppTaskModal]);

  const adminLabelByEmail = useMemo(() => {
    const map = new Map<string, string>();
    for (const u of adminUsers) {
      map.set(u.email, (u.name?.trim() || u.email).trim());
    }
    return map;
  }, [adminUsers]);

  useEffect(() => {
    if (openedOpportunityFromQuery) return;
    const openOpportunityId = searchParams.get("openOpportunityId")?.trim();
    if (!openOpportunityId || opportunities.length === 0) return;
    const target = opportunities.find((o) => o.id === openOpportunityId);
    if (!target) return;
    if (target.pipelineId && selectedPipelineId !== target.pipelineId) {
      setSelectedPipelineId(target.pipelineId);
    }
    void openOpportunityDetail(openOpportunityId);
    setOpenedOpportunityFromQuery(true);
    if (typeof window !== "undefined") {
      const nextUrl = new URL(window.location.href);
      nextUrl.searchParams.delete("openOpportunityId");
      window.history.replaceState({}, "", nextUrl.toString());
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [searchParams, opportunities, selectedPipelineId, openedOpportunityFromQuery]);

  useEffect(() => {
    const saved =
      typeof window !== "undefined"
        ? window.sessionStorage.getItem("crm:selectedPipelineId")
        : null;
    if (saved && !selectedPipelineId) {
      setSelectedPipelineId(saved);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    if (!selectedPipelineId) return;
    window.sessionStorage.setItem("crm:selectedPipelineId", selectedPipelineId);
  }, [selectedPipelineId]);

  useEffect(() => {
    if (!labelPickOppId) return;
    const o = opportunities.find((x) => x.id === labelPickOppId);
    setLabelPickDraft([...(o?.labelIds ?? [])]);
  }, [labelPickOppId, opportunities]);

  const selectedOppLabelKey = selectedOpp
    ? `${selectedOpp.id}:${(selectedOpp.labelIds ?? []).join(",")}`
    : "";
  useEffect(() => {
    if (!selectedOpp) {
      setDetailLabelIds([]);
      return;
    }
    setDetailLabelIds([...(selectedOpp.labelIds ?? [])]);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedOppLabelKey]);

  async function createPipeline() {
    try {
      const res = await fetch("/api/opportunities/pipelines", {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: newPipelineName, stages: newPipelineStages }),
      });
      const j = (await res.json().catch(() => ({}))) as {
        ok?: boolean;
        error?: string;
        pipeline?: Pipeline;
      };
      if (!res.ok || !j.ok || !j.pipeline) throw new Error(j.error ?? "יצירת פייפליין נכשלה");
      setCreatePipelineOpen(false);
      setSelectedPipelineId(j.pipeline.id);
      setNewPipelineName("");
      setNewPipelineStages(["New Lead", "Contacted", "Proposal Sent", "Closed"]);
      await mutatePipeline();
    } catch (e) {
      setErr(e instanceof Error ? e.message : "יצירת פייפליין נכשלה");
    }
  }

  async function createOpportunity() {
    try {
      const res = await fetch("/api/opportunities", {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: newOppName,
          contactId: newOppContactId,
          pipelineId: selectedPipelineId,
          stage: newOppStage || selectedPipeline?.stages?.[0] || "New Lead",
          status: newOppStatus,
          assignedRep: newOppAssignedRep,
          labelIds: newOppLabelIds,
        }),
      });
      const j = (await res.json().catch(() => ({}))) as { ok?: boolean; error?: string };
      if (!res.ok || !j.ok) throw new Error(j.error ?? "יצירת הזדמנות נכשלה");
      setCreateOpportunityOpen(false);
      setNewOppName("");
      setNewOppContactId("");
      setNewOppStage("");
      setNewOppStatus("פתוח");
      setNewOppAssignedRep("");
      setNewOppLabelIds([]);
      await mutatePipeline();
    } catch (e) {
      setErr(e instanceof Error ? e.message : "יצירת הזדמנות נכשלה");
    }
  }

  async function openOpportunityDetail(id: string) {
    const res = await fetch(`/api/opportunities/${encodeURIComponent(id)}`, {
      credentials: "include",
      cache: "no-store",
    });
    const j = (await res.json().catch(() => ({}))) as {
      ok?: boolean;
      error?: string;
      opportunity?: Opportunity & { notes?: NoteItem[]; tasks?: TaskItem[] };
    };
    if (!res.ok || !j.ok || !j.opportunity) {
      setErr(j.error ?? "טעינת הזדמנות נכשלה");
      return;
    }
    setSelectedOpp(j.opportunity);
    setOppNotes(j.opportunity.notes ?? []);
    setOppTasks(j.opportunity.tasks ?? []);
    setOppDetailTab("details");
  }

  async function saveOpportunityPatch(
    id: string,
    patch: {
      name?: string;
      contactId?: string;
      stage?: string;
      pipelineId?: string;
      assignedRep?: string;
      customValues?: Record<string, unknown>;
      status?: "פתוח" | "זכיה" | "הפסד";
      email?: string;
      phone?: string;
      utmSource?: string;
      utmCampaign?: string;
      utmMedium?: string;
      utmContent?: string;
      landingpage?: string;
      labelIds?: string[];
      tags?: string[];
      notes?: NoteItem[];
      tasks?: TaskItem[];
    },
    options?: {
      fromDetail?: boolean;
      showSavedToast?: boolean;
      prevStatusBeforeSave?: "פתוח" | "זכיה" | "הפסד";
    }
  ) {
    const res = await fetch(`/api/opportunities/${encodeURIComponent(id)}`, {
      method: "PATCH",
      credentials: "include",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(patch),
    });
    const j = (await res.json().catch(() => ({}))) as {
      ok?: boolean;
      error?: string;
      opportunity?: Opportunity & { notes?: NoteItem[]; tasks?: TaskItem[] };
    };
    if (!res.ok || !j.ok || !j.opportunity) {
      setErr(j.error ?? "שמירת הזדמנות נכשלה");
      return;
    }
    if (options?.showSavedToast) {
      setToastMessage("העדכון נשמר בהצלחה");
      const nextStatus = j.opportunity.status ?? "פתוח";
      if (options.prevStatusBeforeSave !== "זכיה" && nextStatus === "זכיה") {
        setConfettiKey((k) => k + 1);
        setConfettiOn(true);
        window.setTimeout(() => setConfettiOn(false), 2600);
      }
    }
    if (options?.fromDetail) {
      setSelectedOpp((prev) => {
        if (!prev || prev.id !== id) return prev;
        return j.opportunity ?? prev;
      });
    }
    if (options?.fromDetail && selectedOpp?.id === id) {
      setOppNotes(j.opportunity.notes ?? []);
      setOppTasks(j.opportunity.tasks ?? []);
    }
    await mutatePipeline();
  }

  async function onDropOpportunity(oppId: string, stage: string) {
    const opp = opportunities.find((o) => o.id === oppId);
    if (!opp || opp.stage === stage) return;
    await saveOpportunityPatch(opp.id, { stage, pipelineId: selectedPipelineId });
  }

  const oppDisplayCols = useMemo(() => {
    const order = oppColumnOrder.length ? oppColumnOrder : BASE_OPP_COLS;
    const visible = oppVisibleCols.length ? oppVisibleCols : order;
    return order.filter((h) => visible.includes(h));
  }, [oppColumnOrder, oppVisibleCols]);

  function formatJerusalemDate(raw: string | null | undefined): string {
    if (!raw) return "";
    return formatIsraelDateTime(raw);
  }

  function asDateKey(raw: string): string | null {
    const s = raw.trim();
    if (!s) return null;
    if (/^\d{4}-\d{2}-\d{2}$/.test(s)) return s;
    const t = Date.parse(s);
    if (Number.isNaN(t)) return null;
    return new Date(t).toISOString().slice(0, 10);
  }

  function boardPreviewCell(o: Opportunity, f: string) {
    const text = opportunityCell(o, f) || "—";
    const raw = opportunityCell(o, f);
    if (columnIntegrationKind(f) === "phone" && raw.trim()) {
      return (
        <span style={{ display: "inline-flex", alignItems: "center", gap: 6, flexWrap: "nowrap", whiteSpace: "nowrap" }}>
          <span style={{ color: "#6b7280" }}>{text}</span>
          <WhatsAppIconLink phone={raw} size={16} />
        </span>
      );
    }
    return <span style={{ color: "#6b7280", wordBreak: "break-word" }}>{text}</span>;
  }

  function opportunityCell(o: Opportunity, col: string): string {
    if (col === "pipelineName") {
      return pipelines.find((p) => p.id === o.pipelineId)?.name || o.pipelineId;
    }
    if (col === "assignedRep") {
      const value = String(o.assignedRep ?? "");
      return adminLabelByEmail.get(value) ?? value;
    }
    if (col === "tags") {
      if (o.labels?.length) return o.labels.map((l) => l.name).join(", ");
      return (o.tags ?? []).join(", ");
    }
    if (col === "createdAt") return formatJerusalemDate(o.createdAt);
    if (col === "updatedAt") return formatJerusalemDate(o.updatedAt);
    if (col === "contactLastLeadAt") return formatJerusalemDate(o.contactLastLeadAt);
    if (col in o) return String((o as Record<string, unknown>)[col] ?? "");
    return String((o.customValues ?? {})[col] ?? "");
  }

  function opportunityFieldLabel(col: string): string {
    const labels: Record<string, string> = {
      opportunityCode: "מספר הזדמנות",
      name: "שם הזדמנות",
      contactName: "איש קשר",
      email: "מייל",
      phone: "פלאפון",
      pipelineName: "פייפליין",
      stage: "שלב",
      status: "סטטוס",
      utmSource: "utm_source",
      utmCampaign: "utm_campaign",
      utmMedium: "utm_medium",
      utmContent: "utm_content",
      landingpage: "landingpage",
      tags: "תגיות",
      assignedRep: "משויך",
      createdAt: "נוצר",
      updatedAt: "עודכן",
      contactLastLeadAt: "ליד אחרון (איש קשר)",
      [MOVER_OPPORTUNITY_FIELD_IDS.leadsCount]: "מספר פניות (לידים)",
    };
    return labels[col] ?? oppCustomFieldLabelById[col] ?? col;
  }

  function oppDefaultColWidth(col: string): number {
    if (
      col === "phone" ||
      col === "contactPhone" ||
      columnIntegrationKind(col) === "phone"
    ) {
      return 220;
    }
    return 180;
  }

  const advFieldKinds = useMemo(() => {
    const out: Record<string, AdvFieldKind> = {};
    const rowsToInspect = oppForSelectedPipeline.slice(0, 120);
    for (const col of oppDisplayCols) {
      if (col === MOVER_OPPORTUNITY_FIELD_IDS.leadsCount) {
        out[col] = "number";
        continue;
      }
      const key = col.trim().toLowerCase();
      if (
        key === "status" ||
        key === "stage" ||
        key === "assignedrep" ||
        key === "pipelinename"
      ) {
        out[col] = "select";
        continue;
      }
      if (
        key === "createdat" ||
        key === "updatedat" ||
        key === "lastleadat" ||
        key === "contactlastleadat"
      ) {
        out[col] = "date";
        continue;
      }
      const values = rowsToInspect.map((o) => opportunityCell(o, col).trim()).filter(Boolean);
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
  }, [oppDisplayCols, oppForSelectedPipeline, pipelines, adminLabelByEmail]);

  const advSelectValues = useMemo(() => {
    const out: Record<string, string[]> = {};
    for (const col of oppDisplayCols) {
      if (advFieldKinds[col] !== "select") continue;
      const uniq = Array.from(
        new Set(
          oppForSelectedPipeline.map((o) => opportunityCell(o, col).trim()).filter(Boolean)
        )
      );
      out[col] = uniq.sort((a, b) => a.localeCompare(b, "he"));
    }
    return out;
  }, [oppDisplayCols, advFieldKinds, oppForSelectedPipeline, pipelines]);

  function defaultOpForField(field: string): AdvOp {
    const kind = advFieldKinds[field] ?? "text";
    return ADV_OPS_BY_KIND[kind][0] ?? "contains";
  }

  function evaluateAdvFilter(o: Opportunity, f: AdvFilter): boolean {
    const raw = opportunityCell(o, f.field);
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

  const INLINE_READONLY = new Set([
    "opportunityCode",
    "createdAt",
    "updatedAt",
    "contactLastLeadAt",
    "pipelineName",
    "contactName",
    "contactEmail",
    "contactPhone",
    "contactId",
  ]);

  function startInlineEdit(o: Opportunity, col: string) {
    if (INLINE_READONLY.has(col)) return;
    if (col === "tags") {
      setLabelPickOppId(o.id);
      return;
    }
    const current = opportunityCell(o, col);
    setEditingCell({ id: o.id, col, value: current });
  }

  async function commitInlineEdit(o: Opportunity, col: string, rawValue: string) {
    if (INLINE_READONLY.has(col)) return;
    const value = rawValue.trim();
    if (col === "stage") {
      const pipeline = pipelines.find((p) => p.id === o.pipelineId);
      const allowedStages = pipeline?.stages ?? [];
      if (!value) return;
      if (allowedStages.length > 0 && !allowedStages.includes(value)) {
        setErr(`השלב חייב להיות אחד מהשלבים בפייפליין: ${allowedStages.join(" / ")}`);
        return;
      }
      await saveOpportunityPatch(o.id, { stage: value });
      return;
    }
    if (col === "status") {
      const status = value === "זכיה" || value === "הפסד" || value === "פתוח" ? value : "פתוח";
      await saveOpportunityPatch(o.id, { status });
      return;
    }
    if (col === "assignedRep") {
      await saveOpportunityPatch(o.id, { assignedRep: value });
      return;
    }
    if (["name", "email", "phone", "utmSource", "utmCampaign", "utmMedium", "utmContent", "landingpage"].includes(col)) {
      await saveOpportunityPatch(o.id, { [col]: value } as Record<string, unknown>);
      return;
    }
    if (col === MOVER_OPPORTUNITY_FIELD_IDS.leadsCount) {
      const n = Number.parseInt(value, 10);
      if (value !== "" && (Number.isNaN(n) || n < 0)) {
        setErr("מספר פניות חייב להיות מספר שלם אי־שלילי");
        return;
      }
      const numVal = value === "" ? 0 : n;
      await saveOpportunityPatch(o.id, {
        customValues: { ...(o.customValues ?? {}), [col]: numVal },
      });
      return;
    }
    await saveOpportunityPatch(o.id, {
      customValues: { ...(o.customValues ?? {}), [col]: value },
    });
  }

  function onResizeColumnStart(col: string, startX: number) {
    const base = oppColWidths[col] ?? oppDefaultColWidth(col);
    const onMove = (ev: MouseEvent) => {
      const next = Math.max(120, base + (ev.clientX - startX));
      setOppColWidths((prev) => ({ ...prev, [col]: next }));
    };
    const onUp = () => {
      window.removeEventListener("mousemove", onMove);
      window.removeEventListener("mouseup", onUp);
    };
    window.addEventListener("mousemove", onMove);
    window.addEventListener("mouseup", onUp);
  }

  const filteredSortedOpps = useMemo(() => {
    let filtered = oppForSelectedPipeline.filter((o) =>
      oppDisplayCols.every((col) => {
        const q = (oppColFilters[col] ?? "").trim().toLowerCase();
        if (!q) return true;
        return opportunityCell(o, col).toLowerCase().includes(q);
      })
    );
    if (advFilters.length) {
      filtered = filtered.filter((o) => {
        const checks = advFilters.map((f) => evaluateAdvFilter(o, f));
        return advLogic === "and" ? checks.every(Boolean) : checks.some(Boolean);
      });
    }
    const sorted = [...filtered];
    if (!oppSort) {
      sorted.sort(compareOpportunitiesLossLast);
      return sorted;
    }
    sorted.sort((a, b) => {
      const av = opportunityCell(a, oppSort.col).toLowerCase();
      const bv = opportunityCell(b, oppSort.col).toLowerCase();
      if (av < bv) return oppSort.dir === "asc" ? -1 : 1;
      if (av > bv) return oppSort.dir === "asc" ? 1 : -1;
      return compareOpportunitiesLossLast(a, b);
    });
    return sorted;
  }, [oppForSelectedPipeline, oppDisplayCols, oppColFilters, oppSort, advFilters, advLogic]);

  const filteredOppIds = useMemo(
    () => new Set(filteredSortedOpps.map((o) => o.id)),
    [filteredSortedOpps]
  );
  const selectedVisibleCount = useMemo(
    () => selectedOppIds.filter((id) => filteredOppIds.has(id)).length,
    [selectedOppIds, filteredOppIds]
  );

  useEffect(() => {
    setSelectedOppIds((prev) => prev.filter((id) => filteredOppIds.has(id)));
  }, [filteredOppIds]);

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

  function toggleSort(col: string) {
    setOppSort((prev) => {
      if (!prev || prev.col !== col) return { col, dir: "asc" };
      return { col, dir: prev.dir === "asc" ? "desc" : "asc" };
    });
  }

  function toggleOppSelection(id: string, checked: boolean) {
    setSelectedOppIds((prev) => {
      const set = new Set(prev);
      if (checked) set.add(id);
      else set.delete(id);
      return Array.from(set);
    });
  }

  function toggleSelectAllVisible(checked: boolean) {
    setSelectedOppIds((prev) => {
      const set = new Set(prev);
      for (const o of filteredSortedOpps) {
        if (checked) set.add(o.id);
        else set.delete(o.id);
      }
      return Array.from(set);
    });
  }

  async function applyBulkUpdate() {
    const ids = [...selectedOppIds];
    if (ids.length === 0) return;
    const patch: { stage?: string; status?: "פתוח" | "זכיה" | "הפסד"; assignedRep?: string } = {};
    if (bulkStage.trim()) patch.stage = bulkStage.trim();
    if (bulkStatus) patch.status = bulkStatus;
    if (bulkAssignedRep === "__CLEAR__") patch.assignedRep = "";
    else if (bulkAssignedRep !== "__NO_CHANGE__") patch.assignedRep = bulkAssignedRep.trim();
    if (!patch.stage && !patch.status && bulkAssignedRep === "__NO_CHANGE__") {
      setErr("בחרו לפחות שדה אחד לעדכון מרובה");
      return;
    }
    setBulkBusy("update");
    try {
      const res = await fetch("/api/opportunities/bulk", {
        method: "PATCH",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ids, patch }),
      });
      const j = (await res.json().catch(() => ({}))) as {
        ok?: boolean;
        error?: string;
        updated?: number;
        failed?: Array<{ id: string; error: string }>;
      };
      if (!res.ok || !j.ok) {
        setErr(j.error ?? "עדכון מרובה נכשל");
        return;
      }
      const failCount = Array.isArray(j.failed) ? j.failed.length : 0;
      setToastMessage(
        failCount > 0
          ? `עודכנו ${j.updated ?? 0} הזדמנויות (${failCount} נכשלו)`
          : `עודכנו ${j.updated ?? 0} הזדמנויות`
      );
      setSelectedOppIds([]);
      await mutatePipeline();
    } finally {
      setBulkBusy(null);
    }
  }

  async function confirmBulkDelete() {
    if (bulkDeleteConfirm.trim() !== "DELETE") return;
    const ids = [...selectedOppIds];
    if (ids.length === 0) return;
    setBulkBusy("delete");
    try {
      const res = await fetch("/api/opportunities/bulk", {
        method: "DELETE",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ids, confirm: "DELETE" }),
      });
      const j = (await res.json().catch(() => ({}))) as {
        ok?: boolean;
        error?: string;
        deleted?: number;
        failed?: Array<{ id: string; error: string }>;
      };
      if (!res.ok || !j.ok) {
        setErr(j.error ?? "מחיקה מרובה נכשלה");
        return;
      }
      const failCount = Array.isArray(j.failed) ? j.failed.length : 0;
      setToastMessage(
        failCount > 0
          ? `נמחקו ${j.deleted ?? 0} הזדמנויות (${failCount} נכשלו)`
          : `נמחקו ${j.deleted ?? 0} הזדמנויות`
      );
      setBulkDeleteOpen(false);
      setBulkDeleteConfirm("");
      setSelectedOppIds([]);
      if (selectedOpp && ids.includes(selectedOpp.id)) {
        setSelectedOpp(null);
      }
      await mutatePipeline();
    } finally {
      setBulkBusy(null);
    }
  }

  function moveOppColumn(from: number, to: number) {
    if (from === to || from < 0 || to < 0) return;
    setOppColumnOrder((arr) => {
      if (to >= arr.length || from >= arr.length) return arr;
      const next = [...arr];
      const [moved] = next.splice(from, 1);
      next.splice(to, 0, moved);
      return next;
    });
  }

  function openPipelineEdit(p: Pipeline) {
    setEditPipelineId(p.id);
    setEditPipelineName(p.name);
    setEditStages(p.stages.length ? [...p.stages] : [""]);
    setPipelineMenuOpenId(null);
    setEditPipelineOpen(true);
  }

  async function savePipelineEdit() {
    if (!editPipelineId) return;
    const res = await fetch(
      `/api/opportunities/pipelines/${encodeURIComponent(editPipelineId)}`,
      {
        method: "PATCH",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: editPipelineName,
          stages: editStages,
        }),
      }
    );
    const j = (await res.json().catch(() => ({}))) as {
      ok?: boolean;
      error?: string;
    };
    if (!res.ok || !j.ok) {
      setErr(j.error ?? "עדכון פייפליין נכשל");
      return;
    }
    setEditPipelineOpen(false);
    setEditPipelineId(null);
    await mutatePipeline();
  }

  function moveEditStage(from: number, to: number) {
    if (from === to || from < 0 || to < 0) return;
    setEditStages((arr) => {
      if (to >= arr.length) return arr;
      const next = [...arr];
      const [moved] = next.splice(from, 1);
      next.splice(to, 0, moved);
      return next;
    });
  }

  async function duplicatePipelineById(id: string) {
    const res = await fetch(
      `/api/opportunities/pipelines/${encodeURIComponent(id)}`,
      {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "duplicate" }),
      }
    );
    const j = (await res.json().catch(() => ({}))) as {
      ok?: boolean;
      error?: string;
      pipeline?: Pipeline;
    };
    if (!res.ok || !j.ok) {
      setErr(j.error ?? "שכפול פייפליין נכשל");
      return;
    }
    setPipelineMenuOpenId(null);
    await mutatePipeline();
  }

  async function deletePipelineById(id: string) {
    const ok = window.confirm("למחוק את הפייפליין הזה?");
    if (!ok) return;
    const res = await fetch(
      `/api/opportunities/pipelines/${encodeURIComponent(id)}`,
      {
        method: "DELETE",
        credentials: "include",
      }
    );
    const j = (await res.json().catch(() => ({}))) as {
      ok?: boolean;
      error?: string;
    };
    if (!res.ok || !j.ok) {
      setErr(j.error ?? "מחיקת פייפליין נכשלה");
      return;
    }
    setPipelineMenuOpenId(null);
    if (selectedPipelineId === id) {
      setSelectedPipelineId("");
    }
    await mutatePipeline();
  }

  return (
    <div style={{ width: "100%", maxWidth: "100%", minWidth: 0 }}>
      <div style={{ display: "flex", alignItems: "center", gap: 12, flexWrap: "wrap", marginBottom: 12 }}>
        <h1 style={{ margin: 0, fontSize: 24, fontWeight: 900 }}>ניהול הזדמנויות</h1>
        <div style={{ display: "inline-flex", background: "#fff", border: "1px solid #e5e7eb", borderRadius: 12, padding: 4 }}>
          <button type="button" onClick={() => setTab("opportunities")} style={{ padding: "8px 12px", border: "none", borderRadius: 8, background: tab === "opportunities" ? "#e9d5ff" : "transparent", fontWeight: 800, cursor: "pointer" }}>
            הזדמנויות
          </button>
          <button type="button" onClick={() => setTab("pipelines")} style={{ padding: "8px 12px", border: "none", borderRadius: 8, background: tab === "pipelines" ? "#e9d5ff" : "transparent", fontWeight: 800, cursor: "pointer" }}>
            פייפליינים
          </button>
        </div>
        <div style={{ flex: 1 }} />

        {tab === "opportunities" && (
          <>
            <span style={{ fontWeight: 800, color: "#0c4a6e", background: "#e0f2fe", borderRadius: 999, padding: "4px 10px", fontSize: 12 }}>
              {oppForSelectedPipeline.length} opportunities
            </span>
            <select value={selectedPipelineId} onChange={(e) => setSelectedPipelineId(e.target.value)} style={{ padding: "10px 12px", borderRadius: 12, border: "1px solid #e5e7eb", minWidth: 220 }}>
              {pipelines.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.name}
                </option>
              ))}
            </select>
            <div style={{ display: "inline-flex", borderRadius: 10, border: "1px solid #e5e7eb", overflow: "hidden", background: "#fff" }}>
              <button type="button" onClick={() => setViewMode("board")} style={{ border: "none", background: viewMode === "board" ? "#e0f2fe" : "transparent", padding: "8px 10px", cursor: "pointer", fontWeight: 800 }}>
                ◫
              </button>
              <button type="button" onClick={() => setViewMode("list")} style={{ border: "none", background: viewMode === "list" ? "#e0f2fe" : "transparent", padding: "8px 10px", cursor: "pointer", fontWeight: 800 }}>
                ≣
              </button>
            </div>
            <button type="button" onClick={() => { setCreateOpportunityOpen(true); setNewOppContactId((contacts[0]?.id as string) || ""); setNewOppStage(selectedPipeline?.stages?.[0] || "New Lead"); }} style={{ padding: "10px 12px", borderRadius: 12, border: "none", background: "linear-gradient(180deg, #a78bfa 0%, #6d28d9 100%)", color: "#fff", cursor: "pointer", fontWeight: 800 }}>
              + Add opportunity
            </button>
            <button
              type="button"
              onClick={() => setManageOppColsOpen(true)}
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
          </>
        )}

        {tab === "pipelines" && (
          <button type="button" onClick={() => setCreatePipelineOpen(true)} style={{ padding: "10px 12px", borderRadius: 12, border: "none", background: "linear-gradient(180deg, #a78bfa 0%, #6d28d9 100%)", color: "#fff", cursor: "pointer", fontWeight: 800 }}>
            Create Pipeline +
          </button>
        )}
      </div>

      {err && <div style={{ marginTop: 14, background: "#fef2f2", border: "1px solid #fecaca", color: "#b91c1c", padding: 12, borderRadius: 12 }}>{err}</div>}
      {loading && <div style={{ color: "#6b7280", fontWeight: 700 }}>טוען...</div>}

      {tab === "opportunities" && (
        <>
          {viewMode === "list" && selectedOppIds.length > 0 && (
            <div
              style={{
                marginTop: 14,
                background: "#fff",
                border: "1px solid #e5e7eb",
                borderRadius: 14,
                padding: 12,
                display: "flex",
                alignItems: "center",
                gap: 8,
                flexWrap: "wrap",
              }}
            >
              <div style={{ fontWeight: 900, marginInlineEnd: 6 }}>
                נבחרו {selectedOppIds.length} הזדמנויות
              </div>
              <select
                value={bulkStage}
                onChange={(e) => setBulkStage(e.target.value)}
                style={{ padding: "8px 10px", borderRadius: 10, border: "1px solid #e5e7eb" }}
              >
                <option value="">ללא שינוי שלב</option>
                {(selectedPipeline?.stages ?? []).map((s) => (
                  <option key={s} value={s}>
                    {s}
                  </option>
                ))}
              </select>
              <select
                value={bulkStatus}
                onChange={(e) =>
                  setBulkStatus((e.target.value as "" | "פתוח" | "זכיה" | "הפסד") ?? "")
                }
                style={{ padding: "8px 10px", borderRadius: 10, border: "1px solid #e5e7eb" }}
              >
                <option value="">ללא שינוי סטטוס</option>
                <option value="פתוח">פתוח</option>
                <option value="זכיה">זכיה</option>
                <option value="הפסד">הפסד</option>
              </select>
              <select
                value={bulkAssignedRep}
                onChange={(e) => setBulkAssignedRep(e.target.value)}
                style={{ padding: "8px 10px", borderRadius: 10, border: "1px solid #e5e7eb" }}
              >
                <option value="__NO_CHANGE__">ללא שינוי שיוך</option>
                <option value="__CLEAR__">נקה שיוך</option>
                {adminUsers.map((u) => (
                  <option key={u.email} value={u.email}>
                    {u.name?.trim() || u.email}
                  </option>
                ))}
              </select>
              <button
                type="button"
                onClick={() => void applyBulkUpdate()}
                disabled={bulkBusy !== null}
                style={{
                  padding: "8px 12px",
                  borderRadius: 10,
                  border: "1px solid #d1d5db",
                  background: "#fff",
                  cursor: bulkBusy === null ? "pointer" : "not-allowed",
                  fontWeight: 800,
                }}
              >
                החל עדכון מרובה
              </button>
              <button
                type="button"
                onClick={() => setBulkDeleteOpen(true)}
                disabled={bulkBusy !== null}
                style={{
                  padding: "8px 12px",
                  borderRadius: 10,
                  border: "none",
                  background: "#b91c1c",
                  color: "#fff",
                  cursor: bulkBusy === null ? "pointer" : "not-allowed",
                  fontWeight: 800,
                }}
              >
                מחיקה מרובה
              </button>
              <button
                type="button"
                onClick={() => setSelectedOppIds([])}
                disabled={bulkBusy !== null}
                style={{
                  padding: "8px 12px",
                  borderRadius: 10,
                  border: "1px solid #e5e7eb",
                  background: "#fff",
                  cursor: bulkBusy === null ? "pointer" : "not-allowed",
                  fontWeight: 700,
                }}
              >
                נקה בחירה
              </button>
            </div>
          )}
          {viewMode === "list" ? (
            <div
              style={{
                marginTop: 14,
                background: "#fff",
                border: "1px solid #e5e7eb",
                borderRadius: 16,
                width: "100%",
                maxWidth: "100%",
                overflowX: "auto",
                overflowY: "hidden",
              }}
            >
              <table style={{ width: "100%", borderCollapse: "collapse", minWidth: 980 }}>
                <thead>
                  <tr>
                    <th
                      style={{
                        textAlign: "center",
                        padding: "8px 10px",
                        borderBottom: "2px solid #e5e7eb",
                        background: "#f8fafc",
                        width: 46,
                        minWidth: 46,
                      }}
                    >
                      <input
                        type="checkbox"
                        checked={filteredSortedOpps.length > 0 && selectedVisibleCount === filteredSortedOpps.length}
                        onChange={(e) => toggleSelectAllVisible(e.target.checked)}
                        aria-label="בחירת כל ההזדמנויות המוצגות"
                      />
                    </th>
                    {oppDisplayCols.map((h) => (
                      <th key={h} style={{ textAlign: "right", padding: "8px 10px", borderBottom: "2px solid #e5e7eb", background: "#f8fafc", fontSize: 12, fontWeight: 900, whiteSpace: "nowrap", minWidth: oppColWidths[h] ?? oppDefaultColWidth(h), width: oppColWidths[h] ?? oppDefaultColWidth(h), position: "relative", verticalAlign: "top" }}>
                        <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                          <span>{opportunityFieldLabel(h)}</span>
                          <button
                            type="button"
                            onClick={() => toggleSort(h)}
                            style={{ border: "1px solid #e5e7eb", background: "#fff", borderRadius: 6, padding: "0 6px", cursor: "pointer", fontSize: 11, fontWeight: 800 }}
                            title="מיון עולה/יורד"
                          >
                            {oppSort?.col === h ? (oppSort.dir === "asc" ? "↑" : "↓") : "↕"}
                          </button>
                        </div>
                        <input
                          value={oppColFilters[h] ?? ""}
                          onChange={(e) =>
                            setOppColFilters((prev) => ({ ...prev, [h]: e.target.value }))
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
                  {filteredSortedOpps.map((o) => (
                    <tr
                      key={o.id}
                      style={{
                        backgroundColor: opportunityIsLossStatus(o) ? "#fff0f1" : "#ffffff",
                        borderBottom: opportunityIsLossStatus(o)
                          ? "1px solid #f5a8a8"
                          : "1px solid #e8e8ea",
                      }}
                    >
                      <td style={{ padding: "10px 12px", textAlign: "center", width: 46, minWidth: 46 }}>
                        <input
                          type="checkbox"
                          checked={selectedOppIds.includes(o.id)}
                          onChange={(e) => toggleOppSelection(o.id, e.target.checked)}
                          aria-label={`בחירת הזדמנות ${o.name}`}
                        />
                      </td>
                      {oppDisplayCols.map((col, idx) => (
                        <td
                          key={col}
                          style={{
                            padding: "10px 12px",
                            borderBottom: "none",
                            minWidth: oppColWidths[col] ?? oppDefaultColWidth(col),
                            width: oppColWidths[col] ?? oppDefaultColWidth(col),
                            whiteSpace: columnIntegrationKind(col) === "phone" ? "nowrap" : undefined,
                          }}
                        >
                          {col === "name" ? (
                            <TableCellClamp>
                              <button type="button" onClick={() => void openOpportunityDetail(o.id)} style={{ border: "none", background: "transparent", cursor: "pointer", color: "#4c1d95", fontWeight: 800, padding: 0, textAlign: "right", width: "100%" }}>
                                {opportunityCell(o, col)}
                              </button>
                            </TableCellClamp>
                          ) : editingCell?.id === o.id && editingCell.col === col ? (
                            col === "stage" ? (
                              <select
                                autoFocus
                                value={editingCell.value}
                                onChange={(e) =>
                                  setEditingCell((x) => (x ? { ...x, value: e.target.value } : x))
                                }
                                onBlur={() => {
                                  void commitInlineEdit(o, col, editingCell.value);
                                  setEditingCell(null);
                                }}
                                style={{ width: "100%", padding: "7px 8px", borderRadius: 8, border: "1px solid #e5e7eb" }}
                              >
                                {(pipelines.find((p) => p.id === o.pipelineId)?.stages ?? []).map((s) => (
                                  <option key={s} value={s}>{s}</option>
                                ))}
                              </select>
                            ) : col === "status" ? (
                              <select
                                autoFocus
                                value={editingCell.value || "פתוח"}
                                onChange={(e) =>
                                  setEditingCell((x) => (x ? { ...x, value: e.target.value } : x))
                                }
                                onBlur={() => {
                                  void commitInlineEdit(o, col, editingCell.value);
                                  setEditingCell(null);
                                }}
                                style={{ width: "100%", padding: "7px 8px", borderRadius: 8, border: "1px solid #e5e7eb" }}
                              >
                                {["פתוח", "זכיה", "הפסד"].map((s) => (
                                  <option key={s} value={s}>{s}</option>
                                ))}
                              </select>
                            ) : col === "assignedRep" ? (
                              <select
                                autoFocus
                                value={editingCell.value}
                                onChange={(e) =>
                                  setEditingCell((x) => (x ? { ...x, value: e.target.value } : x))
                                }
                                onBlur={() => {
                                  void commitInlineEdit(o, col, editingCell.value);
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
                                type={col === MOVER_OPPORTUNITY_FIELD_IDS.leadsCount ? "number" : "text"}
                                min={col === MOVER_OPPORTUNITY_FIELD_IDS.leadsCount ? 0 : undefined}
                                inputMode={col === MOVER_OPPORTUNITY_FIELD_IDS.leadsCount ? "numeric" : undefined}
                                value={editingCell.value}
                                onChange={(e) =>
                                  setEditingCell((x) => (x ? { ...x, value: e.target.value } : x))
                                }
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
                              {INLINE_READONLY.has(col) ? (
                                <span
                                  style={{
                                    display: "block",
                                    textAlign: "right",
                                    wordBreak: columnIntegrationKind(col) === "phone" ? "normal" : "break-word",
                                    whiteSpace: columnIntegrationKind(col) === "phone" ? "nowrap" : undefined,
                                    color: "#374151",
                                  }}
                                >
                                  {opportunityCell(o, col)}
                                </span>
                              ) : (
                                <InlineFieldShell
                                  integration={columnIntegrationKind(col)}
                                  rawValue={opportunityCell(o, col)}
                                  label={
                                    col === "tags" ? (
                                      <LabelPills labels={o.labels ?? []} />
                                    ) : (
                                      opportunityCell(o, col)
                                    )
                                  }
                                  onEdit={() => startInlineEdit(o, col)}
                                />
                              )}
                            </TableCellClamp>
                          )}
                        </td>
                      ))}
                    </tr>
                  ))}
                  {!loading && filteredSortedOpps.length === 0 && <tr><td colSpan={Math.max(oppDisplayCols.length + 1, 1)} style={{ padding: 16, color: "#6b7280", fontWeight: 700 }}>אין הזדמנויות בפייפליין הנבחר.</td></tr>}
                </tbody>
              </table>
            </div>
          ) : (
            <div
              style={{
                marginTop: 14,
                background: "#fff",
                border: "1px solid #e5e7eb",
                borderRadius: 16,
                width: "100%",
                maxWidth: "100%",
                overflowX: "hidden",
                overflowY: "hidden",
                padding: 10,
              }}
            >
              <div style={{ overflowX: "auto", overflowY: "hidden", width: "100%", paddingBottom: 6 }}>
                <div style={{ display: "flex", gap: 12, minWidth: 980 }}>
                {(selectedPipeline?.stages ?? []).map((stage) => {
                  const list = grouped[stage] ?? [];
                  return (
                    <div key={stage} style={{ flex: "0 0 360px", minWidth: 360, maxWidth: 360, background: "#fff", border: "1px solid #e5e7eb", borderRadius: 16, padding: 12 }}>
                      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 10 }}>
                        <div style={{ fontWeight: 900 }}>{stage}</div>
                        <div style={{ background: "#f5f3ff", border: "1px solid #e9d5ff", padding: "4px 8px", borderRadius: 999, fontWeight: 900, color: "#6d28d9" }}>{list.length}</div>
                      </div>
                      <div style={{ marginTop: 10, display: "grid", gap: 8, minHeight: 90 }}
                        onDragOver={(e) => e.preventDefault()}
                        onDrop={(e) => {
                          const oppId = e.dataTransfer.getData("text/opportunity-id");
                          if (oppId) void onDropOpportunity(oppId, stage);
                        }}
                      >
                        {list.length === 0 ? (
                          <div style={{ color: "#9ca3af", fontWeight: 700, fontSize: 12 }}>אין הזדמנויות כאן</div>
                        ) : (
                          list.map((o) => (
                            <div
                              key={o.id}
                              draggable
                              onDragStart={(e) => e.dataTransfer.setData("text/opportunity-id", o.id)}
                              style={{
                                border: opportunityIsLossStatus(o) ? "1px solid #f9a8a8" : "1px solid #f3f4f6",
                                borderRadius: 12,
                                padding: 10,
                                backgroundColor: opportunityIsLossStatus(o) ? "#fff0f1" : "#fafafa",
                                boxShadow: opportunityIsLossStatus(o)
                                  ? "inset 0 0 0 1px rgba(248, 113, 113, 0.12)"
                                  : undefined,
                                cursor: "grab",
                              }}
                            >
                              <button type="button" onClick={() => void openOpportunityDetail(o.id)} style={{ border: "none", background: "transparent", padding: 0, textAlign: "right", cursor: "pointer", fontWeight: 900, fontSize: 12, wordBreak: "break-word", color: "#111827" }}>{o.name}</button>
                              <div style={{ marginTop: 6, display: "grid", gap: 4 }}>
                                {boardPreviewFields.slice(0, 5).map((f) => (
                                  <div key={`${o.id}-${f}`} style={{ fontSize: 12, color: "#4b5563", display: "flex", gap: 6, alignItems: "center", flexWrap: "wrap" }}>
                                    <span style={{ fontWeight: 800 }}>{opportunityFieldLabel(f)}:</span>
                                    {boardPreviewCell(o, f)}
                                  </div>
                                ))}
                                {boardPreviewFields.length === 0 && (
                                  <div style={{ fontSize: 12, color: "#6b7280", display: "flex", alignItems: "center", gap: 6, flexWrap: "wrap" }}>
                                    <span>
                                      {o.contactName || o.contactEmail || o.contactPhone || o.contactId}
                                    </span>
                                    {(o.contactPhone?.trim() || o.phone?.trim()) ? (
                                      <WhatsAppIconLink
                                        phone={(o.contactPhone?.trim() ? o.contactPhone : o.phone) as string}
                                        size={16}
                                      />
                                    ) : null}
                                  </div>
                                )}
                              </div>
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
        </>
      )}

      {tab === "pipelines" && (
        <div
          style={{
            marginTop: 14,
            background: "#fff",
            border: "1px solid #e5e7eb",
            borderRadius: 16,
            width: "100%",
            maxWidth: "100%",
            overflowX: "auto",
            overflowY: "visible",
            paddingBottom: 100,
          }}
        >
          <table style={{ width: "100%", borderCollapse: "collapse", minWidth: 860 }}>
            <thead>
              <tr>
                {["Actions", "Updated On", "No. of stages", "Pipeline name"].map((h) => (
                  <th key={h} style={{ textAlign: "right", padding: "10px 12px", borderBottom: "2px solid #e5e7eb", background: "#f8fafc", fontSize: 12, fontWeight: 900, whiteSpace: "nowrap" }}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {pipelines.map((p, rowIdx) => (
                <tr key={p.id}>
                  <td style={{ padding: "10px 12px", borderBottom: "1px solid #f3f4f6", position: "relative", verticalAlign: "top" }}>
                    <button
                      type="button"
                      onClick={() => setPipelineMenuOpenId((x) => (x === p.id ? null : p.id))}
                      style={{ border: "1px solid #e5e7eb", borderRadius: 8, background: "#fff", padding: "4px 8px", cursor: "pointer" }}
                      title="פעולות"
                    >
                      ⋮
                    </button>
                    {pipelineMenuOpenId === p.id && (
                      <div
                        style={{
                          position: "absolute",
                          ...(rowIdx === pipelines.length - 1
                            ? { bottom: "100%", top: "auto", marginBottom: 6 }
                            : { top: 34, bottom: "auto" }),
                          right: 12,
                          background: "#fff",
                          border: "1px solid #e5e7eb",
                          borderRadius: 10,
                          boxShadow: "0 12px 24px rgba(0,0,0,0.08)",
                          padding: 6,
                          zIndex: 50,
                          minWidth: 160,
                        }}
                      >
                        <button type="button" onClick={() => openPipelineEdit(p)} style={{ display: "block", width: "100%", textAlign: "right", border: "none", background: "transparent", padding: "8px 10px", cursor: "pointer" }}>
                          עריכת פייפליין
                        </button>
                        <button type="button" onClick={() => void duplicatePipelineById(p.id)} style={{ display: "block", width: "100%", textAlign: "right", border: "none", background: "transparent", padding: "8px 10px", cursor: "pointer" }}>
                          שכפול
                        </button>
                        <button type="button" onClick={() => void deletePipelineById(p.id)} style={{ display: "block", width: "100%", textAlign: "right", border: "none", background: "transparent", padding: "8px 10px", cursor: "pointer", color: "#b91c1c" }}>
                          מחיקה
                        </button>
                      </div>
                    )}
                  </td>
                  <td style={{ padding: "10px 12px", borderBottom: "1px solid #f3f4f6" }}>
                    {p.updatedAt ? String(p.updatedAt).slice(0, 10) : "—"}
                  </td>
                  <td style={{ padding: "10px 12px", borderBottom: "1px solid #f3f4f6" }}>
                    {p.stages.length}
                  </td>
                  <td style={{ padding: "10px 12px", borderBottom: "1px solid #f3f4f6" }}>
                    <div style={{ fontWeight: 800 }}>{p.name}</div>
                    <div style={{ fontSize: 12, color: "#6b7280", marginTop: 2 }}>{p.stages.join(" -> ")}</div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {createPipelineOpen && (
        <div style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.2)", display: "grid", placeItems: "center", zIndex: 80 }} onMouseDown={() => setCreatePipelineOpen(false)}>
          <div style={{ width: "min(760px, 94vw)", background: "#fff", borderRadius: 16, border: "1px solid #e5e7eb", padding: 16 }} onMouseDown={(e) => e.stopPropagation()}>
            <h3 style={{ margin: 0, marginBottom: 10 }}>Create Pipeline</h3>
            <input value={newPipelineName} onChange={(e) => setNewPipelineName(e.target.value)} placeholder="Pipeline name" style={{ width: "100%", padding: "10px 12px", borderRadius: 12, border: "1px solid #e5e7eb", marginBottom: 10 }} />
            <div style={{ display: "grid", gap: 8 }}>
              {newPipelineStages.map((s, i) => (
                <div key={i} style={{ display: "grid", gridTemplateColumns: "1fr auto", gap: 8 }}>
                  <input value={s} onChange={(e) => setNewPipelineStages((arr) => arr.map((x, idx) => (idx === i ? e.target.value : x)))} placeholder={`Stage ${i + 1}`} style={{ padding: "10px 12px", borderRadius: 12, border: "1px solid #e5e7eb" }} />
                  <button type="button" onClick={() => setNewPipelineStages((arr) => arr.filter((_, idx) => idx !== i))} style={{ padding: "10px 12px", borderRadius: 12, border: "1px solid #e5e7eb", background: "#fff", cursor: "pointer" }}>מחק</button>
                </div>
              ))}
            </div>
            <div style={{ marginTop: 8 }}>
              <button type="button" onClick={() => setNewPipelineStages((arr) => [...arr, ""])} style={{ padding: "8px 10px", borderRadius: 10, border: "1px solid #e5e7eb", background: "#fff", cursor: "pointer" }}>Add stage +</button>
            </div>
            <div style={{ marginTop: 12, display: "flex", gap: 8 }}>
              <button type="button" onClick={() => void createPipeline()} style={{ padding: "10px 12px", borderRadius: 12, border: "none", background: "linear-gradient(180deg, #a78bfa 0%, #6d28d9 100%)", color: "#fff", cursor: "pointer", fontWeight: 800 }}>Create</button>
              <button type="button" onClick={() => setCreatePipelineOpen(false)} style={{ padding: "10px 12px", borderRadius: 12, border: "1px solid #e5e7eb", background: "#fff", cursor: "pointer" }}>Cancel</button>
            </div>
          </div>
        </div>
      )}

      {editPipelineOpen && (
        <div style={{ position: "fixed", inset: 0, zIndex: 90 }}>
          <div
            style={{ position: "absolute", inset: 0, background: "rgba(0,0,0,0.2)" }}
            onMouseDown={() => setEditPipelineOpen(false)}
          />
          <div
            style={{
              position: "absolute",
              top: 0,
              right: 0,
              width: "min(520px, 94vw)",
              height: "100%",
              background: "#fff",
              borderLeft: "1px solid #e5e7eb",
              boxShadow: "-12px 0 30px rgba(0,0,0,0.08)",
              padding: 16,
              overflow: "auto",
            }}
            onMouseDown={(e) => e.stopPropagation()}
          >
            <h3 style={{ margin: 0, marginBottom: 10 }}>עריכת פייפליין</h3>
            <input
              value={editPipelineName}
              onChange={(e) => setEditPipelineName(e.target.value)}
              placeholder="שם פייפליין"
              style={{ width: "100%", padding: "10px 12px", borderRadius: 12, border: "1px solid #e5e7eb", marginBottom: 10 }}
            />
            <div style={{ display: "grid", gap: 8 }}>
              {editStages.map((s, i) => (
                <div
                  key={`stage-${i}`}
                  draggable
                  onDragStart={() => setEditDragIndex(i)}
                  onDragOver={(e) => e.preventDefault()}
                  onDrop={() => {
                    if (editDragIndex != null) moveEditStage(editDragIndex, i);
                    setEditDragIndex(null);
                  }}
                  style={{
                    display: "grid",
                    gridTemplateColumns: "auto 1fr auto",
                    gap: 8,
                    alignItems: "center",
                    border: "1px solid #f3f4f6",
                    borderRadius: 10,
                    padding: 6,
                  }}
                >
                  <span style={{ cursor: "grab", opacity: 0.7 }} title="גרור לשינוי סדר">
                    ⋮⋮
                  </span>
                  <input
                    value={s}
                    onChange={(e) =>
                      setEditStages((arr) => arr.map((x, idx) => (idx === i ? e.target.value : x)))
                    }
                    placeholder={`Stage ${i + 1}`}
                    style={{ padding: "9px 10px", borderRadius: 10, border: "1px solid #e5e7eb" }}
                  />
                  <button
                    type="button"
                    onClick={() => {
                      if (editStages.length <= 1) {
                        window.alert("פייפליין חייב להכיל לפחות שלב אחד.");
                        return;
                      }
                      const prevStage = editStages[i - 1] || editStages[0];
                      const ok = window.confirm(
                        `למחוק את השלב "${s}"?\nההזדמנויות בשלב זה יעברו לשלב הקודם: "${prevStage}".`
                      );
                      if (!ok) return;
                      setEditStages((arr) => arr.filter((_, idx) => idx !== i));
                    }}
                    style={{ padding: "9px 10px", borderRadius: 10, border: "1px solid #e5e7eb", background: "#fff", cursor: "pointer", color: "#b91c1c" }}
                    title="מחק שלב"
                  >
                    מחק
                  </button>
                </div>
              ))}
            </div>
            <div style={{ marginTop: 8 }}>
              <button
                type="button"
                onClick={() => setEditStages((arr) => [...arr, ""])}
                style={{ padding: "8px 10px", borderRadius: 10, border: "1px solid #e5e7eb", background: "#fff", cursor: "pointer" }}
              >
                Add Stage +
              </button>
            </div>
            <div style={{ marginTop: 14, display: "flex", gap: 8 }}>
              <button
                type="button"
                onClick={() => void savePipelineEdit()}
                style={{ padding: "10px 12px", borderRadius: 12, border: "none", background: "linear-gradient(180deg, #a78bfa 0%, #6d28d9 100%)", color: "#fff", cursor: "pointer", fontWeight: 800 }}
              >
                שמור שינויים
              </button>
              <button
                type="button"
                onClick={() => setEditPipelineOpen(false)}
                style={{ padding: "10px 12px", borderRadius: 12, border: "1px solid #e5e7eb", background: "#fff", cursor: "pointer" }}
              >
                ביטול
              </button>
            </div>
          </div>
        </div>
      )}

      {createOpportunityOpen && (
        <div style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.2)", display: "grid", placeItems: "center", zIndex: 80 }} onMouseDown={() => setCreateOpportunityOpen(false)}>
          <div style={{ width: "min(620px, 94vw)", background: "#fff", borderRadius: 16, border: "1px solid #e5e7eb", padding: 16 }} onMouseDown={(e) => e.stopPropagation()}>
            <h3 style={{ margin: 0, marginBottom: 10 }}>Add opportunity</h3>
            <div style={{ display: "grid", gap: 8 }}>
              <input value={newOppName} onChange={(e) => setNewOppName(e.target.value)} placeholder="Opportunity name" style={{ padding: "10px 12px", borderRadius: 12, border: "1px solid #e5e7eb" }} />
              <select value={newOppContactId} onChange={(e) => setNewOppContactId(e.target.value)} style={{ padding: "10px 12px", borderRadius: 12, border: "1px solid #e5e7eb" }}>
                {contacts.map((c) => (
                  <option key={(c.id || c.email || c.phone) as string} value={c.id}>
                    {(c.name || c.email || c.phone || c.id) as string}
                  </option>
                ))}
              </select>
              <select value={newOppStage} onChange={(e) => setNewOppStage(e.target.value)} style={{ padding: "10px 12px", borderRadius: 12, border: "1px solid #e5e7eb" }}>
                {(selectedPipeline?.stages ?? []).map((s) => (
                  <option key={s} value={s}>
                    {s}
                  </option>
                ))}
              </select>
              <select value={newOppStatus} onChange={(e) => setNewOppStatus(e.target.value as "פתוח" | "זכיה" | "הפסד")} style={{ padding: "10px 12px", borderRadius: 12, border: "1px solid #e5e7eb" }}>
                {["פתוח", "זכיה", "הפסד"].map((s) => (
                  <option key={s} value={s}>{s}</option>
                ))}
              </select>
              <select value={newOppAssignedRep} onChange={(e) => setNewOppAssignedRep(e.target.value)} style={{ padding: "10px 12px", borderRadius: 12, border: "1px solid #e5e7eb" }}>
                <option value="">נציג משויך</option>
                {adminUsers.map((u) => (
                  <option key={u.email} value={u.email}>{u.name?.trim() || u.email}</option>
                ))}
              </select>
              <div style={{ marginTop: 4 }}>
                <div style={{ fontSize: 12, fontWeight: 800, marginBottom: 6 }}>תגיות</div>
                <LabelPicker
                  labels={catalogLabels}
                  selectedIds={newOppLabelIds}
                  onToggle={(id) =>
                    setNewOppLabelIds((prev) =>
                      prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]
                    )
                  }
                  onCreate={async (name, color) => {
                    const res = await fetch("/api/labels", {
                      method: "POST",
                      credentials: "include",
                      headers: { "Content-Type": "application/json" },
                      body: JSON.stringify({ name, color }),
                    });
                    const j = (await res.json().catch(() => ({}))) as {
                      ok?: boolean;
                      label?: { id: string; name: string; color: string };
                    };
                    if (!res.ok || !j.ok || !j.label) throw new Error("יצירת תגית נכשלה");
                    setCatalogLabels((prev) => [...prev, j.label!].sort((a, b) => a.name.localeCompare(b.name, "he")));
                    setNewOppLabelIds((prev) => [...prev, j.label!.id]);
                  }}
                  maxHeight={200}
                />
              </div>
            </div>
            <div style={{ marginTop: 12, display: "flex", gap: 8 }}>
              <button type="button" onClick={() => void createOpportunity()} style={{ padding: "10px 12px", borderRadius: 12, border: "none", background: "linear-gradient(180deg, #a78bfa 0%, #6d28d9 100%)", color: "#fff", cursor: "pointer", fontWeight: 800 }}>Create</button>
              <button type="button" onClick={() => setCreateOpportunityOpen(false)} style={{ padding: "10px 12px", borderRadius: 12, border: "1px solid #e5e7eb", background: "#fff", cursor: "pointer" }}>Cancel</button>
            </div>
          </div>
        </div>
      )}

      {labelPickOppId && (
        <div style={{ position: "fixed", inset: 0, zIndex: 95, background: "rgba(0,0,0,0.25)", display: "grid", placeItems: "center" }} onMouseDown={() => setLabelPickOppId(null)}>
          <div
            style={{ width: "min(400px, 94vw)", background: "#fff", borderRadius: 16, border: "1px solid #e5e7eb", padding: 16, maxHeight: "90vh", overflow: "auto" }}
            onMouseDown={(e) => e.stopPropagation()}
          >
            <h3 style={{ margin: "0 0 12px", fontSize: 16 }}>תגיות להזדמנות</h3>
            <LabelPicker
              labels={catalogLabels}
              selectedIds={labelPickDraft}
              onToggle={(id) =>
                setLabelPickDraft((prev) =>
                  prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]
                )
              }
              onCreate={async (name, color) => {
                const res = await fetch("/api/labels", {
                  method: "POST",
                  credentials: "include",
                  headers: { "Content-Type": "application/json" },
                  body: JSON.stringify({ name, color }),
                });
                const j = (await res.json().catch(() => ({}))) as {
                  ok?: boolean;
                  label?: { id: string; name: string; color: string };
                };
                if (!res.ok || !j.ok || !j.label) throw new Error("יצירת תגית נכשלה");
                setCatalogLabels((prev) => [...prev, j.label!].sort((a, b) => a.name.localeCompare(b.name, "he")));
                setLabelPickDraft((prev) => [...prev, j.label!.id]);
              }}
            />
            <div style={{ marginTop: 14, display: "flex", gap: 8, justifyContent: "flex-end" }}>
              <button
                type="button"
                onClick={() => setLabelPickOppId(null)}
                style={{ padding: "8px 12px", borderRadius: 10, border: "1px solid #e5e7eb", background: "#fff", cursor: "pointer" }}
              >
                ביטול
              </button>
              <button
                type="button"
                onClick={() => {
                  const id = labelPickOppId;
                  if (!id) return;
                  void saveOpportunityPatch(id, { labelIds: labelPickDraft });
                  setLabelPickOppId(null);
                }}
                style={{
                  padding: "8px 12px",
                  borderRadius: 10,
                  border: "none",
                  background: "linear-gradient(180deg, #a78bfa 0%, #6d28d9 100%)",
                  color: "#fff",
                  fontWeight: 800,
                  cursor: "pointer",
                }}
              >
                שמור
              </button>
            </div>
          </div>
        </div>
      )}

      {manageOppColsOpen && (
        <div style={{ position: "fixed", inset: 0, zIndex: 90 }}>
          <div style={{ position: "absolute", inset: 0, background: "rgba(0,0,0,0.2)" }} onMouseDown={() => setManageOppColsOpen(false)} />
          <div style={{ position: "absolute", top: 0, right: 0, height: "100%", width: "min(420px, 94vw)", overflow: "auto", background: "#fff", borderLeft: "1px solid #e5e7eb", padding: 16 }} onMouseDown={(e) => e.stopPropagation()}>
            <h3 style={{ margin: 0, marginBottom: 10 }}>
              {viewMode === "board" ? "ניהול שדות (תצוגת פייפליין)" : "ניהול עמודות (הזדמנויות)"}
            </h3>
            {viewMode === "board" ? (
              <div style={{ display: "grid", gap: 8 }}>
                <div style={{ fontSize: 12, color: "#6b7280", marginBottom: 4 }}>
                  אפשר לבחור עד 5 שדות לתצוגה מקדימה על הכרטיס.
                </div>
                {[...BASE_OPP_COLS, ...oppCustomFieldIds]
                  .filter((h) => h !== "name")
                  .map((h) => {
                    const selected = boardPreviewFields.includes(h);
                    const maxReached = boardPreviewFields.length >= 5 && !selected;
                    return (
                      <label
                        key={h}
                        style={{
                          display: "flex",
                          alignItems: "center",
                          gap: 8,
                          border: "1px solid #f3f4f6",
                          borderRadius: 10,
                          padding: "8px 10px",
                          opacity: maxReached ? 0.6 : 1,
                        }}
                      >
                        <input
                          type="checkbox"
                          checked={selected}
                          disabled={maxReached}
                          onChange={(e) =>
                            setBoardPreviewFields((arr) =>
                              e.target.checked
                                ? [...arr, h].slice(0, 5)
                                : arr.filter((x) => x !== h)
                            )
                          }
                        />
                        <span>{opportunityFieldLabel(h)}</span>
                      </label>
                    );
                  })}
              </div>
            ) : (
              <div style={{ display: "grid", gap: 8 }}>
                {(oppColumnOrder.length
                  ? oppColumnOrder
                  : [...BASE_OPP_COLS, ...oppCustomFieldIds]).map((h, idx, arr) => (
                  <div
                    key={h}
                    draggable
                    onDragStart={() => setOppDragIndex(idx)}
                    onDragOver={(e) => e.preventDefault()}
                    onDrop={() => {
                      if (oppDragIndex != null) moveOppColumn(oppDragIndex, idx);
                      setOppDragIndex(null);
                    }}
                    style={{
                      display: "grid",
                      gridTemplateColumns: "auto 1fr auto auto",
                      alignItems: "center",
                      gap: 8,
                      border: "1px solid #f3f4f6",
                      borderRadius: 10,
                      padding: "6px 8px",
                    }}
                  >
                    <span style={{ cursor: "grab", opacity: 0.7 }} title="גרור לשינוי סדר">
                      ⋮⋮
                    </span>
                    <label style={{ display: "flex", alignItems: "center", gap: 8 }}>
                      <input
                        type="checkbox"
                        checked={oppVisibleCols.includes(h)}
                        onChange={(e) =>
                          setOppVisibleCols((vis) =>
                            e.target.checked ? Array.from(new Set([...vis, h])) : vis.filter((x) => x !== h)
                          )
                        }
                      />
                      <span>{h}</span>
                    </label>
                    <button
                      type="button"
                      onClick={() => moveOppColumn(idx, idx - 1)}
                      disabled={idx === 0}
                      style={{
                        border: "1px solid #e5e7eb",
                        background: "#fff",
                        borderRadius: 8,
                        padding: "4px 7px",
                        cursor: idx === 0 ? "default" : "pointer",
                        opacity: idx === 0 ? 0.5 : 1,
                      }}
                      title="הזז למעלה"
                    >
                      ↑
                    </button>
                    <button
                      type="button"
                      onClick={() => moveOppColumn(idx, idx + 1)}
                      disabled={idx === arr.length - 1}
                      style={{
                        border: "1px solid #e5e7eb",
                        background: "#fff",
                        borderRadius: 8,
                        padding: "4px 7px",
                        cursor: idx === arr.length - 1 ? "default" : "pointer",
                        opacity: idx === arr.length - 1 ? 0.5 : 1,
                      }}
                      title="הזז למטה"
                    >
                      ↓
                    </button>
                  </div>
                ))}
              </div>
            )}
            <div style={{ marginTop: 12, display: "flex", gap: 8 }}>
              <button type="button" onClick={() => setManageOppColsOpen(false)} style={{ padding: "8px 10px", borderRadius: 10, border: "1px solid #e5e7eb", background: "#fff", cursor: "pointer" }}>סגור</button>
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
              width: "min(430px, 94vw)",
              overflow: "auto",
              background: "#fff",
              borderLeft: "1px solid #e5e7eb",
              padding: 16,
              boxShadow: "-12px 0 30px rgba(0,0,0,0.08)",
            }}
            onMouseDown={(e) => e.stopPropagation()}
          >
            <h3 style={{ margin: 0, marginBottom: 10 }}>פילטר מתקדם (הזדמנויות)</h3>
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
                    {oppDisplayCols.map((h) => (
                      <option key={h} value={h}>
                        {opportunityFieldLabel(h)}
                      </option>
                    ))}
                  </select>
                  <select
                    value={f.op}
                    onChange={(e) =>
                      setDraftAdvFilters((arr) => arr.map((x) => (x.id === f.id ? { ...x, op: e.target.value as AdvOp } : x)))
                    }
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
                      onChange={(e) =>
                        setDraftAdvFilters((arr) => arr.map((x) => (x.id === f.id ? { ...x, value: e.target.value } : x)))
                      }
                      style={{ padding: "8px 10px", borderRadius: 10, border: "1px solid #e5e7eb" }}
                    >
                      <option value="">בחר ערך</option>
                      {(advSelectValues[f.field] ?? []).map((v) => (
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
            <div style={{ marginTop: 10, display: "flex", gap: 8, flexWrap: "wrap" }}>
              <button
                type="button"
                onClick={() =>
                  setDraftAdvFilters((arr) => [
                    ...arr,
                    {
                      id: crypto.randomUUID(),
                      field: oppDisplayCols[0] ?? "name",
                      op: defaultOpForField(oppDisplayCols[0] ?? "name"),
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
                ביטול
              </button>
              <button
                type="button"
                onClick={applyAdvancedFilters}
                style={{ padding: "8px 10px", borderRadius: 10, border: "1px solid #e5e7eb", background: "#fff", cursor: "pointer" }}
              >
                החל
              </button>
            </div>
          </div>
        </div>
      )}

      {selectedOpp && (
        <div style={{ position: "fixed", inset: 0, zIndex: 96 }}>
          <div style={{ position: "absolute", inset: 0, background: "rgba(0,0,0,0.2)" }} onMouseDown={() => setSelectedOpp(null)} />
          <div
            style={{ position: "absolute", inset: 0, display: "grid", placeItems: "center", padding: 12 }}
            onMouseDown={() => setSelectedOpp(null)}
          >
            <div style={{ width: "min(980px, 96vw)", maxHeight: "92vh", overflow: "auto", background: "#fff", border: "1px solid #e5e7eb", borderRadius: 16, padding: 16 }} onMouseDown={(e) => e.stopPropagation()}>
            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 10, marginBottom: 10 }}>
              <h3 style={{ margin: 0, fontSize: 22 }}>{selectedOpp.name}</h3>
              <button
                type="button"
                onClick={() => setSelectedOpp(null)}
                style={{ border: "1px solid #e5e7eb", background: "#fff", borderRadius: 10, padding: "6px 10px", cursor: "pointer", fontWeight: 800 }}
                title="סגור"
              >
                ✕
              </button>
            </div>
            <div style={{ display: "inline-flex", border: "1px solid #e5e7eb", borderRadius: 10, overflow: "hidden", marginBottom: 10 }}>
              {(["details", "notes", "tasks", "whatsapp", "greenapi"] as const).map((t) => (
                <button key={t} type="button" onClick={() => setOppDetailTab(t)} style={{ border: "none", background: oppDetailTab === t ? "#ede9fe" : "#fff", padding: "8px 10px", cursor: "pointer", fontWeight: 800 }}>
                  {t === "details" ? "פרטים" : t === "notes" ? "פתקים" : t === "tasks" ? "משימות" : t === "whatsapp" ? "WhatsApp" : "GreenAPI"}
                </button>
              ))}
            </div>
            {oppDetailTab === "details" && (
              <div style={{ marginTop: 4, display: "grid", gap: 16 }}>
                <div style={{ border: "1px solid #f3f4f6", borderRadius: 12, padding: 12 }}>
                  <div style={{ fontWeight: 900, marginBottom: 8 }}>Contact details</div>
                  <div style={{ display: "grid", gap: 8, gridTemplateColumns: "1fr 1fr" }}>
                    <label style={{ display: "grid", gap: 4 }}>
                      <span style={{ fontSize: 12, fontWeight: 700, color: "#374151" }}>שם איש קשר</span>
                      <input value={selectedOpp.contactName ?? ""} readOnly style={{ padding: "8px 10px", borderRadius: 10, border: "1px solid #e5e7eb", background: "#f9fafb" }} />
                    </label>
                    <label style={{ display: "grid", gap: 4 }}>
                      <span style={{ fontSize: 12, fontWeight: 700, color: "#374151" }}>פלאפון איש קשר</span>
                      <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                        <input
                          value={selectedOpp.contactPhone ?? ""}
                          readOnly
                          style={{
                            flex: 1,
                            minWidth: 0,
                            padding: "8px 10px",
                            borderRadius: 10,
                            border: "1px solid #e5e7eb",
                            background: "#f9fafb",
                          }}
                        />
                        {selectedOpp.contactPhone?.trim() ? (
                          <WhatsAppIconLink phone={selectedOpp.contactPhone} size={18} />
                        ) : null}
                      </div>
                    </label>
                    <label style={{ display: "grid", gap: 4, gridColumn: "1 / -1" }}>
                      <span style={{ fontSize: 12, fontWeight: 700, color: "#374151" }}>מייל איש קשר</span>
                      <input value={selectedOpp.contactEmail ?? ""} readOnly style={{ padding: "8px 10px", borderRadius: 10, border: "1px solid #e5e7eb", background: "#f9fafb" }} />
                    </label>
                    <label style={{ display: "grid", gap: 4, gridColumn: "1 / -1" }}>
                      <span style={{ fontSize: 12, fontWeight: 700, color: "#374151" }}>איש קשר ראשי (לא ניתן לשינוי)</span>
                      <input
                        value={selectedOpp.contactId}
                        readOnly
                        style={{ padding: "8px 10px", borderRadius: 10, border: "1px solid #e5e7eb", background: "#f9fafb" }}
                      />
                    </label>
                    <button
                      type="button"
                      onClick={() => {
                        const id = selectedOpp.contactId;
                        if (!id) return;
                        window.location.href = `/contacts?openContactId=${encodeURIComponent(id)}`;
                      }}
                      style={{ gridColumn: "1 / -1", padding: "8px 10px", borderRadius: 10, border: "1px solid #e5e7eb", background: "#fff", cursor: "pointer", fontWeight: 800 }}
                    >
                      פתח איש קשר
                    </button>
                  </div>
                </div>

                <div style={{ border: "1px solid #f3f4f6", borderRadius: 12, padding: 12 }}>
                  <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 8 }}>
                    <div style={{ fontWeight: 900 }}>Opportunity details</div>
                    <div style={{ flex: 1 }} />
                    <button
                      type="button"
                      onClick={() => {
                        window.location.href = "/settings/fields";
                      }}
                      style={{
                        border: "1px solid #e5e7eb",
                        background: "#fff",
                        borderRadius: 8,
                        padding: "6px 8px",
                        cursor: "pointer",
                        fontWeight: 700,
                        fontSize: 12,
                      }}
                    >
                      ניהול שדות
                    </button>
                  </div>
                  <div style={{ display: "grid", gap: 8, gridTemplateColumns: "1fr 1fr" }}>
                <label style={{ display: "grid", gap: 4, gridColumn: "1 / -1" }}>
                  <span style={{ fontSize: 12, fontWeight: 700, color: "#374151" }}>שם הזדמנות</span>
                  <input value={selectedOpp.name} onChange={(e) => setSelectedOpp((x) => (x ? { ...x, name: e.target.value } : x))} style={{ padding: "8px 10px", borderRadius: 10, border: "1px solid #e5e7eb" }} />
                </label>
                <label style={{ display: "grid", gap: 4 }}>
                  <span style={{ fontSize: 12, fontWeight: 700, color: "#374151" }}>מייל</span>
                  <input value={selectedOpp.email ?? ""} onChange={(e) => setSelectedOpp((x) => (x ? { ...x, email: e.target.value } : x))} style={{ padding: "8px 10px", borderRadius: 10, border: "1px solid #e5e7eb" }} />
                </label>
                <label style={{ display: "grid", gap: 4 }}>
                  <span style={{ fontSize: 12, fontWeight: 700, color: "#374151" }}>פלאפון</span>
                  <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                    <input
                      value={selectedOpp.phone ?? ""}
                      onChange={(e) => setSelectedOpp((x) => (x ? { ...x, phone: e.target.value } : x))}
                      style={{
                        flex: 1,
                        minWidth: 0,
                        padding: "8px 10px",
                        borderRadius: 10,
                        border: "1px solid #e5e7eb",
                      }}
                    />
                    {selectedOpp.phone?.trim() ? <WhatsAppIconLink phone={selectedOpp.phone} size={18} /> : null}
                  </div>
                </label>
                <label style={{ display: "grid", gap: 4 }}>
                  <span style={{ fontSize: 12, fontWeight: 700, color: "#374151" }}>שלב בפייפליין</span>
                  <select value={selectedOpp.stage} onChange={(e) => setSelectedOpp((x) => (x ? { ...x, stage: e.target.value } : x))} style={{ padding: "8px 10px", borderRadius: 10, border: "1px solid #e5e7eb" }}>
                    {(selectedOppPipeline?.stages ?? []).map((s) => <option key={s} value={s}>{s}</option>)}
                  </select>
                </label>
                <label style={{ display: "grid", gap: 4 }}>
                  <span style={{ fontSize: 12, fontWeight: 700, color: "#374151" }}>סטטוס</span>
                  <select
                    value={selectedOpp.status ?? "פתוח"}
                    onChange={(e) => {
                      const next = e.target.value as "פתוח" | "זכיה" | "הפסד";
                      if (!selectedOpp) return;
                      const prev = selectedOpp.status ?? "פתוח";
                      setSelectedOpp((x) => (x ? { ...x, status: next } : x));
                      void saveOpportunityPatch(
                        selectedOpp.id,
                        { status: next },
                        { fromDetail: true, showSavedToast: true, prevStatusBeforeSave: prev }
                      );
                    }}
                    style={{ padding: "8px 10px", borderRadius: 10, border: "1px solid #e5e7eb" }}
                  >
                    {["פתוח", "זכיה", "הפסד"].map((s) => (
                      <option key={s} value={s}>{s}</option>
                    ))}
                  </select>
                </label>
                <label style={{ display: "grid", gap: 4 }}>
                  <span style={{ fontSize: 12, fontWeight: 700, color: "#374151" }}>נציג משויך</span>
                  <select value={selectedOpp.assignedRep ?? ""} onChange={(e) => setSelectedOpp((x) => (x ? { ...x, assignedRep: e.target.value } : x))} style={{ padding: "8px 10px", borderRadius: 10, border: "1px solid #e5e7eb" }}>
                    <option value="">לא משויך</option>
                    {adminUsers.map((u) => (
                      <option key={u.email} value={u.email}>{u.name?.trim() || u.email}</option>
                    ))}
                  </select>
                </label>
                <label style={{ display: "grid", gap: 4 }}>
                  <span style={{ fontSize: 12, fontWeight: 700, color: "#374151" }}>utm_source</span>
                  <input value={selectedOpp.utmSource ?? ""} onChange={(e) => setSelectedOpp((x) => (x ? { ...x, utmSource: e.target.value } : x))} style={{ padding: "8px 10px", borderRadius: 10, border: "1px solid #e5e7eb" }} />
                </label>
                <label style={{ display: "grid", gap: 4 }}>
                  <span style={{ fontSize: 12, fontWeight: 700, color: "#374151" }}>utm_campaign</span>
                  <input value={selectedOpp.utmCampaign ?? ""} onChange={(e) => setSelectedOpp((x) => (x ? { ...x, utmCampaign: e.target.value } : x))} style={{ padding: "8px 10px", borderRadius: 10, border: "1px solid #e5e7eb" }} />
                </label>
                <label style={{ display: "grid", gap: 4 }}>
                  <span style={{ fontSize: 12, fontWeight: 700, color: "#374151" }}>utm_medium</span>
                  <input value={selectedOpp.utmMedium ?? ""} onChange={(e) => setSelectedOpp((x) => (x ? { ...x, utmMedium: e.target.value } : x))} style={{ padding: "8px 10px", borderRadius: 10, border: "1px solid #e5e7eb" }} />
                </label>
                <label style={{ display: "grid", gap: 4 }}>
                  <span style={{ fontSize: 12, fontWeight: 700, color: "#374151" }}>utm_content</span>
                  <input value={selectedOpp.utmContent ?? ""} onChange={(e) => setSelectedOpp((x) => (x ? { ...x, utmContent: e.target.value } : x))} style={{ padding: "8px 10px", borderRadius: 10, border: "1px solid #e5e7eb" }} />
                </label>
                <label style={{ display: "grid", gap: 4, gridColumn: "1 / -1" }}>
                  <span style={{ fontSize: 12, fontWeight: 700, color: "#374151" }}>landingpage</span>
                  <input value={selectedOpp.landingpage ?? ""} onChange={(e) => setSelectedOpp((x) => (x ? { ...x, landingpage: e.target.value } : x))} style={{ padding: "8px 10px", borderRadius: 10, border: "1px solid #e5e7eb" }} />
                </label>
                <div style={{ display: "grid", gap: 8, gridColumn: "1 / -1" }}>
                  <span style={{ fontSize: 12, fontWeight: 700, color: "#374151" }}>תגיות (labelIds)</span>
                  <LabelPicker
                    labels={catalogLabels}
                    selectedIds={detailLabelIds}
                    onToggle={(id) =>
                      setDetailLabelIds((prev) =>
                        prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]
                      )
                    }
                    onCreate={async (name, color) => {
                      const res = await fetch("/api/labels", {
                        method: "POST",
                        credentials: "include",
                        headers: { "Content-Type": "application/json" },
                        body: JSON.stringify({ name, color }),
                      });
                      const j = (await res.json().catch(() => ({}))) as {
                        ok?: boolean;
                        label?: { id: string; name: string; color: string };
                      };
                      if (!res.ok || !j.ok || !j.label) throw new Error("יצירת תגית נכשלה");
                      setCatalogLabels((prev) =>
                        [...prev, j.label!].sort((a, b) => a.name.localeCompare(b.name, "he"))
                      );
                      setDetailLabelIds((prev) => [...prev, j.label!.id]);
                    }}
                    maxHeight={220}
                  />
                </div>
                {oppCustomFieldIds.map((fid) => (
                  <label key={fid} style={{ display: "grid", gap: 4, gridColumn: "1 / -1" }}>
                    <span style={{ fontSize: 12, fontWeight: 700, color: "#374151" }}>{opportunityFieldLabel(fid)}</span>
                    {fid === MOVER_OPPORTUNITY_FIELD_IDS.leadsCount ? (
                      <input
                        type="number"
                        min={0}
                        value={
                          (selectedOpp.customValues ?? {})[fid] === undefined ||
                          (selectedOpp.customValues ?? {})[fid] === null
                            ? ""
                            : String((selectedOpp.customValues ?? {})[fid])
                        }
                        onChange={(e) => {
                          const v = e.target.value.trim();
                          const n = v === "" ? 0 : Number.parseInt(v, 10);
                          setSelectedOpp((x) =>
                            x
                              ? {
                                  ...x,
                                  customValues: {
                                    ...(x.customValues ?? {}),
                                    [fid]: v === "" || Number.isNaN(n) ? 0 : n,
                                  },
                                }
                              : x
                          );
                        }}
                        style={{ padding: "8px 10px", borderRadius: 10, border: "1px solid #e5e7eb" }}
                      />
                    ) : (
                      <input
                        value={String((selectedOpp.customValues ?? {})[fid] ?? "")}
                        onChange={(e) =>
                          setSelectedOpp((x) =>
                            x
                              ? {
                                  ...x,
                                  customValues: { ...(x.customValues ?? {}), [fid]: e.target.value },
                                }
                              : x
                          )
                        }
                        style={{ padding: "8px 10px", borderRadius: 10, border: "1px solid #e5e7eb" }}
                      />
                    )}
                  </label>
                ))}
                <button
                  type="button"
                  onClick={() => {
                    const prev = selectedOpp.status ?? "פתוח";
                    void saveOpportunityPatch(
                      selectedOpp.id,
                      {
                        name: selectedOpp.name,
                        email: selectedOpp.email ?? "",
                        phone: selectedOpp.phone ?? "",
                        stage: selectedOpp.stage,
                        status: selectedOpp.status ?? "פתוח",
                        pipelineId: selectedOpp.pipelineId,
                        assignedRep: selectedOpp.assignedRep ?? "",
                        utmSource: selectedOpp.utmSource ?? "",
                        utmCampaign: selectedOpp.utmCampaign ?? "",
                        utmMedium: selectedOpp.utmMedium ?? "",
                        utmContent: selectedOpp.utmContent ?? "",
                        landingpage: selectedOpp.landingpage ?? "",
                        labelIds: detailLabelIds,
                        customValues: selectedOpp.customValues ?? {},
                      },
                      { fromDetail: true, showSavedToast: true, prevStatusBeforeSave: prev }
                    );
                  }}
                  style={{
                    gridColumn: "1 / -1",
                    padding: "9px 12px",
                    borderRadius: 10,
                    border: "none",
                    background: "linear-gradient(180deg, #a78bfa 0%, #6d28d9 100%)",
                    color: "#fff",
                    fontWeight: 800,
                    cursor: "pointer",
                  }}
                >
                  שמור ועדכן
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setOppDeleteConfirm("");
                    setOppDeleteOpen(true);
                  }}
                  style={{
                    gridColumn: "1 / -1",
                    padding: "9px 12px",
                    borderRadius: 10,
                    border: "1px solid #fecaca",
                    background: "#fff",
                    color: "#b91c1c",
                    fontWeight: 800,
                    cursor: "pointer",
                  }}
                >
                  מחק הזדמנות
                </button>
                  </div>
                </div>
              </div>
            )}
            {oppDetailTab === "notes" && (
              <div style={{ marginTop: 12, display: "grid", gap: 8 }}>
                {oppNotes.map((n) => (
                  <div key={n.id} style={{ border: "1px solid #e5e7eb", borderRadius: 10, padding: 10, background: "#fff" }}>
                    <div
                      style={{
                        marginBottom: 8,
                        fontSize: 12,
                        fontWeight: 700,
                        color: "#111827",
                        display: "flex",
                        flexWrap: "wrap",
                        alignItems: "baseline",
                        gap: "4px 10px",
                      }}
                    >
                      <span style={{ color: "#4b5563", fontWeight: 600 }}>תאריך (ב-CRM):</span>
                      <span dir="ltr">{formatIsraelDateTime(n.createdAt)}</span>
                      <span style={{ color: "#6b7280", fontWeight: 500 }}>
                        · {n.createdBy ?? "משתמש CRM"}
                      </span>
                    </div>
                    <div style={{ whiteSpace: "pre-wrap", lineHeight: 1.55 }}>{n.text}</div>
                    {(n.attachments ?? []).length > 0 ? (
                      <div style={{ marginTop: 8, display: "flex", flexWrap: "wrap", gap: 8 }}>
                        {(n.attachments ?? []).map((a) => (
                          <a
                            key={a.id}
                            href={a.url}
                            target="_blank"
                            rel="noopener noreferrer"
                            style={{ fontSize: 12, fontWeight: 800, color: "#4c1d95" }}
                          >
                            📎 {a.fileName}
                          </a>
                        ))}
                      </div>
                    ) : null}
                  </div>
                ))}
                <input
                  type="file"
                  multiple
                  onChange={(e) => setNewOppNoteFiles(Array.from(e.target.files ?? []))}
                  style={{ fontSize: 12 }}
                />
                {newOppNoteFiles.length > 0 ? (
                  <div style={{ fontSize: 11, color: "#6b7280" }}>
                    {newOppNoteFiles.map((f) => f.name).join(", ")}
                  </div>
                ) : null}
                <textarea
                  value={newOppNoteText}
                  onChange={(e) => setNewOppNoteText(e.target.value)}
                  placeholder="כתוב פתק חדש..."
                  style={{ minHeight: 140, padding: "10px 12px", borderRadius: 10, border: "1px solid #e5e7eb", lineHeight: 1.55 }}
                />
                <button
                  type="button"
                  disabled={oppNoteUploading}
                  onClick={() => {
                    void (async () => {
                      const text = newOppNoteText.trim();
                      if (!text && newOppNoteFiles.length === 0) return;
                      setOppNoteUploading(true);
                      setErr(null);
                      try {
                        const attachments: Array<{ id: string; fileName: string; url: string }> = [];
                        for (const f of newOppNoteFiles) {
                          const fd = new FormData();
                          fd.set("file", f);
                          const res = await fetch("/api/uploads/note-attachment", {
                            method: "POST",
                            body: fd,
                            credentials: "include",
                          });
                          const j = (await res.json().catch(() => ({}))) as {
                            ok?: boolean;
                            error?: string;
                            attachment?: { id: string; fileName: string; url: string };
                          };
                          if (!res.ok || !j.ok || !j.attachment) {
                            throw new Error(j.error ?? "העלאת קובץ נכשלה");
                          }
                          attachments.push(j.attachment);
                        }
                        const noteText = text || (attachments.length ? "מסמך מצורף" : "");
                        const notes = [
                          ...oppNotes,
                          {
                            id: crypto.randomUUID(),
                            text: noteText,
                            createdAt: new Date().toISOString(),
                            createdBy: "CRM User",
                            ...(attachments.length ? { attachments } : {}),
                          },
                        ];
                        setOppNotes(notes);
                        setNewOppNoteText("");
                        setNewOppNoteFiles([]);
                        void saveOpportunityPatch(selectedOpp.id, { notes }, { fromDetail: true });
                      } catch (e) {
                        setErr(e instanceof Error ? e.message : "הוספת פתק נכשלה");
                      } finally {
                        setOppNoteUploading(false);
                      }
                    })();
                  }}
                  style={{ padding: "8px 10px", borderRadius: 10, border: "1px solid #e5e7eb", background: "#fff", cursor: "pointer" }}
                >
                  {oppNoteUploading ? "מעלה..." : "+ הוסף פתק"}
                </button>
              </div>
            )}
            {oppDetailTab === "tasks" && (
              <div style={{ marginTop: 12, display: "grid", gap: 8 }}>
                {oppTasks.map((t) => (
                  <div
                    key={t.id}
                    style={{
                      display: "flex",
                      alignItems: "center",
                      gap: 8,
                      padding: "8px 10px",
                      borderRadius: 10,
                      border: "1px solid #e5e7eb",
                      flexWrap: "wrap",
                    }}
                  >
                    <input
                      type="checkbox"
                      checked={Boolean((t.status ?? (t.done ? "done" : "todo")) === "done")}
                      onChange={(e) => {
                        const tasks = oppTasks.map((x) =>
                          x.id === t.id
                            ? {
                                ...x,
                                done: e.target.checked,
                                status: (e.target.checked ? "done" : "todo") as "done" | "todo",
                              }
                            : x
                        );
                        setOppTasks(tasks);
                        void saveOpportunityPatch(selectedOpp.id, { tasks }, { fromDetail: true });
                      }}
                    />
                    <span style={{ fontWeight: 700, flex: 1, minWidth: 120 }}>{t.title}</span>
                    <span style={{ color: "#6b7280", fontSize: 12 }}>
                      {t.dueAt ? formatIsraelDateTime(t.dueAt) : "—"}
                    </span>
                    {t.reminderAt ? (
                      <span style={{ color: "#7c3aed", fontSize: 11 }}>
                        תזכורת: {formatIsraelDateTime(t.reminderAt)}
                      </span>
                    ) : null}
                    <button
                      type="button"
                      onClick={() => setOppTaskModal({ mode: "edit", task: t })}
                      style={{
                        padding: "6px 10px",
                        borderRadius: 8,
                        border: "1px solid #e5e7eb",
                        background: "#fff",
                        cursor: "pointer",
                        fontWeight: 700,
                        fontSize: 12,
                      }}
                    >
                      ערוך
                    </button>
                  </div>
                ))}
                <button
                  type="button"
                  onClick={() => setOppTaskModal({ mode: "new" })}
                  style={{ padding: "8px 10px", borderRadius: 10, border: "1px solid #e5e7eb", background: "#fff", cursor: "pointer" }}
                >
                  + הוסף משימה
                </button>
              </div>
            )}
            {oppDetailTab === "whatsapp" && (
              <div style={{ marginTop: 12 }}>
                <WhatsAppChatPanel phone={selectedOpp.contactPhone ?? ""} />
              </div>
            )}
            {oppDetailTab === "greenapi" && (
              <div style={{ marginTop: 12 }}>
                <GreenApiChatPanel phone={selectedOpp.contactPhone ?? ""} />
              </div>
            )}
          </div></div>
        </div>
      )}

      {oppTaskModal && selectedOpp && (
        <div
          style={{
            position: "fixed",
            inset: 0,
            zIndex: 105,
            background: "rgba(0,0,0,0.35)",
            display: "grid",
            placeItems: "center",
            padding: 16,
          }}
          onMouseDown={() => setOppTaskModal(null)}
        >
          <div
            style={{
              width: "min(440px, 94vw)",
              background: "#fff",
              borderRadius: 16,
              border: "1px solid #e5e7eb",
              padding: 16,
              boxShadow: "0 20px 50px rgba(0,0,0,0.12)",
            }}
            onMouseDown={(e) => e.stopPropagation()}
          >
            <h3 style={{ margin: "0 0 12px", fontSize: 17, fontWeight: 900 }}>
              {oppTaskModal.mode === "new" ? "משימה חדשה" : "עריכת משימה"}
            </h3>
            <div style={{ display: "grid", gap: 8 }}>
              <input
                value={oppTfTitle}
                onChange={(e) => setOppTfTitle(e.target.value)}
                placeholder="כותרת"
                style={{ padding: "8px 10px", borderRadius: 10, border: "1px solid #e5e7eb" }}
              />
              <label style={{ fontWeight: 700, fontSize: 12 }}>דדליין (אופציונלי)</label>
              <input
                type="datetime-local"
                value={oppTfDue}
                onChange={(e) => setOppTfDue(e.target.value)}
                style={{ padding: "8px 10px", borderRadius: 10, border: "1px solid #e5e7eb" }}
              />
              <label style={{ fontWeight: 700, fontSize: 12 }}>תזכורת (אופציונלי)</label>
              <input
                type="datetime-local"
                value={oppTfRem}
                onChange={(e) => setOppTfRem(e.target.value)}
                style={{ padding: "8px 10px", borderRadius: 10, border: "1px solid #e5e7eb" }}
              />
              {oppGcalLoading ? (
                <p style={{ margin: 0, fontSize: 12, color: "#6b7280" }}>בודק חיבור ל-Google Calendar...</p>
              ) : oppGcalConnected ? (
                <div
                  style={{
                    border: "1px solid #e9d5ff",
                    borderRadius: 12,
                    padding: 10,
                    background: "#faf5ff",
                  }}
                >
                  <label style={{ display: "flex", alignItems: "center", gap: 8, fontWeight: 700, fontSize: 13 }}>
                    <input
                      type="checkbox"
                      checked={oppSyncGcal}
                      onChange={(e) => setOppSyncGcal(e.target.checked)}
                    />
                    סנכרן ל-Google Calendar
                  </label>
                  <p style={{ margin: "6px 0 8px", fontSize: 11, color: "#6b7280" }}>
                    נדרש דדליין. האירוע לפי הדדליין; תזכורת — התראה ב-Google לפני הדדליין.
                  </p>
                  <label style={{ fontWeight: 700, fontSize: 12 }}>לוח יעד</label>
                  <select
                    value={oppGcalCalId}
                    onChange={(e) => setOppGcalCalId(e.target.value)}
                    style={{
                      width: "100%",
                      marginTop: 4,
                      padding: "8px 10px",
                      borderRadius: 10,
                      border: "1px solid #e5e7eb",
                    }}
                  >
                    {oppGcalList.length === 0 ? (
                      <option value="primary">ראשי (primary)</option>
                    ) : (
                      oppGcalList.map((c) => (
                        <option key={c.id} value={c.id}>
                          {(c.summary ?? c.id) + (c.primary ? " ★" : "")}
                        </option>
                      ))
                    )}
                  </select>
                </div>
              ) : (
                <p style={{ margin: 0, fontSize: 12, color: "#6b7280" }}>
                  <a href="/calendar" style={{ color: "#5b21b6", fontWeight: 700 }}>
                    חברו Google Calendar
                  </a>{" "}
                  כדי לסנכרן משימות.
                </p>
              )}
              <select
                value={oppTfStatus}
                onChange={(e) =>
                  setOppTfStatus(e.target.value as "todo" | "in_progress" | "done")
                }
                style={{ padding: "8px 10px", borderRadius: 10, border: "1px solid #e5e7eb" }}
              >
                <option value="todo">To Do</option>
                <option value="in_progress">In Progress</option>
                <option value="done">Done</option>
              </select>
              <p style={{ margin: 0, fontSize: 11, color: "#6b7280" }}>
                15 דקות לפני הדדליין נשלחת תזכורת אוטומטית לוובהוק (בנוסף לתזכורת שתקבעו).
              </p>
              <div style={{ display: "flex", gap: 8, marginTop: 8 }}>
                <button
                  type="button"
                  disabled={!oppTfTitle.trim()}
                  onClick={() => {
                    const dueIso = oppTfDue.trim() ? fromLocalInputOppTask(oppTfDue) : "";
                    const remIso = oppTfRem.trim() ? fromLocalInputOppTask(oppTfRem) : "";
                    const title = oppTfTitle.trim();
                    if (!title) return;
                    const id = selectedOpp.id;
                    const syncOk =
                      oppGcalConnected && oppSyncGcal && Boolean(dueIso.trim());
                    const gcalFields = syncOk
                      ? { syncToGoogleCalendar: true as const, googleCalendarId: oppGcalCalId }
                      : {};
                    if (oppTaskModal.mode === "new") {
                      const tasks = [
                        ...oppTasks,
                        {
                          id: crypto.randomUUID(),
                          title,
                          dueAt: dueIso,
                          reminderAt: remIso,
                          done: oppTfStatus === "done",
                          status: oppTfStatus,
                          comments: [] as Array<{ id: string; text: string; createdAt: string }>,
                          createdAt: new Date().toISOString(),
                          ...gcalFields,
                        },
                      ];
                      setOppTasks(tasks);
                      void saveOpportunityPatch(id, { tasks }, { fromDetail: true });
                    } else {
                      const tid = oppTaskModal.task.id;
                      const tasks = oppTasks.map((x) =>
                        x.id === tid
                          ? {
                              ...x,
                              title,
                              dueAt: dueIso,
                              reminderAt: remIso,
                              done: oppTfStatus === "done",
                              status: oppTfStatus,
                              ...gcalFields,
                              ...(!syncOk
                                ? {
                                    syncToGoogleCalendar: false,
                                    googleCalendarId: undefined,
                                    googleEventId: undefined,
                                  }
                                : {}),
                            }
                          : x
                      );
                      setOppTasks(tasks);
                      void saveOpportunityPatch(id, { tasks }, { fromDetail: true });
                    }
                    setOppTaskModal(null);
                  }}
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
                  שמור
                </button>
                <button
                  type="button"
                  onClick={() => setOppTaskModal(null)}
                  style={{ padding: "9px 12px", borderRadius: 10, border: "1px solid #e5e7eb", background: "#fff", cursor: "pointer" }}
                >
                  ביטול
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {bulkDeleteOpen && (
        <div
          style={{
            position: "fixed",
            inset: 0,
            zIndex: 110,
            background: "rgba(0,0,0,0.35)",
            display: "grid",
            placeItems: "center",
            padding: 16,
          }}
          onMouseDown={() => {
            if (bulkBusy) return;
            setBulkDeleteOpen(false);
            setBulkDeleteConfirm("");
          }}
        >
          <div
            style={{
              width: "min(460px, 94vw)",
              background: "#fff",
              borderRadius: 16,
              border: "1px solid #e5e7eb",
              padding: 20,
              boxShadow: "0 20px 50px rgba(0,0,0,0.12)",
            }}
            onMouseDown={(e) => e.stopPropagation()}
          >
            <div style={{ fontWeight: 900, fontSize: 18, marginBottom: 8 }}>מחיקה מרובה של הזדמנויות</div>
            <p style={{ margin: "0 0 12px", color: "#4b5563", lineHeight: 1.55, fontSize: 14 }}>
              פעולה זו תמחק לצמיתות <strong>{selectedOppIds.length}</strong> הזדמנויות. אי אפשר לבטל.
            </p>
            <p style={{ margin: "0 0 8px", fontSize: 13, fontWeight: 700 }}>
              כדי לאשר, הקלידו במדויק: <code dir="ltr">DELETE</code>
            </p>
            <input
              dir="ltr"
              value={bulkDeleteConfirm}
              onChange={(e) => setBulkDeleteConfirm(e.target.value)}
              placeholder="DELETE"
              autoComplete="off"
              style={{
                width: "100%",
                padding: "10px 12px",
                borderRadius: 10,
                border: "1px solid #e5e7eb",
                marginBottom: 14,
                fontFamily: "monospace",
              }}
            />
            <div style={{ display: "flex", gap: 10, justifyContent: "flex-end", flexWrap: "wrap" }}>
              <button
                type="button"
                onClick={() => {
                  if (bulkBusy) return;
                  setBulkDeleteOpen(false);
                  setBulkDeleteConfirm("");
                }}
                style={{
                  padding: "10px 14px",
                  borderRadius: 10,
                  border: "1px solid #e5e7eb",
                  background: "#fff",
                  cursor: bulkBusy ? "not-allowed" : "pointer",
                  fontWeight: 700,
                }}
              >
                ביטול
              </button>
              <button
                type="button"
                disabled={bulkDeleteConfirm.trim() !== "DELETE" || bulkBusy !== null}
                onClick={() => void confirmBulkDelete()}
                style={{
                  padding: "10px 14px",
                  borderRadius: 10,
                  border: "none",
                  background: bulkDeleteConfirm.trim() === "DELETE" ? "#b91c1c" : "#fca5a5",
                  color: "#fff",
                  cursor:
                    bulkDeleteConfirm.trim() === "DELETE" && bulkBusy === null
                      ? "pointer"
                      : "not-allowed",
                  fontWeight: 800,
                }}
              >
                מחק הכל (DELETE)
              </button>
            </div>
          </div>
        </div>
      )}

      {selectedOpp && oppDeleteOpen && (
        <div
          style={{
            position: "fixed",
            inset: 0,
            zIndex: 110,
            background: "rgba(0,0,0,0.35)",
            display: "grid",
            placeItems: "center",
            padding: 16,
          }}
          onMouseDown={() => {
            setOppDeleteOpen(false);
            setOppDeleteConfirm("");
          }}
        >
          <div
            style={{
              width: "min(420px, 94vw)",
              background: "#fff",
              borderRadius: 16,
              border: "1px solid #e5e7eb",
              padding: 20,
              boxShadow: "0 20px 50px rgba(0,0,0,0.12)",
            }}
            onMouseDown={(e) => e.stopPropagation()}
          >
            <div style={{ fontWeight: 900, fontSize: 18, marginBottom: 8 }}>מחיקת הזדמנות</div>
            <p style={{ margin: "0 0 12px", color: "#4b5563", lineHeight: 1.55, fontSize: 14 }}>
              פעולה זו תמחק לצמיתות את ההזדמנות <strong dir="ltr">{selectedOpp.name}</strong>. אי אפשר לבטל.
            </p>
            <p style={{ margin: "0 0 8px", fontSize: 13, fontWeight: 700 }}>
              כדי לאשר, הקלידו במדויק: <code dir="ltr">DELETE</code>
            </p>
            <input
              dir="ltr"
              value={oppDeleteConfirm}
              onChange={(e) => setOppDeleteConfirm(e.target.value)}
              placeholder="DELETE"
              autoComplete="off"
              style={{
                width: "100%",
                padding: "10px 12px",
                borderRadius: 10,
                border: "1px solid #e5e7eb",
                marginBottom: 14,
                fontFamily: "monospace",
              }}
            />
            <div style={{ display: "flex", gap: 10, justifyContent: "flex-end", flexWrap: "wrap" }}>
              <button
                type="button"
                onClick={() => {
                  setOppDeleteOpen(false);
                  setOppDeleteConfirm("");
                }}
                style={{
                  padding: "10px 14px",
                  borderRadius: 10,
                  border: "1px solid #e5e7eb",
                  background: "#fff",
                  cursor: "pointer",
                  fontWeight: 700,
                }}
              >
                ביטול
              </button>
              <button
                type="button"
                disabled={oppDeleteConfirm.trim() !== "DELETE"}
                onClick={() => void (async () => {
                  if (!selectedOpp || oppDeleteConfirm.trim() !== "DELETE") return;
                  const res = await fetch(`/api/opportunities/${encodeURIComponent(selectedOpp.id)}`, {
                    method: "DELETE",
                    credentials: "include",
                  });
                  const j = (await res.json().catch(() => ({}))) as { ok?: boolean; error?: string };
                  if (!res.ok || !j.ok) {
                    setErr(j.error ?? "מחיקת הזדמנות נכשלה");
                    return;
                  }
                  setOppDeleteOpen(false);
                  setOppDeleteConfirm("");
                  setSelectedOpp(null);
                  setToastMessage("ההזדמנות נמחקה");
                  await mutatePipeline();
                })()}
                style={{
                  padding: "10px 14px",
                  borderRadius: 10,
                  border: "none",
                  background: oppDeleteConfirm.trim() === "DELETE" ? "#b91c1c" : "#fca5a5",
                  color: "#fff",
                  cursor: oppDeleteConfirm.trim() === "DELETE" ? "pointer" : "not-allowed",
                  fontWeight: 800,
                }}
              >
                מחק (DELETE)
              </button>
            </div>
          </div>
        </div>
      )}

      {toastMessage && (
        <div
          role="status"
          aria-live="polite"
          style={{
            position: "fixed",
            bottom: 24,
            left: "50%",
            transform: "translateX(-50%)",
            zIndex: 200,
            maxWidth: "min(420px, 92vw)",
            padding: "14px 20px",
            borderRadius: 14,
            background: "#111827",
            color: "#fff",
            fontWeight: 700,
            fontSize: 15,
            boxShadow: "0 16px 40px rgba(0,0,0,0.2)",
            textAlign: "center",
            lineHeight: 1.45,
          }}
        >
          {toastMessage}
        </div>
      )}

      {confettiOn &&
        [...Array(42)].map((_, i) => (
          <div
            key={`${confettiKey}-${i}`}
            className="crm-confetti-piece"
            style={{
              left: `${(i * 41 + (confettiKey % 7) * 13) % 100}%`,
              backgroundColor: ["#a78bfa", "#f472b6", "#34d399", "#fbbf24", "#60a5fa", "#f87171"][i % 6],
              animationDelay: `${i * 0.035}s`,
            }}
          />
        ))}
    </div>
  );
}

