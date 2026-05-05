"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import SettingsSectionNav from "@/app/components/SettingsSectionNav";

type Props = { baseUrl: string; showMovingOrders?: boolean };

type Cfg = {
  enabled: boolean;
  hasApiKey: boolean;
  apiKeyHint: string;
  formId: string;
  formUrl: string;
  driveParentFolderId: string;
  webhookToken: string;
  mappingsCount: number;
  updatedAt: string | null;
};

export default function JotformSettingsClient({ baseUrl, showMovingOrders }: Props) {
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [syncing, setSyncing] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [ok, setOk] = useState<string | null>(null);
  const [cfg, setCfg] = useState<Cfg | null>(null);

  const [enabled, setEnabled] = useState(false);
  const [apiKey, setApiKey] = useState("");
  const [formIdOrUrl, setFormIdOrUrl] = useState("");
  const [driveFolder, setDriveFolder] = useState("");

  const load = useCallback(async () => {
    setLoading(true);
    setErr(null);
    setOk(null);
    try {
      const res = await fetch("/api/settings/jotform", { credentials: "include", cache: "no-store" });
      const j = (await res.json().catch(() => ({}))) as { ok?: boolean; config?: Cfg; error?: string };
      if (!res.ok || !j.ok || !j.config) throw new Error(j.error ?? "טעינה נכשלה");
      setCfg(j.config);
      setEnabled(j.config.enabled);
      setFormIdOrUrl(j.config.formUrl || j.config.formId || "");
      setDriveFolder(j.config.driveParentFolderId || "");
    } catch (e) {
      setErr(e instanceof Error ? e.message : "טעינה נכשלה");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const webhookUrl = useMemo(() => {
    const token = cfg?.webhookToken?.trim() || "";
    if (!token) return "";
    const origin =
      baseUrl.trim() ||
      (typeof window !== "undefined" ? window.location.origin : "");
    return `${origin}/api/integrations/jotform/webhook?token=${encodeURIComponent(token)}`;
  }, [baseUrl, cfg?.webhookToken]);

  async function save() {
    setSaving(true);
    setErr(null);
    setOk(null);
    try {
      const res = await fetch("/api/settings/jotform", {
        method: "PUT",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          enabled,
          apiKey: apiKey.trim() || undefined,
          formIdOrUrl,
          driveParentFolderIdOrUrl: driveFolder,
        }),
      });
      const j = (await res.json().catch(() => ({}))) as { ok?: boolean; error?: string };
      if (!res.ok || !j.ok) throw new Error(j.error ?? "שמירה נכשלה");
      setApiKey("");
      await load();
      setOk("ההגדרות נשמרו.");
    } catch (e) {
      setErr(e instanceof Error ? e.message : "שמירה נכשלה");
    } finally {
      setSaving(false);
    }
  }

  async function syncFields() {
    setSyncing(true);
    setErr(null);
    setOk(null);
    try {
      const res = await fetch("/api/settings/jotform/sync-fields", {
        method: "POST",
        credentials: "include",
      });
      const j = (await res.json().catch(() => ({}))) as { ok?: boolean; mappingsCount?: number; error?: string };
      if (!res.ok || !j.ok) throw new Error(j.error ?? "סנכרון שדות נכשל");
      await load();
      setOk(`נסנכרנו ${j.mappingsCount ?? 0} שדות מהשאלון.`);
    } catch (e) {
      setErr(e instanceof Error ? e.message : "סנכרון נכשל");
    } finally {
      setSyncing(false);
    }
  }

  return (
    <div style={{ maxWidth: 900 }}>
      <SettingsSectionNav active="jotform" showMovingOrders={showMovingOrders} />
      <div style={{ background: "#fff", border: "1px solid #e5e7eb", borderRadius: 16, padding: 16 }}>
        <h1 style={{ margin: "0 0 10px", fontSize: 22 }}>חיבור Jotform</h1>
        <p style={{ margin: "0 0 14px", color: "#4b5563", lineHeight: 1.55 }}>
          החיבור יוצר/מעדכן איש קשר ולקוח אוטומטית מכל Submission, פותח תיקיית Drive בשם הלקוח ומעלה אליה מסמכים.
        </p>

        {err ? <div style={{ marginBottom: 10, padding: 10, borderRadius: 10, background: "#fef2f2", color: "#991b1b" }}>{err}</div> : null}
        {ok ? <div style={{ marginBottom: 10, padding: 10, borderRadius: 10, background: "#ecfdf5", color: "#065f46" }}>{ok}</div> : null}

        {loading ? <div>טוען…</div> : null}

        <div style={{ display: "grid", gap: 10 }}>
          <label style={{ display: "flex", alignItems: "center", gap: 8, fontWeight: 700 }}>
            <input type="checkbox" checked={enabled} onChange={(e) => setEnabled(e.target.checked)} />
            הפעלת אינטגרציית Jotform
          </label>

          <input
            value={apiKey}
            onChange={(e) => setApiKey(e.target.value)}
            placeholder={cfg?.hasApiKey ? `API Key קיים (${cfg.apiKeyHint}) — הדבק חדש להחלפה` : "Jotform API Key"}
            style={{ padding: "10px 12px", borderRadius: 10, border: "1px solid #e5e7eb" }}
          />
          <input
            value={formIdOrUrl}
            onChange={(e) => setFormIdOrUrl(e.target.value)}
            placeholder="Form URL / Form ID"
            style={{ padding: "10px 12px", borderRadius: 10, border: "1px solid #e5e7eb" }}
          />
          <input
            value={driveFolder}
            onChange={(e) => setDriveFolder(e.target.value)}
            placeholder="Parent Drive folder URL / ID"
            style={{ padding: "10px 12px", borderRadius: 10, border: "1px solid #e5e7eb" }}
          />
        </div>

        <div style={{ marginTop: 12, display: "flex", gap: 8, flexWrap: "wrap" }}>
          <button type="button" onClick={() => void save()} disabled={saving} style={{ border: "none", borderRadius: 10, padding: "10px 14px", background: "#6d28d9", color: "#fff", fontWeight: 800, cursor: "pointer" }}>
            {saving ? "שומר…" : "שמור הגדרות"}
          </button>
          <button type="button" onClick={() => void syncFields()} disabled={syncing} style={{ border: "1px solid #e5e7eb", borderRadius: 10, padding: "10px 14px", background: "#fff", fontWeight: 700, cursor: "pointer" }}>
            {syncing ? "מסנכרן…" : "סנכרן שאלון ופתח שדות מותאמים"}
          </button>
        </div>

        <div style={{ marginTop: 14, borderTop: "1px solid #f3f4f6", paddingTop: 12 }}>
          <div style={{ fontWeight: 800, marginBottom: 6 }}>Webhook URL להגדרה ב-Jotform</div>
          <textarea readOnly value={webhookUrl || "יש לשמור קודם כדי לייצר token"} style={{ width: "100%", minHeight: 60, padding: "10px 12px", borderRadius: 10, border: "1px solid #e5e7eb", fontFamily: "monospace", fontSize: 12 }} />
          <div style={{ marginTop: 6, color: "#6b7280", fontSize: 12 }}>
            שדות מסונכרנים כרגע: {cfg?.mappingsCount ?? 0}
          </div>
        </div>
      </div>
    </div>
  );
}

