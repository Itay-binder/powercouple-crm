"use client";

import { useEffect, useMemo, useState } from "react";

type EntityType = "contact" | "opportunity" | "moving_order";
type FieldType =
  | "text"
  | "number"
  | "date"
  | "select"
  | "boolean"
  | "phone"
  | "email";

type CustomField = {
  id: string;
  fieldId: string;
  entityType: EntityType;
  label: string;
  type: FieldType;
  options?: string[];
  /** ריק/חסר = חל על כל הפייפליינים */
  pipelineIds?: string[];
  isRequired: boolean;
  isActive: boolean;
};

type PipelineOpt = { id: string; name: string };

type FieldScope = "all" | EntityType;
type SystemField = {
  kind: "system";
  entityType: EntityType;
  label: string;
  fieldId: string;
  type: FieldType | "readonly" | "label";
  isRequired: boolean;
  isActive: boolean;
  options?: string[];
};

const CONTACT_SYSTEM_FIELDS: SystemField[] = [
  { kind: "system", entityType: "contact", label: "שם מלא", fieldId: "contact_name", type: "text", isRequired: true, isActive: true },
  { kind: "system", entityType: "contact", label: "מייל", fieldId: "contact_email", type: "email", isRequired: false, isActive: true },
  { kind: "system", entityType: "contact", label: "פלאפון", fieldId: "contact_phone", type: "phone", isRequired: false, isActive: true },
  { kind: "system", entityType: "contact", label: "סטטוס", fieldId: "contact_status", type: "select", isRequired: false, isActive: true, options: ["פתוח", "זכיה", "הפסד"] },
  { kind: "system", entityType: "contact", label: "נציג משויך", fieldId: "contact_assigned_rep", type: "select", isRequired: false, isActive: true },
  { kind: "system", entityType: "contact", label: "תאריך יצירה", fieldId: "contact_created_at", type: "readonly", isRequired: false, isActive: true },
];

const OPPORTUNITY_SYSTEM_FIELDS: SystemField[] = [
  { kind: "system", entityType: "opportunity", label: "שם הזדמנות", fieldId: "opportunity_name", type: "text", isRequired: true, isActive: true },
  { kind: "system", entityType: "opportunity", label: "פייפליין", fieldId: "opportunity_pipeline_id", type: "select", isRequired: true, isActive: true },
  { kind: "system", entityType: "opportunity", label: "שלב בפייפליין", fieldId: "opportunity_stage", type: "select", isRequired: true, isActive: true },
  { kind: "system", entityType: "opportunity", label: "סטטוס", fieldId: "opportunity_status", type: "select", isRequired: false, isActive: true, options: ["פתוח", "זכיה", "הפסד"] },
  { kind: "system", entityType: "opportunity", label: "נציג משויך", fieldId: "opportunity_assigned_rep", type: "select", isRequired: false, isActive: true },
  { kind: "system", entityType: "opportunity", label: "מייל", fieldId: "opportunity_email", type: "email", isRequired: false, isActive: true },
  { kind: "system", entityType: "opportunity", label: "פלאפון", fieldId: "opportunity_phone", type: "phone", isRequired: false, isActive: true },
  { kind: "system", entityType: "opportunity", label: "utm_source", fieldId: "opportunity_utm_source", type: "text", isRequired: false, isActive: true },
  { kind: "system", entityType: "opportunity", label: "utm_campaign", fieldId: "opportunity_utm_campaign", type: "text", isRequired: false, isActive: true },
  { kind: "system", entityType: "opportunity", label: "utm_medium", fieldId: "opportunity_utm_medium", type: "text", isRequired: false, isActive: true },
  { kind: "system", entityType: "opportunity", label: "utm_content", fieldId: "opportunity_utm_content", type: "text", isRequired: false, isActive: true },
  { kind: "system", entityType: "opportunity", label: "landingpage", fieldId: "opportunity_landingpage", type: "text", isRequired: false, isActive: true },
  {
    kind: "system",
    entityType: "opportunity",
    label: "תגיות (labelIds)",
    fieldId: "opportunity_labelIds",
    type: "label",
    isRequired: false,
    isActive: true,
  },
  { kind: "system", entityType: "opportunity", label: "תאריך יצירה", fieldId: "opportunity_created_at", type: "readonly", isRequired: false, isActive: true },
  { kind: "system", entityType: "opportunity", label: "תאריך עדכון", fieldId: "opportunity_updated_at", type: "readonly", isRequired: false, isActive: true },
  { kind: "system", entityType: "opportunity", label: "תאריך ליד אחרון", fieldId: "opportunity_last_lead_at", type: "readonly", isRequired: false, isActive: true },
  {
    kind: "system",
    entityType: "opportunity",
    label: "מספר פניות (לידים)",
    fieldId: "opportunity_leads_count",
    type: "number",
    isRequired: false,
    isActive: true,
  },
];

