"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import type { AudienceCondition, AudienceLogic } from "@/lib/whatsapp/audienceFilter";
import type { WhatsAppHeaderFormat } from "@/lib/whatsapp/repo";
import { countBodyPlaceholders } from "@/lib/whatsapp/templateParams";

type TemplateVm = {
  id: string;
  name: string;
  category: string;
  language: string;
  status: string;
  bodyText?: string;
  exampleValues?: string[];
  parameterSources?: string[];
  footerText?: string;
  headerFormat?: WhatsAppHeaderFormat;
  headerText?: string;
  buttonRows?: Array<{ type: string; text: string; url?: string }>;
};

type LabelOpt = { id: string; name: string; count: number };

type PipelineOpt = { id: string; name: string };

type DraftVm = {
  id: string;
  name: string;
  templateId: string;
  parameterValues: string[];
  conditions: AudienceCondition[];
  logic: AudienceLogic;
  audiencePinnedIds?: string[];
};

type AudienceContactRow = {
  id: string;
  name: string;
  phone: string;
  email: string;
  status: string;
  marketingApproved: boolean;
};

type CampaignVm = {
  id: string;
  broadcastName?: string;
  templateId: string;
  parameterValues: string[];
};

type AudienceVm = {
  id: string;
  name: string;
  mode: "filters" | "contact_ids";
  conditions: AudienceCondition[];
  logic: AudienceLogic;
  contactIds: string[];
  sourceCampaignId?: string;
  sourceCampaignName?: string;
};

async function parseJson<T>(res: Response): Promise<T> {
  return (await res.json().catch(() => ({}))) as T;
}

function newCond(): AudienceCondition {
  return {
    id: typeof crypto !== "undefined" && crypto.randomUUID ? crypto.randomUUID() : `c-${Date.now()}`,
    field: "name",
    op: "contains",
    value: "",
  };
}

const OPS_BY_FIELD: Record<
  AudienceCondition["field"],
  AudienceCondition["op"][]
> = {
  tag: ["hasTag", "notHasTag"],
  name: ["contains", "notContains", "equals", "notEquals", "isEmpty", "notEmpty"],
  phone: ["contains", "notContains", "equals", "notEquals", "isEmpty", "notEmpty"],
  email: ["contains", "notContains", "equals", "notEquals", "isEmpty", "notEmpty"],
  status: ["equals", "notEquals"],
  pipeline: ["equals", "notEquals", "isEmpty", "notEmpty"],
  stage: ["contains", "notContains", "equals", "notEquals", "isEmpty", "notEmpty"],
  assignedRep: ["contains", "notContains", "equals", "notEquals", "isEmpty", "notEmpty"],
};

const OP_LABELS: Record<AudienceCondition["op"], string> = {
  hasTag: "יש תגית",
  notHasTag: "אין תגית",
  contains: "מכיל",
  notContains: "לא מכיל",
  equals: "שווה",
  notEquals: "לא שווה",
  isEmpty: "ריק",
  notEmpty: "לא ריק",
};

const FIELD_LABELS: Record<AudienceCondition["field"], string> = {
  tag: "תגית",
  name: "שם",
  phone: "טלפון",
  email: "אימייל",
  status: "סטטוס",
  pipeline: "פייפליין",
  stage: "שלב",
  assignedRep: "נציג",
};

