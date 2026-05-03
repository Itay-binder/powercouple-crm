"use client";

import { useCallback, useEffect, useState } from "react";
import { formatIsraelDateTime } from "@/lib/datetime/formatIsrael";

// ── Types ─────────────────────────────────────────────────────────────────────

type CanvaStatus = { connected: boolean; expiresAt: string; updatedAt: string };
type CanvaDesign = { id: string; title: string; thumbnailUrl: string; updatedAt: string };

const OBJECTIVES = [
  { value: "OUTCOME_AWARENESS", label: "מודעות למותג (Awareness)" },
  { value: "OUTCOME_TRAFFIC", label: "תנועה לאתר (Traffic)" },
  { value: "OUTCOME_ENGAGEMENT", label: "מעורבות (Engagement)" },
  { value: "OUTCOME_LEADS", label: "לידים (Leads)" },
  { value: "OUTCOME_SALES", label: "מכירות (Sales / Conversions)" },
  { value: "OUTCOME_APP_PROMOTION", label: "קידום אפליקציה (App Promotion)" },
];

const OPTIMIZATION_GOALS: Record<string, Array<{ value: string; label: string }>> = {
  OUTCOME_AWARENESS: [
    { value: "REACH", label: "טווח הגעה (Reach)" },
    { value: "IMPRESSIONS", label: "חשיפות (Impressions)" },
  ],
  OUTCOME_TRAFFIC: [
    { value: "LINK_CLICKS", label: "קליקי קישור (Link Clicks)" },
    { value: "LANDING_PAGE_VIEWS", label: "צפיות בדף נחיתה (Landing Page Views)" },
  ],
  OUTCOME_ENGAGEMENT: [
    { value: "POST_ENGAGEMENT", label: "מעורבות בפוסט (Post Engagement)" },
    { value: "IMPRESSIONS", label: "חשיפות (Impressions)" },
  ],
  OUTCOME_LEADS: [
    { value: "LEAD_GENERATION", label: "יצירת לידים (Lead Generation)" },
    { value: "QUALITY_LEAD", label: "לידים איכותיים (Quality Lead)" },
  ],
  OUTCOME_SALES: [
    { value: "OFFSITE_CONVERSIONS", label: "המרות (Conversions)" },
    { value: "LINK_CLICKS", label: "קליקי קישור (Link Clicks)" },
  ],
  OUTCOME_APP_PROMOTION: [{ value: "APP_INSTALLS", label: "התקנות אפליקציה (App Installs)" }],
};

const CTA_OPTIONS = [
  { value: "LEARN_MORE", label: "למידע נוסף (Learn More)" },
  { value: "SHOP_NOW", label: "קנה עכשיו (Shop Now)" },
  { value: "SIGN_UP", label: "הירשם (Sign Up)" },
  { value: "CONTACT_US", label: "צור קשר (Contact Us)" },
  { value: "GET_QUOTE", label: "קבל הצעת מחיר (Get Quote)" },
  { value: "BOOK_TRAVEL", label: "הזמן (Book Now)" },
  { value: "DOWNLOAD", label: "הורד (Download)" },
  { value: "SUBSCRIBE", label: "הירשם לעדכונים (Subscribe)" },
  { value: "WATCH_MORE", label: "צפה עוד (Watch More)" },
  { value: "GET_OFFER", label: "קבל הצעה (Get Offer)" },
];

const COUNTRIES = [
  { code: "IL", name: "ישראל" },
  { code: "US", name: "ארה\"ב" },
  { code: "GB", name: "בריטניה" },
  { code: "DE", name: "גרמניה" },
  { code: "FR", name: "צרפת" },
  { code: "CA", name: "קנדה" },
  { code: "AU", name: "אוסטרליה" },
  { code: "BR", name: "ברזיל" },
  { code: "IN", name: "הודו" },
  { code: "AE", name: "איחוד האמירויות" },
  { code: "SA", name: "ערב הסעודית" },
];

async function parseJson<T>(res: Response): Promise<T> {
  return (await res.json().catch(() => ({}))) as T;
}

// ── Component ─────────────────────────────────────────────────────────────────