const MOVING_ORDER_SYSTEM_FIELDS: SystemField[] = [
  {
    kind: "system",
    entityType: "moving_order",
    label: "מזהה הזמנה (מסמך)",
    fieldId: "moving_order_doc_order_id",
    type: "readonly",
    isRequired: false,
    isActive: true,
  },
  {
    kind: "system",
    entityType: "moving_order",
    label: "פייפליין הזמנה",
    fieldId: "moving_order_pipeline_id_sys",
    type: "readonly",
    isRequired: false,
    isActive: true,
  },
  {
    kind: "system",
    entityType: "moving_order",
    label: "שלב נוכחי",
    fieldId: "moving_order_stage_sys",
    type: "readonly",
    isRequired: false,
    isActive: true,
  },
];

/** בטננט hot-afik לא מנהלים הזמנות הובלה ולא מציגים שני שדות מערכת בהזדמנות. */
const HOT_AFIK_HIDDEN_OPPORTUNITY_SYSTEM_FIELD_IDS = new Set(["opportunity_last_lead_at", "opportunity_leads_count"]);

const LABEL_SWATCHES = [
  "#2563eb",
  "#0d9488",
  "#eab308",
  "#dc2626",
  "#7c3aed",
  "#9ca3af",
  "#92400e",
  "#ea580c",
  "#4b5563",
  "#ec4899",
];