export default function BroadcastNewClient() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const draftQ = searchParams.get("draft")?.trim() ?? "";
  const campaignQ = searchParams.get("campaign")?.trim() ?? "";

  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [sending, setSending] = useState(false);
  const sendInFlightRef = useRef(false);
  const sendIdempotencyKeyRef = useRef("");
  const [err, setErr] = useState<string | null>(null);
  const [okMsg, setOkMsg] = useState<string | null>(null);

  const [templates, setTemplates] = useState<TemplateVm[]>([]);
  const [labels, setLabels] = useState<LabelOpt[]>([]);
  const [pipelines, setPipelines] = useState<PipelineOpt[]>([]);
  const [audiences, setAudiences] = useState<AudienceVm[]>([]);
  const [tplSearch, setTplSearch] = useState("");

  const [broadcastName, setBroadcastName] = useState("דיוור ללא שם");
  const [templateId, setTemplateId] = useState("");
  const [parameterValuesStr, setParameterValuesStr] = useState("");
  const [logic, setLogic] = useState<AudienceLogic>("and");
  const [conditions, setConditions] = useState<AudienceCondition[]>([]);
  const [selectedAudienceId, setSelectedAudienceId] = useState("");
  const [audiencePinnedIds, setAudiencePinnedIds] = useState<string[]>([]);
  const [previewCount, setPreviewCount] = useState<number | null>(null);
  const [draftId, setDraftId] = useState<string | null>(null);
  const [audienceContacts, setAudienceContacts] = useState<AudienceContactRow[]>([]);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(() => new Set());
  const [audienceLoading, setAudienceLoading] = useState(false);
  const [audienceTruncated, setAudienceTruncated] = useState(false);

  const loadBase = useCallback(async () => {
    const [tRes, lRes, pRes, aRes] = await Promise.all([
      fetch("/api/whatsapp/templates", { credentials: "include", cache: "no-store" }),
      fetch("/api/whatsapp/audiences/tag-stats", { credentials: "include", cache: "no-store" }),
      fetch("/api/opportunities/pipelines", { credentials: "include", cache: "no-store" }),
      fetch("/api/whatsapp/audiences", { credentials: "include", cache: "no-store" }),
    ]);
    if (tRes.status === 401) {
      window.location.href = `/login?returnTo=${encodeURIComponent("/whatsapp-automations/broadcasts/new")}`;
      return;
    }
    const tj = await parseJson<{ ok?: boolean; templates?: TemplateVm[] }>(tRes);
    const lj = await parseJson<{ ok?: boolean; tagStats?: Array<{ id: string; name: string; count: number }> }>(lRes);
    const pj = await parseJson<{ ok?: boolean; pipelines?: PipelineOpt[] }>(pRes);
    const aj = await parseJson<{ ok?: boolean; audiences?: AudienceVm[] }>(aRes);
    if (tj.ok) setTemplates(tj.templates ?? []);
    if (lj.ok) setLabels((lj.tagStats ?? []).map((t) => ({ id: t.id, name: t.name, count: t.count })));
    if (pj.ok) setPipelines(pj.pipelines ?? []);
    if (aj.ok) setAudiences(aj.audiences ?? []);
  }, []);

  const loadDraft = useCallback(async () => {
    if (!draftQ) return;
    const res = await fetch("/api/whatsapp/broadcasts/drafts", { credentials: "include", cache: "no-store" });
    const j = await parseJson<{ ok?: boolean; drafts?: DraftVm[] }>(res);
    if (!j.ok || !j.drafts) return;
    const d = j.drafts.find((x) => x.id === draftQ);
    if (!d) return;
    setDraftId(d.id);
    setBroadcastName(d.name);
    setTemplateId(d.templateId);
    setParameterValuesStr(d.parameterValues.join(", "));
    setLogic(d.logic);
    setConditions(d.conditions.length ? d.conditions : []);
    if (Array.isArray(d.audiencePinnedIds) && d.audiencePinnedIds.length > 0) {
      setAudiencePinnedIds(d.audiencePinnedIds);
    }
  }, [draftQ]);

  const loadCampaign = useCallback(async () => {
    if (!campaignQ) return;
    const res = await fetch("/api/whatsapp/campaigns/send", { credentials: "include", cache: "no-store" });
    const j = await parseJson<{ ok?: boolean; campaigns?: CampaignVm[] }>(res);
    if (!j.ok || !Array.isArray(j.campaigns)) return;
    const c = j.campaigns.find((x) => x.id === campaignQ);
    if (!c) return;
    setDraftId(null);
    setBroadcastName(`שכפול: ${c.broadcastName?.trim() || "דיוור"}`);
    setTemplateId(c.templateId);
    setParameterValuesStr((c.parameterValues ?? []).join(", "));
    setLogic("and");
    setConditions([]);
  }, [campaignQ]);

  useEffect(() => {
    void (async () => {
      setLoading(true);
      setErr(null);
      try {
        await loadBase();
        await loadDraft();
        await loadCampaign();
      } catch (e) {
        setErr(e instanceof Error ? e.message : "שגיאה");
      } finally {
        setLoading(false);
      }
    })();
  }, [loadBase, loadDraft, loadCampaign]);

  const refreshAudience = useCallback(async () => {
    setErr(null);
    setAudienceLoading(true);
    try {
      const res = await fetch("/api/whatsapp/audience/preview", {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          conditions,
          logic,
          ...(audiencePinnedIds.length > 0 ? { recipientIds: audiencePinnedIds } : {}),
        }),
      });
      const j = await parseJson<{
        ok?: boolean;
        count?: number;
        contacts?: AudienceContactRow[];
        truncated?: boolean;
        error?: string;
      }>(res);
      if (!res.ok || !j.ok) throw new Error(j.error || "תצוגה מקדימה נכשלה");
      const list = j.contacts ?? [];
      setAudienceContacts(list);
      setSelectedIds(new Set(list.filter((c) => c.marketingApproved).map((c) => c.id)));
      setPreviewCount(typeof j.count === "number" ? j.count : list.length);
      setAudienceTruncated(Boolean(j.truncated));
    } catch (e) {
      setErr(e instanceof Error ? e.message : "שגיאה");
    } finally {
      setAudienceLoading(false);
    }
  }, [conditions, logic, audiencePinnedIds]);

  useEffect(() => {
    if (loading) return;
    const t = window.setTimeout(() => {
      void refreshAudience();
    }, 450);
    return () => window.clearTimeout(t);
  }, [loading, conditions, logic, audiencePinnedIds, refreshAudience]);

  function applySavedAudience(audienceId: string) {
    setSelectedAudienceId(audienceId);
    const a = audiences.find((x) => x.id === audienceId);
    if (!a) {
      setAudiencePinnedIds([]);
      return;
    }
    const pinned = Array.isArray(a.contactIds)
      ? Array.from(new Set(a.contactIds.map((x) => String(x).trim()).filter(Boolean)))
      : [];
    if (a.mode === "contact_ids") {
      setLogic("and");
      setConditions([]);
      setAudiencePinnedIds(pinned);
      return;
    }
    setLogic(a.logic === "or" ? "or" : "and");
    setConditions(Array.isArray(a.conditions) ? a.conditions : []);
    setAudiencePinnedIds(pinned);
  }

  const filteredTemplates = useMemo(() => {
    const q = tplSearch.trim().toLowerCase();
    if (!q) return templates;
    return templates.filter(
      (t) =>
        t.name.toLowerCase().includes(q) ||
        t.language.toLowerCase().includes(q) ||
        t.category.toLowerCase().includes(q)
    );
  }, [templates, tplSearch]);

  const selectedTpl = templates.find((t) => t.id === templateId);
  const manualParameterValues = useMemo(
    () =>
      parameterValuesStr
        .split(",")
        .map((x) => x.trim())
        .filter(Boolean),
    [parameterValuesStr]
  );

  const previewBodyText = useMemo(() => {
    const body = selectedTpl?.bodyText?.trim() ?? "";
    if (!body) return "";
    const sources = selectedTpl?.parameterSources ?? [];
    return body.replace(/\{\{(\d+)\}\}/g, (_, raw) => {
      const idx = Number.parseInt(String(raw), 10) - 1;
      if (idx < 0) return "";
      const src = sources[idx] ?? "manual";
      if (src === "manual") {
        return manualParameterValues[idx] ?? selectedTpl?.exampleValues?.[idx] ?? `{{${idx + 1}}}`;
      }
      return `[CRM:${src}]`;
    });
  }, [manualParameterValues, selectedTpl]);

  const previewHeaderText = useMemo(() => {
    if (!selectedTpl || (selectedTpl.headerFormat ?? "NONE") !== "TEXT") return "";
    return (selectedTpl.headerText ?? "").trim();
  }, [selectedTpl]);

  const previewFooterText = useMemo(() => (selectedTpl?.footerText ?? "").trim(), [selectedTpl]);

  const previewButtons = useMemo(() => {
    const rows = selectedTpl?.buttonRows ?? [];
    return rows
      .filter((b) => (b.text ?? "").trim())
      .slice(0, 3)
      .map((b) => ({
        type: String(b.type ?? "").toUpperCase() === "URL" ? "URL" : "QUICK_REPLY",
        text: (b.text ?? "").trim().slice(0, 25),
        url: (b.url ?? "").trim(),
      }));
  }, [selectedTpl]);

  const hasManualTemplateParams = useMemo(() => {
    if (!selectedTpl?.bodyText) return true;
    const n = countBodyPlaceholders(selectedTpl.bodyText);
    if (n === 0) return false;
    const src = selectedTpl.parameterSources ?? [];
    for (let i = 0; i < n; i++) {
      if ((src[i] ?? "manual") === "manual") return true;
    }
    return false;
  }, [selectedTpl]);

  function toggleContact(id: string) {
    const row = audienceContacts.find((c) => c.id === id);
    if (!row) return;
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) {
        next.delete(id);
        return next;
      }
      if (!row.marketingApproved) {
        const ok1 = window.confirm(
          "איש קשר זה לא פעיל לדיוור שיווקי (למשל אחרי «הסר» מהווטסאפ). סימון השורה מאפשר שליחת תבנית חד-פעמית בלבד לנמען זה, בלי לשנות את הסטטוס ב-CRM."
        );
        if (!ok1) return prev;
        const ok2 = window.confirm(
          "אישור שני: השליחה אינה מפעילה מחדש דיוור. להמשיך ולסמן את הנמען לשליחה?"
        );
        if (!ok2) return prev;
      }
      next.add(id);
      return next;
    });
  }

  function selectAllVisible() {
    setSelectedIds(new Set(audienceContacts.filter((c) => c.marketingApproved).map((c) => c.id)));
  }

  function clearSelection() {
    setSelectedIds(new Set());
  }

  async function saveDraft() {
    setSaving(true);
    setErr(null);
    setOkMsg(null);
    try {
      const parameterValues = manualParameterValues;
      const body = {
        id: draftId ?? undefined,
        name: broadcastName.trim() || "טיוטה",
        templateId,
        parameterValues,
        conditions,
        logic,
        audiencePinnedIds,
      };
      const res = await fetch("/api/whatsapp/broadcasts/drafts", {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      const j = await parseJson<{ ok?: boolean; draft?: { id: string }; error?: string }>(res);
      if (!res.ok || !j.ok || !j.draft) throw new Error(j.error || "שמירת טיוטה נכשלה");
      setDraftId(j.draft.id);
      setOkMsg("הטיוטה נשמרה.");
      router.replace(`/whatsapp-automations/broadcasts/new?draft=${encodeURIComponent(j.draft.id)}`);
    } catch (e) {
      setErr(e instanceof Error ? e.message : "שמירה נכשלה");
    } finally {
      setSaving(false);
    }
  }

  async function sendBroadcast() {
    if (sendInFlightRef.current) return;
    sendInFlightRef.current = true;
    setSending(true);
    setErr(null);
    setOkMsg(null);
    try {
      if (!sendIdempotencyKeyRef.current) {
        sendIdempotencyKeyRef.current =
          typeof crypto !== "undefined" && crypto.randomUUID
            ? crypto.randomUUID()
            : `wa-send-${Date.now()}-${Math.random().toString(36).slice(2)}`;
      }
      const parameterValues = manualParameterValues;
      if (selectedIds.size === 0) {
        throw new Error("בחרו לפחות איש קשר אחד מהרשימה.");
      }
      const selectedArr = Array.from(selectedIds);
      const oneTimeMarketingOverrideIds = selectedArr.filter((id) => {
        const row = audienceContacts.find((c) => c.id === id);
        return row && !row.marketingApproved;
      });
      const body: Record<string, unknown> = {
        broadcastName: broadcastName.trim() || undefined,
        templateId,
        parameterValues,
        conditions,
        logic,
        recipientIds: selectedArr,
        idempotencyKey: sendIdempotencyKeyRef.current,
        ...(oneTimeMarketingOverrideIds.length > 0
          ? { oneTimeMarketingOverrideIds }
          : {}),
      };
      if (draftId) {
        body.draftId = draftId;
      }
      const res = await fetch("/api/whatsapp/campaigns/send", {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      const j = await parseJson<{ ok?: boolean; error?: string }>(res);
      if (!res.ok || !j.ok) throw new Error(j.error || "שליחה נכשלה");
      setOkMsg("הדיוור נשלח. עוברים להיסטוריה.");
      router.push("/whatsapp-automations");
    } catch (e) {
      setErr(e instanceof Error ? e.message : "שליחה נכשלה");
    } finally {
      setSending(false);
      sendInFlightRef.current = false;
    }
  }

  function patchCondition(id: string, patch: Partial<AudienceCondition>) {
    setConditions((prev) => prev.map((c) => (c.id === id ? { ...c, ...patch } : c)));
  }

  function addCondition() {
    setConditions((prev) => [...prev, newCond()]);
  }

  function removeCondition(id: string) {
    setConditions((prev) => prev.filter((c) => c.id !== id));
  }

  return (
    <div>
      <div style={{ marginBottom: 14 }}>
        <Link href="/whatsapp-automations" style={{ color: "#2563eb", fontWeight: 700, fontSize: 14 }}>
          ← חזרה לברודקאסטים
        </Link>
      </div>

      {err ? (
        <div style={{ marginBottom: 12, padding: 12, borderRadius: 10, background: "#fef2f2", color: "#991b1b" }}>{err}</div>
      ) : null}
      {okMsg ? (
        <div style={{ marginBottom: 12, padding: 12, borderRadius: 10, background: "#ecfdf5", color: "#065f46" }}>{okMsg}</div>
      ) : null}

      {loading ? (
        <div style={{ color: "#6b7280" }}>טוען…</div>
      ) : (
        <div style={{ display: "grid", gap: 20 }}>
          <section
            style={{
              background: "#fff",
              border: "1px solid #e5e7eb",
              borderRadius: 16,
              padding: 18,
            }}
          >
            <h2 style={{ margin: "0 0 12px", fontSize: 18, fontWeight: 900 }}>תוכן</h2>
            <input
              value={broadcastName}
              onChange={(e) => setBroadcastName(e.target.value)}
              placeholder="שם הדיוור"
              style={{ width: "100%", maxWidth: 420, padding: "10px 12px", borderRadius: 10, border: "1px solid #e5e7eb", marginBottom: 12 }}
            />
            <div style={{ fontSize: 13, color: "#6b7280", marginBottom: 8 }}>בחר תבנית מאושרת/קיימת</div>
            <input
              value={tplSearch}
              onChange={(e) => setTplSearch(e.target.value)}
              placeholder="חיפוש תבנית לפי שם, שפה..."
              style={{ width: "100%", maxWidth: 420, padding: "8px 10px", borderRadius: 8, border: "1px solid #e5e7eb", marginBottom: 8 }}
            />
            <select
              value={templateId}
              onChange={(e) => setTemplateId(e.target.value)}
              style={{ width: "100%", maxWidth: 520, padding: "10px 12px", borderRadius: 10, border: "1px solid #e5e7eb", marginBottom: 8 }}
            >
              <option value="">— בחר תבנית —</option>
              {filteredTemplates.map((t) => (
                <option key={t.id} value={t.id}>
                  {t.name} · {t.category} · {t.language} ({t.status})
                </option>
              ))}
            </select>
            <div style={{ fontSize: 13, marginBottom: 12 }}>
              <Link href="/whatsapp-automations/templates" style={{ color: "#2563eb", fontWeight: 700 }}>
                כל התבניות / יצירת תבנית חדשה
              </Link>
            </div>
            <label style={{ display: "block", fontWeight: 700, fontSize: 13, marginBottom: 6 }}>
              פרמטרים לגוף התבנית (פסיקים לפי {"{{1}}"}, {"{{2}}"}…)
            </label>
            <p style={{ margin: "0 0 8px", fontSize: 12, color: "#6b7280", lineHeight: 1.45 }}>
              אם בתבנית הגדרתם מקור לכל פרמטר (שם, טלפון וכו׳) — הערכים ימולאו אוטומטית לכל איש קשר. פרמטרים
              שמוגדרים כ&quot;ידני&quot; נלקחים מהשדה למטה.
            </p>
            <input
              value={parameterValuesStr}
              onChange={(e) => setParameterValuesStr(e.target.value)}
              placeholder={
                hasManualTemplateParams ? "למשל: ישראל, 100 (לפרמטרים ידניים בלבד)" : "אין פרמטרים ידניים בתבנית"
              }
              disabled={!hasManualTemplateParams}
              style={{
                width: "100%",
                padding: "10px 12px",
                borderRadius: 10,
                border: "1px solid #e5e7eb",
                background: hasManualTemplateParams ? "#fff" : "#f3f4f6",
              }}
            />
            <div
              style={{
                marginTop: 14,
                border: "1px solid #d1d5db",
                borderRadius: 12,
                overflow: "hidden",
                background: "#fff",
              }}
            >
              <div
                style={{
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "space-between",
                  padding: "10px 14px",
                  borderBottom: "1px solid #e5e7eb",
                  fontWeight: 800,
                  fontSize: 14,
                  color: "#111827",
                }}
              >
                <span>תצוגה מקדימה של התבנית</span>
                <span style={{ fontSize: 12, color: "#6b7280", fontWeight: 600 }}>כמו במטא</span>
              </div>
              <div style={{ background: "#ece5dd", padding: 16 }}>
                <div
                  style={{
                    maxWidth: 320,
                    margin: "0 auto",
                    background: "#fff",
                    borderRadius: 8,
                    boxShadow: "0 1px 2px rgba(0,0,0,0.08)",
                    overflow: "hidden",
                  }}
                >
                  {previewHeaderText ? (
                    <div
                      style={{
                        padding: "10px 12px 0",
                        fontWeight: 800,
                        fontSize: 15,
                        color: "#111",
                        textAlign: "right" as const,
                      }}
                    >
                      {previewHeaderText}
                    </div>
                  ) : null}
                  <div
                    style={{
                      padding: "10px 12px",
                      whiteSpace: "pre-wrap",
                      lineHeight: 1.5,
                      fontSize: 14,
                      color: "#111",
                      textAlign: "right" as const,
                    }}
                  >
                    {previewBodyText || "בחרו תבנית כדי לראות תצוגה מקדימה."}
                  </div>
                  {previewFooterText ? (
                    <div
                      style={{
                        padding: "0 12px 8px",
                        fontSize: 12,
                        color: "#6b7280",
                        textAlign: "right" as const,
                      }}
                    >
                      {previewFooterText}
                    </div>
                  ) : null}
                  <div
                    style={{
                      fontSize: 11,
                      color: "#94a3b8",
                      textAlign: "end" as const,
                      padding: "0 12px 8px",
                    }}
                    dir="ltr"
                  >
                    {new Date().toLocaleTimeString("he-IL", { hour: "2-digit", minute: "2-digit" })}
                  </div>
                  {previewButtons.length > 0 ? (
                    <div style={{ borderTop: "1px solid #e5e7eb" }}>
                      {previewButtons.map((b, i) => (
                        <div
                          key={`${b.text}-${i}`}
                          style={{
                            padding: "10px 12px",
                            borderTop: i > 0 ? "1px solid #e5e7eb" : undefined,
                            fontSize: 14,
                            fontWeight: 600,
                            color: "#0284c7",
                            textAlign: "center" as const,
                            display: "flex",
                            alignItems: "center",
                            justifyContent: "center",
                            gap: 6,
                          }}
                        >
                          {b.type === "URL" ? (
                            <>
                              <span style={{ fontSize: 12 }}>↗</span>
                              {b.text}
                            </>
                          ) : (
                            b.text
                          )}
                        </div>
                      ))}
                    </div>
                  ) : null}
                </div>
                <p style={{ margin: "12px 0 0", fontSize: 11, color: "#78716c", textAlign: "center" }}>
                  הדמיה לפי נתוני התבנית ב-CRM — המראה הסופי בווצאפ תלוי במכשיר ובמטא.
                </p>
              </div>
            </div>
            {selectedTpl && selectedTpl.status !== "approved" ? (
              <p style={{ fontSize: 12, color: "#b45309", marginTop: 8 }}>
                התבנית לא מסומנת כ-approved — Meta עלולה לחסום שליחה עד לאישור.
              </p>
            ) : null}
          </section>

          <section
            style={{
              background: "#fff",
              border: "1px solid #e5e7eb",
              borderRadius: 16,
              padding: 18,
            }}
          >
            <h2 style={{ margin: "0 0 12px", fontSize: 18, fontWeight: 900 }}>קהל יעד</h2>
            <div style={{ display: "flex", flexWrap: "wrap", gap: 8, alignItems: "center", marginBottom: 10 }}>
              <select
                value={selectedAudienceId}
                onChange={(e) => applySavedAudience(e.target.value)}
                style={{ minWidth: 280, padding: "8px 12px", borderRadius: 10, border: "1px solid #e5e7eb" }}
              >
                <option value="">— בחר קהל שמור —</option>
                {audiences.map((a) => (
                  <option key={a.id} value={a.id}>
                    {a.name} {a.mode === "contact_ids" ? "· מדיוור קודם" : "· תנאים"}
                  </option>
                ))}
              </select>
              <Link href="/whatsapp-automations/audiences" style={{ fontSize: 13, fontWeight: 700, color: "#2563eb" }}>
                ניהול קהלים
              </Link>
            </div>
            <p style={{ margin: "0 0 12px", fontSize: 13, color: "#6b7280", lineHeight: 1.5 }}>
              הוסף תנאים (תגית, שם, טלפון וכו׳). בלי תנאים — נכללים כל אנשי הקשר. הרשימה והצ&apos;קבוקסים מתעדכנים
              אוטומטית כשמשנים תנאים. ניתן לבטל סימון ליחידים לפני שליחה. שורות באפור — לא פעילים לדיוור (סנכרון עם
              «הסר»); סימון דורש אישור כפול ושליחה חד-פעמית בלבד (בלי שינוי סטטוס — אלא אם מעדכנים באיש הקשר).
            </p>
            <select
              value={logic}
              onChange={(e) => setLogic(e.target.value as AudienceLogic)}
              style={{ padding: "8px 12px", borderRadius: 10, border: "1px solid #e5e7eb", marginBottom: 12 }}
            >
              <option value="and">וגם (AND)</option>
              <option value="or">או (OR)</option>
            </select>

            <div style={{ display: "grid", gap: 10 }}>
              {conditions.map((c) => (
                <div
                  key={c.id}
                  style={{
                    display: "grid",
                    gridTemplateColumns: "1fr 1fr 1.2fr auto",
                    gap: 8,
                    alignItems: "center",
                    flexWrap: "wrap",
                  }}
                >
                  <select
                    value={c.field}
                    onChange={(e) => {
                      const field = e.target.value as AudienceCondition["field"];
                      const ops = OPS_BY_FIELD[field];
                      patchCondition(c.id, { field, op: ops[0], value: "" });
                    }}
                    style={{ padding: "8px 10px", borderRadius: 8, border: "1px solid #e5e7eb" }}
                  >
                    {(Object.keys(FIELD_LABELS) as AudienceCondition["field"][]).map((f) => (
                      <option key={f} value={f}>{FIELD_LABELS[f]}</option>
                    ))}
                  </select>
                  <select
                    value={c.op}
                    onChange={(e) => patchCondition(c.id, { op: e.target.value as AudienceCondition["op"] })}
                    style={{ padding: "8px 10px", borderRadius: 8, border: "1px solid #e5e7eb" }}
                  >
                    {(OPS_BY_FIELD[c.field] ?? OPS_BY_FIELD.name).map((op) => (
                      <option key={op} value={op}>
                        {OP_LABELS[op] ?? op}
                      </option>
                    ))}
                  </select>
                  {c.field === "tag" ? (
                    <select
                      value={c.value}
                      onChange={(e) => patchCondition(c.id, { value: e.target.value })}
                      style={{ padding: "8px 10px", borderRadius: 8, border: "1px solid #e5e7eb" }}
                    >
                      <option value="">בחר תגית</option>
                      {labels.map((l) => (
                        <option key={l.id} value={l.id}>
                          {l.name}{l.count > 0 ? ` (${l.count})` : ""}
                        </option>
                      ))}
                    </select>
                  ) : c.field === "status" ? (
                    <select
                      value={c.value}
                      onChange={(e) => patchCondition(c.id, { value: e.target.value })}
                      style={{ padding: "8px 10px", borderRadius: 8, border: "1px solid #e5e7eb" }}
                    >
                      <option value="פתוח">פתוח</option>
                      <option value="זכיה">זכיה</option>
                      <option value="הפסד">הפסד</option>
                    </select>
                  ) : c.field === "pipeline" ? (
                    <select
                      value={c.value}
                      onChange={(e) => patchCondition(c.id, { value: e.target.value })}
                      disabled={c.op === "isEmpty" || c.op === "notEmpty"}
                      style={{ padding: "8px 10px", borderRadius: 8, border: "1px solid #e5e7eb", background: (c.op === "isEmpty" || c.op === "notEmpty") ? "#f3f4f6" : "#fff" }}
                    >
                      <option value="">בחר פייפליין</option>
                      {pipelines.map((p) => (
                        <option key={p.id} value={p.id}>{p.name}</option>
                      ))}
                    </select>
                  ) : (
                    <input
                      value={c.value}
                      onChange={(e) => patchCondition(c.id, { value: e.target.value })}
                      placeholder="ערך"
                      disabled={c.op === "isEmpty" || c.op === "notEmpty"}
                      style={{ padding: "8px 10px", borderRadius: 8, border: "1px solid #e5e7eb", background: (c.op === "isEmpty" || c.op === "notEmpty") ? "#f3f4f6" : "#fff" }}
                    />
                  )}
                  <button
                    type="button"
                    onClick={() => removeCondition(c.id)}
                    style={{
                      padding: "8px 10px",
                      borderRadius: 8,
                      border: "1px solid #fecaca",
                      background: "#fff",
                      color: "#b91c1c",
                      cursor: "pointer",
                    }}
                  >
                    הסר
                  </button>
                </div>
              ))}
            </div>

            <div style={{ display: "flex", flexWrap: "wrap", gap: 10, marginTop: 12, alignItems: "center" }}>
              <button
                type="button"
                onClick={addCondition}
                style={{
                  padding: "8px 14px",
                  borderRadius: 10,
                  border: "1px dashed #cbd5e1",
                  background: "#f8fafc",
                  fontWeight: 700,
                  cursor: "pointer",
                }}
              >
                + תנאי
              </button>
              <button
                type="button"
                onClick={() => void refreshAudience()}
                style={{
                  padding: "8px 14px",
                  borderRadius: 10,
                  border: "1px solid #bae6fd",
                  background: "#f0f9ff",
                  fontWeight: 700,
                  cursor: "pointer",
                  color: "#0369a1",
                }}
              >
                רענן רשימה
              </button>
              <button
                type="button"
                onClick={selectAllVisible}
                style={{
                  padding: "8px 14px",
                  borderRadius: 10,
                  border: "1px solid #e5e7eb",
                  background: "#fff",
                  fontWeight: 700,
                  cursor: "pointer",
                }}
              >
                סמן הכל ברשימה
              </button>
              <button
                type="button"
                onClick={clearSelection}
                style={{
                  padding: "8px 14px",
                  borderRadius: 10,
                  border: "1px solid #e5e7eb",
                  background: "#fff",
                  fontWeight: 700,
                  cursor: "pointer",
                }}
              >
                נקה בחירה
              </button>
              {previewCount !== null ? (
                <span style={{ fontWeight: 800, color: "#0f766e" }}>
                  {previewCount} תואמים · נבחרו {selectedIds.size}
                </span>
              ) : null}
              {audienceLoading ? <span style={{ color: "#6b7280", fontSize: 13 }}>מעדכן רשימה…</span> : null}
            </div>

            {audienceTruncated ? (
              <p style={{ fontSize: 12, color: "#b45309", marginTop: 10 }}>
                מוצגים עד 500 אנשי קשר ברשימה — סה״כ התאמות: {previewCount ?? "—"}.
              </p>
            ) : null}

            <div
              style={{
                marginTop: 14,
                maxHeight: 380,
                overflow: "auto",
                border: "1px solid #e5e7eb",
                borderRadius: 12,
                background: "#fafafa",
              }}
            >
              <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 13 }}>
                <thead>
                  <tr style={{ background: "#f3f4f6", position: "sticky", top: 0 }}>
                    <th style={{ padding: 8, width: 36, textAlign: "center" as const }}>בחר</th>
                    <th style={{ padding: 8, textAlign: "right" as const }}>שם</th>
                    <th style={{ padding: 8, textAlign: "right" as const }}>טלפון</th>
                    <th style={{ padding: 8, textAlign: "right" as const }}>אימייל</th>
                    <th style={{ padding: 8, textAlign: "right" as const }}>סטטוס</th>
                    <th style={{ padding: 8, textAlign: "right" as const }}>אישור דיוור</th>
                  </tr>
                </thead>
                <tbody>
                  {audienceContacts.length === 0 && !audienceLoading ? (
                    <tr>
                      <td colSpan={6} style={{ padding: 16, textAlign: "center", color: "#6b7280" }}>
                        אין אנשי קשר להצגה.
                      </td>
                    </tr>
                  ) : (
                    audienceContacts.map((c) => (
                      <tr
                        key={c.id}
                        style={{
                          borderTop: "1px solid #eee",
                          background: c.marketingApproved ? "#fff" : "#e5e7eb",
                          color: c.marketingApproved ? "#111827" : "#6b7280",
                        }}
                      >
                        <td style={{ padding: 8, textAlign: "center" }}>
                          <input
                            type="checkbox"
                            checked={selectedIds.has(c.id)}
                            onChange={() => toggleContact(c.id)}
                            aria-label={`בחר ${c.name || c.id}`}
                          />
                        </td>
                        <td style={{ padding: 8 }}>{c.name || "—"}</td>
                        <td style={{ padding: 8 }} dir="ltr">
                          {c.phone || "—"}
                        </td>
                        <td style={{ padding: 8 }} dir="ltr">
                          {c.email || "—"}
                        </td>
                        <td style={{ padding: 8 }}>{c.status || "—"}</td>
                        <td style={{ padding: 8, color: c.marketingApproved ? "#065f46" : "#b45309", fontWeight: 700 }}>
                          {c.marketingApproved ? "פעיל" : "לא פעיל"}
                        </td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
          </section>

          <div style={{ display: "flex", flexWrap: "wrap", gap: 10 }}>
            <button
              type="button"
              onClick={() => void saveDraft()}
              disabled={saving || !templateId}
              style={{
                padding: "12px 20px",
                borderRadius: 10,
                border: "1px solid #e5e7eb",
                background: "#fff",
                fontWeight: 800,
                cursor: saving ? "wait" : "pointer",
              }}
            >
              {saving ? "שומר…" : "שמור טיוטה"}
            </button>
            <button
              type="button"
              onClick={() => void sendBroadcast()}
              disabled={sending || !templateId || selectedIds.size === 0}
              style={{
                padding: "12px 22px",
                borderRadius: 10,
                border: "none",
                background: "#2563eb",
                color: "#fff",
                fontWeight: 800,
                cursor: sending ? "wait" : "pointer",
              }}
            >
              {sending ? "שולח…" : "שלח דיוור"}
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