export default function CreateCampaignClient() {
  const [canvaStatus, setCanvaStatus] = useState<CanvaStatus | null>(null);
  const [canvaStatusLoading, setCanvaStatusLoading] = useState(true);
  const [disconnectingCanva, setDisconnectingCanva] = useState(false);

  const [designs, setDesigns] = useState<CanvaDesign[]>([]);
  const [designsLoading, setDesignsLoading] = useState(false);
  const [designsContinuation, setDesignsContinuation] = useState<string | undefined>();
  const [selectedDesign, setSelectedDesign] = useState<CanvaDesign | null>(null);
  const [exportingDesign, setExportingDesign] = useState(false);
  const [exportedImageUrl, setExportedImageUrl] = useState("");

  // Campaign fields
  const [campaignName, setCampaignName] = useState("");
  const [objective, setObjective] = useState("OUTCOME_LEADS");
  const [launchStatus, setLaunchStatus] = useState<"PAUSED" | "ACTIVE">("PAUSED");
  const [budgetType, setBudgetType] = useState<"daily" | "lifetime">("daily");
  const [budget, setBudget] = useState("50");
  const [adSetName, setAdSetName] = useState("");
  const [startTime, setStartTime] = useState("");
  const [endTime, setEndTime] = useState("");
  const [optimizationGoal, setOptimizationGoal] = useState("LEAD_GENERATION");
  const [bidAmount, setBidAmount] = useState("");
  const [countries, setCountries] = useState<string[]>(["IL"]);
  const [ageMin, setAgeMin] = useState("18");
  const [ageMax, setAgeMax] = useState("65");
  const [gender, setGender] = useState<"all" | "male" | "female">("all");
  const [advantageAudience, setAdvantageAudience] = useState(true);
  const [advantageCreative, setAdvantageCreative] = useState(true);
  const [adName, setAdName] = useState("");
  const [pageId, setPageId] = useState("");
  const [primaryText, setPrimaryText] = useState("");
  const [headline, setHeadline] = useState("");
  const [description, setDescription] = useState("");
  const [callToAction, setCallToAction] = useState("LEARN_MORE");
  const [websiteUrl, setWebsiteUrl] = useState("");
  const [utmSource, setUtmSource] = useState("meta");
  const [utmMedium, setUtmMedium] = useState("cpc");
  const [utmCampaign, setUtmCampaign] = useState("");
  const [utmContent, setUtmContent] = useState("");
  const [utmTerm, setUtmTerm] = useState("");

  // Local file upload
  const [uploadSource, setUploadSource] = useState<"canva" | "local">("canva");
  const [localUploading, setLocalUploading] = useState(false);
  const [localMediaType, setLocalMediaType] = useState<"image" | "video" | null>(null);
  const [localImageHash, setLocalImageHash] = useState("");
  const [localVideoId, setLocalVideoId] = useState("");
  const [localPreviewUrl, setLocalPreviewUrl] = useState("");
  const [localFileName, setLocalFileName] = useState("");

  const [submitting, setSubmitting] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [successResult, setSuccessResult] = useState<{
    campaignId: string;
    adSetId: string;
    adId: string;
  } | null>(null);

  // Sync optimization goal when objective changes
  useEffect(() => {
    const goals = OPTIMIZATION_GOALS[objective] ?? [];
    if (goals.length && !goals.find((g) => g.value === optimizationGoal)) {
      setOptimizationGoal(goals[0].value);
    }
  }, [objective, optimizationGoal]);

  const loadCanvaStatus = useCallback(async () => {
    setCanvaStatusLoading(true);
    try {
      const res = await fetch("/api/meta-ads/canva/status", { credentials: "include", cache: "no-store" });
      const j = await parseJson<{ ok?: boolean; connected?: boolean; expiresAt?: string; updatedAt?: string }>(res);
      if (res.ok && j.ok) {
        setCanvaStatus({ connected: j.connected ?? false, expiresAt: j.expiresAt ?? "", updatedAt: j.updatedAt ?? "" });
      }
    } finally {
      setCanvaStatusLoading(false);
    }
  }, []);

  useEffect(() => {
    void loadCanvaStatus();
    // Handle redirect params
    const params = new URLSearchParams(window.location.search);
    if (params.get("canva_connected") === "1") {
      window.history.replaceState({}, "", "/meta-ads");
    }
    const canvaError = params.get("canva_error");
    if (canvaError) {
      setErr(`Canva: ${decodeURIComponent(canvaError)}`);
      window.history.replaceState({}, "", "/meta-ads");
    }
  }, [loadCanvaStatus]);

  async function loadDesigns(continuation?: string) {
    setDesignsLoading(true);
    setErr(null);
    try {
      const url = `/api/meta-ads/canva/designs${continuation ? `?continuation=${encodeURIComponent(continuation)}` : ""}`;
      const res = await fetch(url, { credentials: "include", cache: "no-store" });
      const j = await parseJson<{ ok?: boolean; designs?: CanvaDesign[]; continuation?: string; error?: string }>(res);
      if (!res.ok || !j.ok) throw new Error(j.error || "טעינת עיצובים נכשלה");
      if (continuation) {
        setDesigns((prev) => [...prev, ...(j.designs ?? [])]);
      } else {
        setDesigns(j.designs ?? []);
      }
      setDesignsContinuation(j.continuation);
    } catch (e) {
      setErr(e instanceof Error ? e.message : "שגיאה");
    } finally {
      setDesignsLoading(false);
    }
  }

  async function selectDesignAndExport(design: CanvaDesign) {
    setSelectedDesign(design);
    setExportedImageUrl("");
    setExportingDesign(true);
    setErr(null);
    try {
      const res = await fetch("/api/meta-ads/canva/export", {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ designId: design.id }),
      });
      const j = await parseJson<{ ok?: boolean; imageUrl?: string; error?: string }>(res);
      if (!res.ok || !j.ok || !j.imageUrl) throw new Error(j.error || "ייצוא עיצוב נכשל");
      setExportedImageUrl(j.imageUrl);
      if (!adName) setAdName(design.title);
      if (!campaignName) setCampaignName(design.title);
    } catch (e) {
      setErr(e instanceof Error ? e.message : "ייצוא נכשל");
      setSelectedDesign(null);
    } finally {
      setExportingDesign(false);
    }
  }

  async function disconnectCanva() {
    setDisconnectingCanva(true);
    try {
      await fetch("/api/meta-ads/canva/disconnect", { method: "POST", credentials: "include" });
      setCanvaStatus({ connected: false, expiresAt: "", updatedAt: "" });
      setDesigns([]);
      setSelectedDesign(null);
      setExportedImageUrl("");
    } finally {
      setDisconnectingCanva(false);
    }
  }

  async function handleLocalFileChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    setLocalUploading(true);
    setLocalImageHash("");
    setLocalVideoId("");
    setLocalMediaType(null);
    setErr(null);
    const prev = localPreviewUrl;
    if (prev) URL.revokeObjectURL(prev);
    const preview = URL.createObjectURL(file);
    setLocalPreviewUrl(preview);
    setLocalFileName(file.name);
    try {
      const fd = new FormData();
      fd.append("file", file);
      const res = await fetch("/api/meta-ads/creative/upload", {
        method: "POST",
        credentials: "include",
        body: fd,
      });
      const j = await parseJson<{ ok?: boolean; type?: string; imageHash?: string; videoId?: string; error?: string }>(res);
      if (!res.ok || !j.ok) throw new Error(j.error || "העלאה נכשלה");
      setLocalMediaType(j.type === "video" ? "video" : "image");
      if (j.imageHash) setLocalImageHash(j.imageHash);
      if (j.videoId) setLocalVideoId(j.videoId);
      const baseName = file.name.replace(/\.[^.]+$/, "");
      if (!adName) setAdName(baseName);
      if (!campaignName) setCampaignName(baseName);
    } catch (err2) {
      setErr(err2 instanceof Error ? err2.message : "העלאה נכשלה");
      URL.revokeObjectURL(preview);
      setLocalPreviewUrl("");
    } finally {
      setLocalUploading(false);
      // reset input so same file can be re-selected
      e.target.value = "";
    }
  }

  async function submitCampaign() {
    const mediaReady = uploadSource === "canva" ? !!exportedImageUrl : !!(localImageHash || localVideoId);
    if (!mediaReady) {
      setErr(uploadSource === "canva" ? "בחר עיצוב מ-Canva תחילה" : "העלה קובץ תחילה");
      return;
    }
    if (!campaignName.trim()) { setErr("שם קמפיין נדרש"); return; }
    if (!pageId.trim()) { setErr("Facebook Page ID נדרש"); return; }
    if (!websiteUrl.trim()) { setErr("קישור יעד נדרש"); return; }
    if (!primaryText.trim()) { setErr("טקסט ראשי נדרש"); return; }
    if (!headline.trim()) { setErr("כותרת נדרשת"); return; }

    setSubmitting(true);
    setErr(null);
    setSuccessResult(null);
    try {
      const genders = gender === "male" ? [1] : gender === "female" ? [2] : [];
      const res = await fetch("/api/meta-ads/campaigns/create", {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          ...(uploadSource === "canva"
            ? { canvaImageUrl: exportedImageUrl }
            : localVideoId
            ? { videoId: localVideoId }
            : { imageHash: localImageHash }),
          campaignName: campaignName.trim(),
          objective,
          launchStatus,
          budgetType,
          budget: parseFloat(budget) || 50,
          adSetName: adSetName.trim() || `${campaignName.trim()} - Ad Set`,
          startTime: startTime || undefined,
          endTime: endTime || undefined,
          optimizationGoal,
          bidAmount: bidAmount ? parseFloat(bidAmount) : undefined,
          countries,
          ageMin: parseInt(ageMin) || 18,
          ageMax: parseInt(ageMax) || 65,
          genders,
          advantageAudience,
          advantageCreative,
          adName: adName.trim() || campaignName.trim(),
          pageId: pageId.trim(),
          primaryText: primaryText.trim(),
          headline: headline.trim(),
          description: description.trim() || undefined,
          callToAction,
          websiteUrl: websiteUrl.trim(),
          utmSource: utmSource.trim() || undefined,
          utmMedium: utmMedium.trim() || undefined,
          utmCampaign: utmCampaign.trim() || campaignName.trim().toLowerCase().replace(/\s+/g, "_"),
          utmContent: utmContent.trim() || undefined,
          utmTerm: utmTerm.trim() || undefined,
        }),
      });
      const j = await parseJson<{ ok?: boolean; campaignId?: string; adSetId?: string; adId?: string; error?: string }>(res);
      if (!res.ok || !j.ok) throw new Error(j.error || "יצירת קמפיין נכשלה");
      setSuccessResult({ campaignId: j.campaignId ?? "", adSetId: j.adSetId ?? "", adId: j.adId ?? "" });
    } catch (e) {
      setErr(e instanceof Error ? e.message : "שגיאה");
    } finally {
      setSubmitting(false);
    }
  }

  const toggleCountry = (code: string) => {
    setCountries((prev) =>
      prev.includes(code) ? prev.filter((c) => c !== code) : [...prev, code]
    );
  };

  const goals = OPTIMIZATION_GOALS[objective] ?? [];

  // ── Render ────────────────────────────────────────────────────────────────

  return (
    <div style={{ display: "grid", gap: 16 }} dir="rtl">
      {err && (
        <div style={{ padding: 12, borderRadius: 10, background: "#fef2f2", color: "#991b1b", fontSize: 14 }}>
          {err}
        </div>
      )}

      {successResult && (
        <div style={{ padding: 16, borderRadius: 12, background: "#ecfdf5", border: "1px solid #6ee7b7" }}>
          <div style={{ fontWeight: 900, color: "#065f46", marginBottom: 8 }}>הקמפיין נוצר בהצלחה!</div>
          <div style={{ fontSize: 13, color: "#047857", display: "grid", gap: 4 }}>
            <span>Campaign ID: <strong dir="ltr">{successResult.campaignId}</strong></span>
            <span>Ad Set ID: <strong dir="ltr">{successResult.adSetId}</strong></span>
            <span>Ad ID: <strong dir="ltr">{successResult.adId}</strong></span>
          </div>
          <div style={{ fontSize: 12, color: "#6b7280", marginTop: 8 }}>
            הקמפיין נשמר ב-Meta Ads Manager. תוכל לצפות בו בטאב הקמפיינים.
          </div>
        </div>
      )}

      {/* ── Source Toggle ── */}
      <div style={{ display: "flex", gap: 8 }}>
        {(["canva", "local"] as const).map((src) => (
          <button
            key={src}
            type="button"
            onClick={() => { setUploadSource(src); setErr(null); }}
            style={{
              flex: 1,
              padding: "12px 0",
              borderRadius: 12,
              border: `2px solid ${uploadSource === src ? "#7c3aed" : "#e5e7eb"}`,
              background: uploadSource === src ? "#f5f3ff" : "#fff",
              fontWeight: 800,
              fontSize: 15,
              color: uploadSource === src ? "#7c3aed" : "#6b7280",
              cursor: "pointer",
            }}
          >
            {src === "canva" ? "🎨 עיצוב מ-Canva" : "💻 העלאה מהמחשב"}
          </button>
        ))}
      </div>

      {/* ── Local File Upload ── */}
      {uploadSource === "local" && (
        <Section title="העלאת תמונה / סרטון מהמחשב">
          <div style={{ display: "grid", gap: 12 }}>
            <div style={{ fontSize: 13, color: "#4b5563" }}>
              תומך ב-JPG, PNG, GIF (תמונות) ו-MP4, MOV (סרטונים עד 4MB).
              לסרטונים גדולים יותר, העלה ישירות ב-Meta Ads Manager.
            </div>
            <label
              style={{
                display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center",
                gap: 8, padding: "28px 20px",
                border: "2px dashed #d1d5db", borderRadius: 14,
                background: "#fafafa", cursor: "pointer",
                transition: "border-color 0.15s",
              }}
              onDragOver={(e) => { e.preventDefault(); (e.currentTarget as HTMLLabelElement).style.borderColor = "#7c3aed"; }}
              onDragLeave={(e) => { (e.currentTarget as HTMLLabelElement).style.borderColor = "#d1d5db"; }}
              onDrop={(e) => {
                e.preventDefault();
                (e.currentTarget as HTMLLabelElement).style.borderColor = "#d1d5db";
                const file = e.dataTransfer.files?.[0];
                if (file) {
                  const fakeEvent = { target: { files: [file], value: "" } } as unknown as React.ChangeEvent<HTMLInputElement>;
                  void handleLocalFileChange(fakeEvent);
                }
              }}
            >
              <input
                type="file"
                accept="image/jpeg,image/png,image/gif,video/mp4,video/quicktime,video/mov"
                style={{ display: "none" }}
                onChange={(e) => void handleLocalFileChange(e)}
                disabled={localUploading}
              />
              {localUploading ? (
                <div style={{ color: "#7c3aed", fontWeight: 700 }}>מעלה ל-Meta... אנא המתן</div>
              ) : localPreviewUrl && (localImageHash || localVideoId) ? (
                <div style={{ display: "flex", alignItems: "center", gap: 12, width: "100%" }}>
                  {localMediaType === "video" ? (
                    <video
                      src={localPreviewUrl}
                      controls
                      style={{ width: 120, height: 80, objectFit: "cover", borderRadius: 8, border: "1px solid #e5e7eb" }}
                    />
                  ) : (
                    <img
                      src={localPreviewUrl}
                      alt="preview"
                      style={{ width: 80, height: 80, objectFit: "cover", borderRadius: 8, border: "1px solid #e5e7eb" }}
                    />
                  )}
                  <div>
                    <div style={{ fontWeight: 700, fontSize: 13, color: "#374151" }}>{localFileName}</div>
                    <div style={{ fontSize: 12, color: "#065f46", marginTop: 2 }}>
                      {localMediaType === "video" ? "סרטון" : "תמונה"} הועלה בהצלחה ל-Meta
                    </div>
                    <div style={{ fontSize: 11, color: "#6b7280", marginTop: 2 }}>לחץ להחלפה</div>
                  </div>
                </div>
              ) : (
                <>
                  <div style={{ fontSize: 32 }}>📁</div>
                  <div style={{ fontWeight: 700, fontSize: 14, color: "#374151" }}>גרור קובץ לכאן או לחץ לבחירה</div>
                  <div style={{ fontSize: 12, color: "#9ca3af" }}>JPG · PNG · GIF · MP4 · MOV (עד 4MB)</div>
                </>
              )}
            </label>
          </div>
        </Section>
      )}

      {/* ── Canva Connection ── */}
      {uploadSource === "canva" && (<Section title="חיבור Canva">
        {canvaStatusLoading ? (
          <div style={{ color: "#6b7280", fontSize: 13 }}>בודק חיבור...</div>
        ) : canvaStatus?.connected ? (
          <div style={{ display: "grid", gap: 10 }}>
            <StatusRow
              connected
              label="Canva מחובר"
              detail={canvaStatus.updatedAt ? `עודכן ${formatIsraelDateTime(canvaStatus.updatedAt)}` : ""}
              onDisconnect={() => void disconnectCanva()}
              disconnecting={disconnectingCanva}
            />
            {designs.length === 0 && !designsLoading && (
              <Btn onClick={() => void loadDesigns()} disabled={designsLoading}>
                טען עיצובים מ-Canva
              </Btn>
            )}
            {designs.length > 0 && (
              <div>
                <div style={{ fontWeight: 700, fontSize: 14, marginBottom: 8 }}>בחר עיצוב:</div>
                <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(160px, 1fr))", gap: 10, maxHeight: 380, overflowY: "auto", padding: 4 }}>
                  {designs.map((d) => (
                    <DesignCard
                      key={d.id}
                      design={d}
                      selected={selectedDesign?.id === d.id}
                      onClick={() => void selectDesignAndExport(d)}
                      exporting={exportingDesign && selectedDesign?.id === d.id}
                    />
                  ))}
                </div>
                {designsContinuation && (
                  <Btn onClick={() => void loadDesigns(designsContinuation)} disabled={designsLoading} style={{ marginTop: 8 }}>
                    {designsLoading ? "טוען..." : "טען עוד עיצובים"}
                  </Btn>
                )}
              </div>
            )}
            {designsLoading && designs.length === 0 && (
              <div style={{ color: "#6b7280", fontSize: 13 }}>טוען עיצובים...</div>
            )}
            {selectedDesign && exportedImageUrl && (
              <div style={{ display: "flex", alignItems: "center", gap: 10, padding: 10, background: "#f0fdf4", borderRadius: 10, border: "1px solid #6ee7b7" }}>
                <img src={exportedImageUrl} alt={selectedDesign.title} style={{ width: 60, height: 60, objectFit: "cover", borderRadius: 8, border: "1px solid #e5e7eb" }} />
                <div>
                  <div style={{ fontWeight: 700, fontSize: 13 }}>{selectedDesign.title}</div>
                  <div style={{ fontSize: 12, color: "#065f46" }}>יוצא ומוכן להעלאה ל-Meta</div>
                </div>
              </div>
            )}
            {exportingDesign && (
              <div style={{ fontSize: 13, color: "#6b7280" }}>מייצא עיצוב מ-Canva... (עד 30 שניות)</div>
            )}
          </div>
        ) : (
          <div style={{ display: "grid", gap: 8 }}>
            <div style={{ fontSize: 13, color: "#4b5563" }}>
              חבר את חשבון Canva שלך כדי לבחור עיצובים ישירות ולהעלות קמפיינים.
            </div>
            <a
              href="/api/meta-ads/canva/connect"
              style={{
                display: "inline-flex", alignItems: "center", gap: 8,
                padding: "11px 20px", borderRadius: 10, background: "#7c3aed",
                color: "#fff", fontWeight: 800, fontSize: 15, textDecoration: "none",
                alignSelf: "start",
              }}
            >
              <svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor">
                <path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm-1 14H9V8h2v8zm4 0h-2V8h2v8z" />
              </svg>
              התחבר עם Canva
            </a>
            <div style={{ fontSize: 12, color: "#6b7280" }}>
              הרשאות: קריאת עיצובים בלבד · טוקן מתחדש אוטומטית
            </div>
          </div>
        )}
      </Section>)}

      {/* ── Campaign Settings ── */}
      <Section title="הגדרות קמפיין">
        <FormGrid>
          <Field label="שם קמפיין *">
            <input value={campaignName} onChange={(e) => setCampaignName(e.target.value)} placeholder="שם הקמפיין" style={inputStyle} />
          </Field>
          <Field label="מטרת הקמפיין *">
            <select value={objective} onChange={(e) => setObjective(e.target.value)} style={inputStyle}>
              {OBJECTIVES.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
            </select>
          </Field>
          <Field label="סטטוס השקה">
            <select value={launchStatus} onChange={(e) => setLaunchStatus(e.target.value as "ACTIVE" | "PAUSED")} style={inputStyle}>
              <option value="PAUSED">מושהה (Paused) — בדוק לפני הפעלה</option>
              <option value="ACTIVE">פעיל מיד (Active)</option>
            </select>
          </Field>
        </FormGrid>
      </Section>

      {/* ── Budget & Schedule ── */}
      <Section title="תקציב ולוח זמנים">
        <FormGrid>
          <Field label="סוג תקציב">
            <select value={budgetType} onChange={(e) => setBudgetType(e.target.value as "daily" | "lifetime")} style={inputStyle}>
              <option value="daily">יומי (Daily Budget)</option>
              <option value="lifetime">כולל (Lifetime Budget)</option>
            </select>
          </Field>
          <Field label={`תקציב ${budgetType === "daily" ? "יומי" : "כולל"} (₪) *`}>
            <input value={budget} onChange={(e) => setBudget(e.target.value)} type="number" min="1" placeholder="50" dir="ltr" style={inputStyle} />
          </Field>
          <Field label="תאריך התחלה (אופציונלי)">
            <input value={startTime} onChange={(e) => setStartTime(e.target.value)} type="datetime-local" dir="ltr" style={inputStyle} />
          </Field>
          {budgetType === "lifetime" && (
            <Field label="תאריך סיום *">
              <input value={endTime} onChange={(e) => setEndTime(e.target.value)} type="datetime-local" dir="ltr" style={inputStyle} />
            </Field>
          )}
        </FormGrid>
      </Section>

      {/* ── Ad Set ── */}
      <Section title="סדרת מודעות (Ad Set)">
        <FormGrid>
          <Field label="שם סדרת מודעות">
            <input value={adSetName} onChange={(e) => setAdSetName(e.target.value)} placeholder={`${campaignName || "קמפיין"} - Ad Set`} style={inputStyle} />
          </Field>
          <Field label="מטרת אופטימיזציה *">
            <select value={optimizationGoal} onChange={(e) => setOptimizationGoal(e.target.value)} style={inputStyle}>
              {goals.map((g) => <option key={g.value} value={g.value}>{g.label}</option>)}
            </select>
          </Field>
          <Field label="Bid Cap (₪/תוצאה) — ריק = ללא תקרה">
            <input value={bidAmount} onChange={(e) => setBidAmount(e.target.value)} type="number" min="0" step="0.01" placeholder="ריק = אוטומטי" dir="ltr" style={inputStyle} />
          </Field>
        </FormGrid>
      </Section>

      {/* ── Targeting ── */}
      <Section title="קהל יעד (Targeting)">
        <div style={{ display: "grid", gap: 14 }}>
          <Field label="מדינות *">
            <div style={{ display: "flex", flexWrap: "wrap", gap: 8 }}>
              {COUNTRIES.map((c) => (
                <label key={c.code} style={{ display: "flex", alignItems: "center", gap: 4, cursor: "pointer", fontSize: 13 }}>
                  <input
                    type="checkbox"
                    checked={countries.includes(c.code)}
                    onChange={() => toggleCountry(c.code)}
                    style={{ cursor: "pointer" }}
                  />
                  {c.name} ({c.code})
                </label>
              ))}
            </div>
          </Field>
          <FormGrid>
            <Field label="גיל מינימום">
              <input value={ageMin} onChange={(e) => setAgeMin(e.target.value)} type="number" min="18" max="65" dir="ltr" style={inputStyle} />
            </Field>
            <Field label="גיל מקסימום">
              <input value={ageMax} onChange={(e) => setAgeMax(e.target.value)} type="number" min="18" max="65" dir="ltr" style={inputStyle} />
            </Field>
            <Field label="מגדר">
              <select value={gender} onChange={(e) => setGender(e.target.value as "all" | "male" | "female")} style={inputStyle}>
                <option value="all">כולם</option>
                <option value="male">גברים בלבד</option>
                <option value="female">נשים בלבד</option>
              </select>
            </Field>
          </FormGrid>
        </div>
      </Section>

      {/* ── Advantage+ AI ── */}
      <Section title="שיפורי AI — Advantage+">
        <div style={{ display: "grid", gap: 10 }}>
          <ToggleRow
            label="Advantage+ Audience"
            description="Meta מוצאת את הקהל האידיאלי אוטומטית מעבר לקהל שהגדרת"
            checked={advantageAudience}
            onChange={setAdvantageAudience}
          />
          <ToggleRow
            label="Advantage+ Creative"
            description="Meta מבצעת שיפורים אוטומטיים לקריאייטיב (ניגודיות, בהירות, כיתוב)"
            checked={advantageCreative}
            onChange={setAdvantageCreative}
          />
        </div>
      </Section>

      {/* ── Ad Creative ── */}
      <Section title="קריאייטיב המודעה">
        <FormGrid>
          <Field label="שם המודעה">
            <input value={adName} onChange={(e) => setAdName(e.target.value)} placeholder={campaignName || "שם המודעה"} style={inputStyle} />
          </Field>
          <Field label="Facebook Page ID *">
            <input value={pageId} onChange={(e) => setPageId(e.target.value)} placeholder="123456789012345" dir="ltr" style={inputStyle} />
            <div style={{ fontSize: 11, color: "#6b7280", marginTop: 3 }}>
              נמצא בהגדרות הדף ← מידע על הדף ← מזהה הדף
            </div>
          </Field>
          <Field label="קישור יעד (Destination URL) *">
            <input value={websiteUrl} onChange={(e) => setWebsiteUrl(e.target.value)} placeholder="https://yoursite.com/landing" dir="ltr" style={inputStyle} />
          </Field>
          <Field label="כפתור קריאה לפעולה (CTA)">
            <select value={callToAction} onChange={(e) => setCallToAction(e.target.value)} style={inputStyle}>
              {CTA_OPTIONS.map((c) => <option key={c.value} value={c.value}>{c.label}</option>)}
            </select>
          </Field>
        </FormGrid>
        <div style={{ marginTop: 12, display: "grid", gap: 10 }}>
          <Field label="טקסט ראשי (Primary Text) *">
            <textarea
              value={primaryText}
              onChange={(e) => setPrimaryText(e.target.value)}
              placeholder="הטקסט הראשי שיופיע מעל המודעה..."
              rows={3}
              maxLength={500}
              style={{ ...inputStyle, resize: "vertical" }}
            />
            <div style={{ fontSize: 11, color: "#6b7280", marginTop: 2 }}>{primaryText.length}/500</div>
          </Field>
          <Field label="כותרת (Headline) *">
            <input value={headline} onChange={(e) => setHeadline(e.target.value)} placeholder="כותרת קצרה וחזקה" maxLength={255} style={inputStyle} />
          </Field>
          <Field label="תיאור (Description — אופציונלי)">
            <input value={description} onChange={(e) => setDescription(e.target.value)} placeholder="פירוט קצר נוסף" maxLength={255} style={inputStyle} />
          </Field>
        </div>
      </Section>

      {/* ── UTM Parameters ── */}
      <Section title="UTM Parameters">
        <FormGrid>
          <Field label="utm_source">
            <input value={utmSource} onChange={(e) => setUtmSource(e.target.value)} placeholder="meta" dir="ltr" style={inputStyle} />
          </Field>
          <Field label="utm_medium">
            <input value={utmMedium} onChange={(e) => setUtmMedium(e.target.value)} placeholder="cpc" dir="ltr" style={inputStyle} />
          </Field>
          <Field label="utm_campaign">
            <input value={utmCampaign} onChange={(e) => setUtmCampaign(e.target.value)} placeholder="שם הקמפיין" dir="ltr" style={inputStyle} />
          </Field>
          <Field label="utm_content (אופציונלי)">
            <input value={utmContent} onChange={(e) => setUtmContent(e.target.value)} placeholder="ad_variant_1" dir="ltr" style={inputStyle} />
          </Field>
          <Field label="utm_term (אופציונלי)">
            <input value={utmTerm} onChange={(e) => setUtmTerm(e.target.value)} placeholder="keyword" dir="ltr" style={inputStyle} />
          </Field>
        </FormGrid>
        {websiteUrl && (
          <div style={{ marginTop: 10, padding: 10, background: "#f9fafb", borderRadius: 8, fontSize: 11, color: "#6b7280", wordBreak: "break-all" }} dir="ltr">
            Preview: {buildPreviewUrl(websiteUrl, { utmSource, utmMedium, utmCampaign: utmCampaign || campaignName, utmContent, utmTerm })}
          </div>
        )}
      </Section>

      {/* ── Submit ── */}
      {(() => {
        const mediaReady = uploadSource === "canva"
          ? !!exportedImageUrl
          : !!(localImageHash || localVideoId);
        return (
          <div style={{ display: "flex", gap: 12, alignItems: "center", flexWrap: "wrap" }}>
            <button
              type="button"
              onClick={() => void submitCampaign()}
              disabled={submitting || !mediaReady}
              style={{
                padding: "14px 28px",
                borderRadius: 12,
                border: "none",
                background: mediaReady ? "#1d4ed8" : "#9ca3af",
                color: "#fff",
                fontWeight: 900,
                fontSize: 16,
                cursor: submitting || !mediaReady ? "not-allowed" : "pointer",
              }}
            >
              {submitting ? "מעלה קמפיין..." : "העלה קמפיין ל-Meta"}
            </button>
            {!mediaReady && (
              <div style={{ fontSize: 13, color: "#6b7280" }}>
                {uploadSource === "canva" ? "יש לבחור עיצוב מ-Canva תחילה" : "יש להעלות תמונה/סרטון תחילה"}
              </div>
            )}
          </div>
        );
      })()}
    </div>
  );
}