function LabelsCatalogBlock() {
  const [items, setItems] = useState<Array<{ id: string; name: string; color: string }>>([]);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState<string | null>(null);
  const [newName, setNewName] = useState("");
  const [newColor, setNewColor] = useState(LABEL_SWATCHES[1]);
  const [saving, setSaving] = useState(false);

  async function refresh() {
    setErr(null);
    const r = await fetch("/api/labels", { credentials: "include", cache: "no-store" });
    const j = (await r.json().catch(() => ({}))) as {
      ok?: boolean;
      labels?: Array<{ id: string; name: string; color: string }>;
      error?: string;
    };
    if (!r.ok || !j.ok) {
      setErr(j.error ?? "טעינת תגיות נכשלה");
      return;
    }
    setItems(j.labels ?? []);
  }

  useEffect(() => {
    void refresh().finally(() => setLoading(false));
  }, []);

  async function createLabel() {
    const n = newName.trim();
    if (!n) return;
    setSaving(true);
    setErr(null);
    try {
      const res = await fetch("/api/labels", {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: n, color: newColor }),
      });
      const j = (await res.json().catch(() => ({}))) as { ok?: boolean; error?: string };
      if (!res.ok || !j.ok) {
        setErr(j.error ?? "יצירה נכשלה");
        return;
      }
      setNewName("");
      await refresh();
    } finally {
      setSaving(false);
    }
  }

  async function removeLabel(id: string) {
    if (!window.confirm("למחוק תגית זו מכל ההזדמנויות והאנשי קשר?")) return;
    const res = await fetch(`/api/labels/${encodeURIComponent(id)}`, {
      method: "DELETE",
      credentials: "include",
    });
    const j = (await res.json().catch(() => ({}))) as { ok?: boolean; error?: string };
    if (!res.ok || !j.ok) {
      setErr(j.error ?? "מחיקה נכשלה");
      return;
    }
    await refresh();
  }

  return (
    <div
      style={{
        background: "#fff",
        border: "1px solid #e5e7eb",
        borderRadius: 16,
        padding: 16,
        marginBottom: 14,
      }}
    >
      <h2 style={{ margin: "0 0 8px", fontSize: 17 }}>קטלוג תגיות (Labels)</h2>
      <p style={{ margin: "0 0 12px", fontSize: 13, color: "#6b7280", lineHeight: 1.5 }}>
        סוג שדה <strong>label</strong> ב-API: מערך <code>labelIds</code> על הזדמנות או איש קשר. ניהול המזהים:
        <code style={{ marginInlineStart: 6 }}>GET/POST /api/labels</code>,{" "}
        <code>PATCH/DELETE /api/labels/[id]</code>. שמות ישנים ב-<code>tags</code> עדיין מתקבלים בזמן מעבר
        ומתורגמים לפי שם תגית.
      </p>
      {err && (
        <div style={{ padding: 10, background: "#fef2f2", color: "#b91c1c", borderRadius: 10, marginBottom: 10 }}>
          {err}
        </div>
      )}
      <div style={{ display: "flex", flexWrap: "wrap", gap: 8, alignItems: "flex-end", marginBottom: 14 }}>
        <input
          value={newName}
          onChange={(e) => setNewName(e.target.value)}
          placeholder="שם תגית חדשה"
          style={{ padding: "8px 10px", borderRadius: 10, border: "1px solid #e5e7eb", minWidth: 200 }}
        />
        <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
          {LABEL_SWATCHES.map((c) => (
            <button
              key={c}
              type="button"
              onClick={() => setNewColor(c)}
              title={c}
              style={{
                width: 26,
                height: 26,
                borderRadius: "50%",
                background: c,
                border: newColor === c ? "3px solid #111" : "2px solid #fff",
                boxShadow: "0 0 0 1px #e5e7eb",
                cursor: "pointer",
                padding: 0,
              }}
            />
          ))}
        </div>
        <button
          type="button"
          disabled={saving || !newName.trim()}
          onClick={() => void createLabel()}
          style={{
            padding: "8px 14px",
            borderRadius: 10,
            border: "none",
            background: "linear-gradient(180deg, #a78bfa 0%, #6d28d9 100%)",
            color: "#fff",
            fontWeight: 800,
            cursor: saving ? "wait" : "pointer",
          }}
        >
          {saving ? "שומר…" : "הוסף תגית"}
        </button>
      </div>
      {loading ? (
        <div style={{ color: "#6b7280" }}>טוען…</div>
      ) : (
        <table style={{ width: "100%", borderCollapse: "collapse" }}>
          <thead>
            <tr>
              {["צבע", "שם", "id", "פעולות"].map((h) => (
                <th
                  key={h}
                  style={{
                    textAlign: "right",
                    padding: "8px 10px",
                    borderBottom: "2px solid #e5e7eb",
                    fontSize: 12,
                    fontWeight: 900,
                  }}
                >
                  {h}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {items.map((l) => (
              <tr key={l.id}>
                <td style={{ padding: "8px 10px", borderBottom: "1px solid #f3f4f6" }}>
                  <span
                    style={{
                      display: "inline-block",
                      width: 28,
                      height: 28,
                      borderRadius: 8,
                      background: l.color,
                      verticalAlign: "middle",
                      boxShadow: "inset 0 0 0 1px rgba(0,0,0,0.08)",
                    }}
                  />
                </td>
                <td style={{ padding: "8px 10px", borderBottom: "1px solid #f3f4f6", fontWeight: 700 }}>
                  {l.name}
                </td>
                <td style={{ padding: "8px 10px", borderBottom: "1px solid #f3f4f6" }}>
                  <code style={{ fontSize: 11 }}>{l.id}</code>
                </td>
                <td style={{ padding: "8px 10px", borderBottom: "1px solid #f3f4f6" }}>
                  <button
                    type="button"
                    onClick={() => void removeLabel(l.id)}
                    style={{
                      padding: "4px 8px",
                      borderRadius: 8,
                      border: "1px solid #fecaca",
                      background: "#fff",
                      color: "#b91c1c",
                      cursor: "pointer",
                      fontSize: 12,
                    }}
                  >
                    מחק
                  </button>
                </td>
              </tr>
            ))}
            {items.length === 0 && (
              <tr>
                <td colSpan={4} style={{ padding: 14, color: "#6b7280" }}>
                  אין תגיות — צור את הראשונה למעלה.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      )}
    </div>
  );
}

type FieldsClientProps = { tenantId?: string | null };

export default function FieldsClient({ tenantId = null }: FieldsClientProps) {
  const isHotAfikFieldsTenant = tenantId === "hot-afik";

  const [scope, setScope] = useState<FieldScope>("all");
  const [entityType, setEntityType] = useState<EntityType>("contact");
  const [loading, setLoading] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [rows, setRows] = useState<CustomField[]>([]);
  const [pipelines, setPipelines] = useState<PipelineOpt[]>([]);

  const [label, setLabel] = useState("");
  const [fieldId, setFieldId] = useState("");
  const [type, setType] = useState<FieldType>("text");
  const [optionsText, setOptionsText] = useState("");
  const [isRequired, setIsRequired] = useState(false);
  const [isActive, setIsActive] = useState(true);
  const [saving, setSaving] = useState(false);
  const [editingFieldId, setEditingFieldId] = useState<string | null>(null);
  const [deletingFieldId, setDeletingFieldId] = useState<string | null>(null);
  const [pipelinePick, setPipelinePick] = useState<string[]>([]);
  /** false = כל הפייפליינים (שולחים pipelineIds ריק); true = רק הנבחרים ב-pipelinePick */
  const [restrictPipelines, setRestrictPipelines] = useState(false);

  const pipelineNameById = useMemo(() => new Map(pipelines.map((p) => [p.id, p.name])), [pipelines]);

  async function load() {
    setLoading(true);
    setErr(null);
    try {
      const hotAfik = isHotAfikFieldsTenant;
      const [res, pRes] = await Promise.all([
        fetch(`/api/custom-fields`, { credentials: "include", cache: "no-store" }),
        fetch(`/api/opportunities/pipelines`, { credentials: "include", cache: "no-store" }),
      ]);
      const mRes = hotAfik
        ? null
        : await fetch(`/api/opportunities/pipelines?scope=moving_order`, { credentials: "include", cache: "no-store" });
      if (res.status === 401 || pRes.status === 401 || (!hotAfik && mRes?.status === 401)) {
        window.location.href = `/login?returnTo=${encodeURIComponent(
          "/settings/fields"
        )}`;
        return;
      }
      if (res.status === 403 || pRes.status === 403 || (!hotAfik && mRes?.status === 403)) {
        window.location.href = `/pending?returnTo=${encodeURIComponent(
          "/settings/fields"
        )}`;
        return;
      }
      const pJson = (await pRes.json().catch(() => ({}))) as {
        ok?: boolean;
        pipelines?: Array<{ id: string; name: string }>;
      };
      const mJson = hotAfik
        ? { ok: false as const, pipelines: [] as Array<{ id: string; name: string }> }
        : ((await mRes!.json().catch(() => ({}))) as {
            ok?: boolean;
            pipelines?: Array<{ id: string; name: string }>;
          });
      const merged: PipelineOpt[] = [];
      const seen = new Set<string>();
      for (const list of [
        ...(pJson.ok && pJson.pipelines ? pJson.pipelines : []),
        ...(mJson.ok && mJson.pipelines ? mJson.pipelines : []),
      ]) {
        if (!seen.has(list.id)) {
          seen.add(list.id);
          merged.push({ id: list.id, name: list.name });
        }
      }
      if (merged.length) setPipelines(merged);
      const j = (await res.json().catch(() => ({}))) as {
        ok?: boolean;
        error?: string;
        fields?: CustomField[];
      };
      if (!j.ok) {
        setErr(j.error ?? "שגיאה בטעינת שדות");
        return;
      }
      setRows(j.fields ?? []);
    } catch {
      setErr("שגיאה בטעינת שדות");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    void load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tenantId]);

  useEffect(() => {
    if (isHotAfikFieldsTenant && scope === "moving_order") setScope("all");
  }, [isHotAfikFieldsTenant, scope]);

  useEffect(() => {
    if (isHotAfikFieldsTenant && entityType === "moving_order") setEntityType("contact");
  }, [isHotAfikFieldsTenant, entityType]);

  function resetForm() {
    setEditingFieldId(null);
    setLabel("");
    setFieldId("");
    setType("text");
    setOptionsText("");
    setIsRequired(false);
    setIsActive(true);
    setPipelinePick([]);
    setRestrictPipelines(false);
  }

  async function saveField() {
    setSaving(true);
    setErr(null);
    try {
      if (restrictPipelines && pipelinePick.length === 0) {
        setErr("בחר לפחות פייפליין או בטל את ההגבלה לפייפליינים");
        return;
      }
      const options =
        type === "select"
          ? optionsText
              .split(",")
              .map((s) => s.trim())
              .filter(Boolean)
          : [];

      const res = await fetch("/api/custom-fields", {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          fieldId: fieldId || undefined,
          entityType,
          label,
          type,
          options,
          pipelineIds: restrictPipelines ? pipelinePick : [],
          isRequired,
          isActive,
        }),
      });
      const j = (await res.json().catch(() => ({}))) as {
        ok?: boolean;
        error?: string;
      };
      if (!res.ok || !j.ok) {
        setErr(j.error ?? "שמירת שדה נכשלה");
        return;
      }
      resetForm();
      await load();
    } catch {
      setErr("שמירת שדה נכשלה");
    } finally {
      setSaving(false);
    }
  }

  async function removeField(fieldIdToDelete: string) {
    const ok = window.confirm(`למחוק את השדה "${fieldIdToDelete}"?`);
    if (!ok) return;
    setDeletingFieldId(fieldIdToDelete);
    setErr(null);
    try {
      const res = await fetch("/api/custom-fields", {
        method: "DELETE",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ fieldId: fieldIdToDelete }),
      });
      const j = (await res.json().catch(() => ({}))) as { ok?: boolean; error?: string };
      if (!res.ok || !j.ok) {
        setErr(j.error ?? "מחיקת שדה נכשלה");
        return;
      }
      if (editingFieldId === fieldIdToDelete) resetForm();
      await load();
    } catch {
      setErr("מחיקת שדה נכשלה");
    } finally {
      setDeletingFieldId(null);
    }
  }

  function startEditField(f: CustomField) {
    setEditingFieldId(f.fieldId);
    setEntityType(f.entityType);
    setLabel(f.label);
    setFieldId(f.fieldId);
    setType(f.type);
    setOptionsText((f.options ?? []).join(", "));
    setIsRequired(f.isRequired);
    setIsActive(f.isActive);
    const hasScope = Boolean(f.pipelineIds?.length);
    setRestrictPipelines(hasScope);
    setPipelinePick(hasScope && f.pipelineIds ? [...f.pipelineIds] : []);
    window.scrollTo({ top: 0, behavior: "smooth" });
  }

  function togglePipelinePick(id: string) {
    setPipelinePick((prev) => (prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]));
  }

  const opportunitySystemForTenant: SystemField[] = isHotAfikFieldsTenant
    ? OPPORTUNITY_SYSTEM_FIELDS.filter((f) => !HOT_AFIK_HIDDEN_OPPORTUNITY_SYSTEM_FIELD_IDS.has(f.fieldId))
    : OPPORTUNITY_SYSTEM_FIELDS;

  const systemRows: SystemField[] = [
    ...CONTACT_SYSTEM_FIELDS,
    ...opportunitySystemForTenant,
    ...(isHotAfikFieldsTenant ? [] : MOVING_ORDER_SYSTEM_FIELDS),
  ];
  const filteredSystemRows = systemRows.filter((f) => scope === "all" || f.entityType === scope);
  const rowsForTenant = isHotAfikFieldsTenant ? rows.filter((f) => f.entityType !== "moving_order") : rows;
  const filteredCustomRows = rowsForTenant.filter((f) => scope === "all" || f.entityType === scope);

  const folderTabs: Array<{ id: FieldScope; label: string }> = isHotAfikFieldsTenant
    ? [
        { id: "all", label: "כל השדות" },
        { id: "contact", label: "תיקיית אנשי קשר" },
        { id: "opportunity", label: "תיקיית הזדמנויות" },
      ]
    : [
        { id: "all", label: "כל השדות" },
        { id: "contact", label: "תיקיית אנשי קשר" },
        { id: "opportunity", label: "תיקיית הזדמנויות" },
        { id: "moving_order", label: "תיקיית הזמנות הובלה" },
      ];

  return (
    <div style={{ maxWidth: 1100 }}>
      <h1 style={{ margin: "4px 0 10px", fontSize: 20 }}>שדות מותאמים</h1>
      <LabelsCatalogBlock />
      <div
        style={{
          background: "#fff",
          border: "1px solid #e5e7eb",
          borderRadius: 16,
          padding: 16,
          marginBottom: 14,
        }}
      >
        <div
          style={{ display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap" }}
        >
          <label style={{ fontWeight: 700 }}>סוג שדה ליצירה/עריכה:</label>
          <select
            value={entityType}
            onChange={(e) => setEntityType(e.target.value as EntityType)}
            style={{
              padding: "8px 10px",
              borderRadius: 10,
              border: "1px solid #e5e7eb",
            }}
          >
            <option value="contact">Contact</option>
            <option value="opportunity">Opportunity</option>
            {!isHotAfikFieldsTenant ? <option value="moving_order">הזמנות הובלה</option> : null}
          </select>
        </div>

        <div
          style={{
            marginTop: 12,
            display: "grid",
            gap: 8,
            gridTemplateColumns: "1.3fr 1fr 1fr",
          }}
        >
          <input
            value={label}
            onChange={(e) => setLabel(e.target.value)}
            placeholder="שם שדה (label)"
            style={{
              padding: "10px 12px",
              borderRadius: 10,
              border: "1px solid #e5e7eb",
            }}
          />
          <input
            value={fieldId}
            onChange={(e) => setFieldId(e.target.value)}
            placeholder="fieldId (אופציונלי, ייווצר אוטומטית)"
            disabled={Boolean(editingFieldId)}
            style={{
              padding: "10px 12px",
              borderRadius: 10,
              border: "1px solid #e5e7eb",
            }}
          />
          <select
            value={type}
            onChange={(e) => setType(e.target.value as FieldType)}
            style={{
              padding: "10px 12px",
              borderRadius: 10,
              border: "1px solid #e5e7eb",
            }}
          >
            <option value="text">text</option>
            <option value="number">number</option>
            <option value="date">date</option>
            <option value="select">select</option>
            <option value="boolean">boolean</option>
            <option value="phone">phone</option>
            <option value="email">email</option>
          </select>
        </div>

        {type === "select" && (
          <input
            value={optionsText}
            onChange={(e) => setOptionsText(e.target.value)}
            placeholder="אפשרויות (מופרדות בפסיקים)"
            style={{
              marginTop: 8,
              width: "100%",
              padding: "10px 12px",
              borderRadius: 10,
              border: "1px solid #e5e7eb",
            }}
          />
        )}

        <div style={{ marginTop: 10, display: "flex", gap: 14 }}>
          <label style={{ display: "flex", alignItems: "center", gap: 6 }}>
            <input
              type="checkbox"
              checked={isRequired}
              onChange={(e) => setIsRequired(e.target.checked)}
            />
            <span>Required</span>
          </label>
          <label style={{ display: "flex", alignItems: "center", gap: 6 }}>
            <input
              type="checkbox"
              checked={isActive}
              onChange={(e) => setIsActive(e.target.checked)}
            />
            <span>Active</span>
          </label>
        </div>

        <div
          style={{
            marginTop: 14,
            paddingTop: 12,
            borderTop: "1px solid #f3f4f6",
          }}
        >
          <div style={{ fontWeight: 800, marginBottom: 6 }}>היקף פייפליין (אופציונלי)</div>
          <div style={{ fontSize: 12, color: "#6b7280", marginBottom: 8 }}>
            רלוונטי בעיקר לשדות על הזדמנות ולידים לפי פייפליין. ברירת מחדל: השדה חל על כל הפייפליינים.
          </div>
          {pipelines.length === 0 ? (
            <div style={{ fontSize: 13, color: "#6b7280" }}>אין פייפליינים מוגדרים — השדה יחול על כולם.</div>
          ) : (
            <>
              <label style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 8 }}>
                <input
                  type="checkbox"
                  checked={!restrictPipelines}
                  onChange={(e) => {
                    if (e.target.checked) {
                      setRestrictPipelines(false);
                      setPipelinePick([]);
                    } else {
                      setRestrictPipelines(true);
                    }
                  }}
                />
                <span>חל על כל הפייפליינים</span>
              </label>
              <label style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 8 }}>
                <input
                  type="checkbox"
                  checked={restrictPipelines}
                  onChange={(e) => {
                    if (e.target.checked) {
                      setRestrictPipelines(true);
                    } else {
                      setRestrictPipelines(false);
                      setPipelinePick([]);
                    }
                  }}
                />
                <span>רק בפייפליינים שנבחרו:</span>
              </label>
              {restrictPipelines && (
                <div
                  style={{
                    display: "flex",
                    flexWrap: "wrap",
                    gap: 8,
                    padding: "8px 0",
                  }}
                >
                  {pipelines.map((p) => (
                    <label
                      key={p.id}
                      style={{
                        display: "inline-flex",
                        alignItems: "center",
                        gap: 6,
                        border: "1px solid #e5e7eb",
                        borderRadius: 10,
                        padding: "6px 10px",
                        fontSize: 13,
                      }}
                    >
                      <input
                        type="checkbox"
                        checked={pipelinePick.includes(p.id)}
                        onChange={() => togglePipelinePick(p.id)}
                      />
                      <span>{p.name}</span>
                    </label>
                  ))}
                </div>
              )}
            </>
          )}
        </div>

        <div style={{ marginTop: 12 }}>
          <button
            type="button"
            onClick={() => void saveField()}
            disabled={saving}
            style={{
              padding: "10px 12px",
              borderRadius: 10,
              border: "none",
              background: "linear-gradient(180deg, #a78bfa 0%, #6d28d9 100%)",
              color: "#fff",
              fontWeight: 800,
              cursor: "pointer",
            }}
          >
            {saving ? "שומר..." : editingFieldId ? "שמור שינויים" : "צור שדה"}
          </button>
          {editingFieldId && (
            <button
              type="button"
              onClick={resetForm}
              style={{
                marginInlineStart: 8,
                padding: "10px 12px",
                borderRadius: 10,
                border: "1px solid #e5e7eb",
                background: "#fff",
                fontWeight: 700,
                cursor: "pointer",
              }}
            >
              ביטול עריכה
            </button>
          )}
        </div>
      </div>

      <div
        style={{
          background: "#fff",
          border: "1px solid #e5e7eb",
          borderRadius: 16,
          overflow: "auto",
        }}
      >
        <div style={{ display: "flex", alignItems: "center", gap: 8, padding: 12, borderBottom: "1px solid #f3f4f6" }}>
          <span style={{ fontWeight: 800 }}>תיקיות:</span>
          {folderTabs.map((f) => (
            <button
              key={f.id}
              type="button"
              onClick={() => setScope(f.id)}
              style={{
                border: "1px solid #e5e7eb",
                background: scope === f.id ? "#ede9fe" : "#fff",
                borderRadius: 999,
                padding: "6px 10px",
                cursor: "pointer",
                fontWeight: 700,
                fontSize: 12,
              }}
            >
              {f.label}
            </button>
          ))}
          <div style={{ flex: 1 }} />
          <span style={{ color: "#6b7280", fontSize: 12 }}>
            {filteredSystemRows.length + filteredCustomRows.length} שדות
          </span>
        </div>
        {err && (
          <div
            style={{
              padding: 12,
              background: "#fef2f2",
              color: "#b91c1c",
              borderBottom: "1px solid #fecaca",
            }}
          >
            {err}
          </div>
        )}
        <table style={{ width: "100%", borderCollapse: "collapse", minWidth: 760 }}>
          <thead>
            <tr>
              {["source", "entity", "label", "fieldId", "type", "required", "active", "options", "actions"].map(
                (h) => (
                  <th
                    key={h}
                    style={{
                      textAlign: "right",
                      padding: "10px 12px",
                      borderBottom: "2px solid #e5e7eb",
                      background: "#f8fafc",
                      fontSize: 12,
                      fontWeight: 900,
                      whiteSpace: "nowrap",
                    }}
                  >
                    {h}
                  </th>
                )
              )}
            </tr>
          </thead>
          <tbody>
            {filteredSystemRows.map((f) => (
              <tr key={`sys-${f.entityType}-${f.fieldId}`}>
                <td style={{ padding: "10px 12px", borderBottom: "1px solid #f3f4f6" }}>system</td>
                <td style={{ padding: "10px 12px", borderBottom: "1px solid #f3f4f6" }}>{f.entityType}</td>
                <td style={{ padding: "10px 12px", borderBottom: "1px solid #f3f4f6" }}>{f.label}</td>
                <td style={{ padding: "10px 12px", borderBottom: "1px solid #f3f4f6" }}><code>{f.fieldId}</code></td>
                <td style={{ padding: "10px 12px", borderBottom: "1px solid #f3f4f6" }}>{f.type}</td>
                <td style={{ padding: "10px 12px", borderBottom: "1px solid #f3f4f6" }}>{f.isRequired ? "yes" : "no"}</td>
                <td style={{ padding: "10px 12px", borderBottom: "1px solid #f3f4f6" }}>{f.isActive ? "yes" : "no"}</td>
                <td style={{ padding: "10px 12px", borderBottom: "1px solid #f3f4f6" }}>{(f.options ?? []).join(", ") || "—"}</td>
                <td style={{ padding: "10px 12px", borderBottom: "1px solid #f3f4f6", color: "#6b7280" }}>—</td>
                <td style={{ padding: "10px 12px", borderBottom: "1px solid #f3f4f6", color: "#6b7280" }}>מנוהל מערכת</td>
              </tr>
            ))}
            {filteredCustomRows.map((f) => (
              <tr key={f.id}>
                <td style={{ padding: "10px 12px", borderBottom: "1px solid #f3f4f6" }}>custom</td>
                <td style={{ padding: "10px 12px", borderBottom: "1px solid #f3f4f6" }}>{f.entityType}</td>
                <td style={{ padding: "10px 12px", borderBottom: "1px solid #f3f4f6" }}>
                  {f.label}
                </td>
                <td style={{ padding: "10px 12px", borderBottom: "1px solid #f3f4f6" }}>
                  <code>{f.fieldId}</code>
                </td>
                <td style={{ padding: "10px 12px", borderBottom: "1px solid #f3f4f6" }}>
                  {f.type}
                </td>
                <td style={{ padding: "10px 12px", borderBottom: "1px solid #f3f4f6" }}>
                  {f.isRequired ? "yes" : "no"}
                </td>
                <td style={{ padding: "10px 12px", borderBottom: "1px solid #f3f4f6" }}>
                  {f.isActive ? "yes" : "no"}
                </td>
                <td style={{ padding: "10px 12px", borderBottom: "1px solid #f3f4f6" }}>
                  {(f.options ?? []).join(", ")}
                </td>
                <td style={{ padding: "10px 12px", borderBottom: "1px solid #f3f4f6", fontSize: 12 }}>
                  {!f.pipelineIds?.length
                    ? "כל הפייפליינים"
                    : f.pipelineIds.map((id) => pipelineNameById.get(id) ?? id).join(", ")}
                </td>
                <td style={{ padding: "10px 12px", borderBottom: "1px solid #f3f4f6" }}>
                  <button
                    type="button"
                    onClick={() => startEditField(f)}
                    style={{
                      border: "1px solid #e5e7eb",
                      borderRadius: 8,
                      padding: "6px 8px",
                      background: "#fff",
                      cursor: "pointer",
                    }}
                  >
                    עריכה
                  </button>
                  <button
                    type="button"
                    onClick={() => void removeField(f.fieldId)}
                    disabled={deletingFieldId === f.fieldId}
                    style={{
                      border: "1px solid #fecaca",
                      color: "#b91c1c",
                      borderRadius: 8,
                      padding: "6px 8px",
                      background: "#fff",
                      cursor: "pointer",
                      marginInlineStart: 8,
                    }}
                  >
                    {deletingFieldId === f.fieldId ? "מוחק..." : "מחיקה"}
                  </button>
                </td>
              </tr>
            ))}
            {!loading && filteredSystemRows.length + filteredCustomRows.length === 0 && (
              <tr>
                <td
                  colSpan={10}
                  style={{
                    padding: 16,
                    color: "#6b7280",
                    fontWeight: 700,
                  }}
                >
                  אין שדות להצגה.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}