// ── Sub-components ─────────────────────────────────────────────────────────────

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div style={{ background: "#fff", border: "1px solid #e5e7eb", borderRadius: 16, padding: 16 }}>
      <div style={{ fontWeight: 900, fontSize: 16, marginBottom: 14, paddingBottom: 10, borderBottom: "1px solid #f3f4f6" }}>
        {title}
      </div>
      {children}
    </div>
  );
}

function FormGrid({ children }: { children: React.ReactNode }) {
  return (
    <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(260px, 1fr))", gap: 12 }}>
      {children}
    </div>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div style={{ display: "grid", gap: 4 }}>
      <label style={{ fontSize: 13, fontWeight: 700, color: "#374151" }}>{label}</label>
      {children}
    </div>
  );
}

function Btn({
  children,
  onClick,
  disabled,
  style,
}: {
  children: React.ReactNode;
  onClick: () => void;
  disabled?: boolean;
  style?: React.CSSProperties;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      style={{
        padding: "10px 18px",
        borderRadius: 10,
        border: "none",
        background: "#7c3aed",
        color: "#fff",
        fontWeight: 800,
        cursor: disabled ? "not-allowed" : "pointer",
        opacity: disabled ? 0.7 : 1,
        alignSelf: "start",
        fontSize: 14,
        ...style,
      }}
    >
      {children}
    </button>
  );
}

function StatusRow({
  connected,
  label,
  detail,
  onDisconnect,
  disconnecting,
}: {
  connected: boolean;
  label: string;
  detail?: string;
  onDisconnect?: () => void;
  disconnecting?: boolean;
}) {
  return (
    <div style={{
      display: "flex", alignItems: "center", gap: 10,
      padding: "10px 14px", borderRadius: 10,
      background: connected ? "#ecfdf5" : "#f9fafb",
      border: `1px solid ${connected ? "#6ee7b7" : "#e5e7eb"}`,
    }}>
      <div style={{ width: 10, height: 10, borderRadius: "50%", background: connected ? "#10b981" : "#d1d5db", flexShrink: 0 }} />
      <div style={{ flex: 1, fontSize: 13 }}>
        <strong>{label}</strong>
        {detail && <span style={{ color: "#6b7280" }}> · {detail}</span>}
      </div>
      {onDisconnect && connected && (
        <button
          type="button"
          onClick={onDisconnect}
          disabled={disconnecting}
          style={{ padding: "6px 12px", borderRadius: 8, border: "1px solid #fca5a5", background: "#fff", color: "#dc2626", fontWeight: 700, fontSize: 13, cursor: "pointer" }}
        >
          {disconnecting ? "מנתק..." : "נתק"}
        </button>
      )}
    </div>
  );
}

function ToggleRow({
  label,
  description,
  checked,
  onChange,
}: {
  label: string;
  description: string;
  checked: boolean;
  onChange: (v: boolean) => void;
}) {
  return (
    <label style={{ display: "flex", alignItems: "flex-start", gap: 12, cursor: "pointer", padding: "10px 12px", borderRadius: 10, border: "1px solid #e5e7eb", background: checked ? "#eff6ff" : "#f9fafb" }}>
      <input
        type="checkbox"
        checked={checked}
        onChange={(e) => onChange(e.target.checked)}
        style={{ marginTop: 2, cursor: "pointer", width: 16, height: 16, accentColor: "#1d4ed8" }}
      />
      <div>
        <div style={{ fontWeight: 700, fontSize: 13, color: checked ? "#1d4ed8" : "#374151" }}>{label}</div>
        <div style={{ fontSize: 12, color: "#6b7280", marginTop: 2 }}>{description}</div>
      </div>
    </label>
  );
}

function DesignCard({
  design,
  selected,
  onClick,
  exporting,
}: {
  design: CanvaDesign;
  selected: boolean;
  onClick: () => void;
  exporting: boolean;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={exporting}
      style={{
        border: selected ? "2px solid #7c3aed" : "2px solid #e5e7eb",
        borderRadius: 12,
        padding: 8,
        background: selected ? "#f5f3ff" : "#fff",
        cursor: exporting ? "wait" : "pointer",
        textAlign: "right",
        transition: "border-color 0.15s",
      }}
    >
      {design.thumbnailUrl ? (
        <img
          src={design.thumbnailUrl}
          alt={design.title}
          style={{ width: "100%", height: 100, objectFit: "cover", borderRadius: 8, display: "block", marginBottom: 6 }}
        />
      ) : (
        <div style={{ width: "100%", height: 100, background: "#e5e7eb", borderRadius: 8, marginBottom: 6, display: "flex", alignItems: "center", justifyContent: "center", fontSize: 11, color: "#9ca3af" }}>
          אין תצוגה
        </div>
      )}
      <div style={{ fontSize: 12, fontWeight: 700, color: "#374151", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
        {exporting ? "מייצא..." : design.title}
      </div>
    </button>
  );
}

function buildPreviewUrl(
  base: string,
  params: { utmSource?: string; utmMedium?: string; utmCampaign?: string; utmContent?: string; utmTerm?: string }
): string {
  try {
    const url = new URL(base);
    if (params.utmSource) url.searchParams.set("utm_source", params.utmSource);
    if (params.utmMedium) url.searchParams.set("utm_medium", params.utmMedium);
    if (params.utmCampaign) url.searchParams.set("utm_campaign", params.utmCampaign);
    if (params.utmContent) url.searchParams.set("utm_content", params.utmContent);
    if (params.utmTerm) url.searchParams.set("utm_term", params.utmTerm);
    return url.toString();
  } catch {
    return base;
  }
}

const inputStyle: React.CSSProperties = {
  width: "100%",
  padding: "10px 12px",
  borderRadius: 10,
  border: "1px solid #e5e7eb",
  fontSize: 13,
  boxSizing: "border-box",
};